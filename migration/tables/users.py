"""
tables/users.py

Migrates:
  - users                  (org-scoped)
  - user_addresses         (per-user)
  - user_branches          (junction user ↔ branch)
  - user_role_assignments  (junction user ↔ role, optionally scoped to branch)
"""

from __future__ import annotations

from typing import Dict, List

import psycopg2.extras

from tables.helpers import (
    bulk_insert,
    new_cuid,
    rows_to_dicts,
    translate_excluded_branches,
)


def _remap_row_id(
    dst_cur: psycopg2.extras.DictCursor,
    table: str,
    row: dict,
    id_map: Dict[str, str],
    warnings: List[str],
) -> None:
    dst_cur.execute(f'SELECT 1 FROM "{table}" WHERE "id" = %s', (row["id"],))
    if dst_cur.fetchone():
        new_id = new_cuid()
        warnings.append(f"{table} id collision '{row['id']}'; remapped → {new_id}")
        id_map[row["id"]] = new_id
        row["id"] = new_id
    else:
        id_map.setdefault(row["id"], row["id"])


# ──────────────────────────────────────────────────────────────────────────────
# Users
# ──────────────────────────────────────────────────────────────────────────────

def migrate_users(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    # Get users with this organizationId
    src_cur.execute(
        'SELECT * FROM "users" WHERE "organizationId" = %s ORDER BY "createdAt"',
        (org_id,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    
    # Get branch IDs for this org
    src_cur.execute(
        'SELECT "id" FROM "branches" WHERE "organizationId" = %s',
        (org_id,),
    )
    branch_ids = [r["id"] for r in src_cur.fetchall()]
    
    if branch_ids:
        # Users referenced by orders
        src_cur.execute(
            'SELECT DISTINCT "userId" FROM "orders" WHERE "branchId" = ANY(%s) AND "userId" IS NOT NULL',
            (branch_ids,),
        )
        order_user_ids = [r["userId"] for r in src_cur.fetchall()]
        
        # Users referenced by branch_clicks
        src_cur.execute(
            'SELECT DISTINCT "userId" FROM "branch_clicks" WHERE "branchId" = ANY(%s) AND "userId" IS NOT NULL',
            (branch_ids,),
        )
        click_user_ids = [r["userId"] for r in src_cur.fetchall()]
        
        # Users referenced by branch_subscriptions
        src_cur.execute(
            'SELECT DISTINCT "userId" FROM "branch_subscriptions" WHERE "branchId" = ANY(%s)',
            (branch_ids,),
        )
        sub_user_ids = [r["userId"] for r in src_cur.fetchall()]
        
        # Users referenced by branch_likes
        src_cur.execute(
            'SELECT DISTINCT "userId" FROM "branch_likes" WHERE "branchId" = ANY(%s)',
            (branch_ids,),
        )
        like_user_ids = [r["userId"] for r in src_cur.fetchall()]
        
        # Combine all referenced user IDs
        all_ref_user_ids = list(set(order_user_ids + click_user_ids + sub_user_ids + like_user_ids))
        
        if all_ref_user_ids:
            src_cur.execute(
                'SELECT * FROM "users" WHERE "id" = ANY(%s) AND "organizationId" IS NULL ORDER BY "createdAt"',
                (all_ref_user_ids,),
            )
            additional_users = rows_to_dicts(src_cur.fetchall())
            # Merge without duplicates
            existing_ids = {r["id"] for r in rows}
            for au in additional_users:
                if au["id"] not in existing_ids:
                    rows.append(au)
                    existing_ids.add(au["id"])
    
    if not rows:
        return 0

    for row in rows:
        _remap_row_id(dst_cur, "users", row, id_map, warnings)
        # Translate organizationId if remapped
        if row.get("organizationId"):
            row["organizationId"] = id_map.get(row["organizationId"], row["organizationId"])

    bulk_insert(dst_cur, "users", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# UserAddresses
# ──────────────────────────────────────────────────────────────────────────────

def migrate_user_addresses(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    # Get user IDs for this org
    src_cur.execute(
        'SELECT "id" FROM "users" WHERE "organizationId" = %s',
        (org_id,),
    )
    user_ids = [r["id"] for r in src_cur.fetchall()]
    if not user_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "user_addresses" WHERE "userId" = ANY(%s) ORDER BY "createdAt"',
        (user_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        new_user_id = id_map.get(row["userId"])
        if not new_user_id:
            warnings.append(f"user_addresses: userId '{row['userId']}' missing; skipped")
            continue
        row["userId"] = new_user_id
        _remap_row_id(dst_cur, "user_addresses", row, id_map, warnings)

    bulk_insert(dst_cur, "user_addresses", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# UserBranches
# ──────────────────────────────────────────────────────────────────────────────

def migrate_user_branches(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    # Get user IDs for this org
    src_cur.execute(
        'SELECT "id" FROM "users" WHERE "organizationId" = %s',
        (org_id,),
    )
    user_ids = [r["id"] for r in src_cur.fetchall()]
    if not user_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "user_branches" WHERE "userId" = ANY(%s)',
        (user_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    out = []
    for row in rows:
        new_user_id = id_map.get(row["userId"])
        new_branch_id = id_map.get(row["branchId"])
        if not new_user_id:
            warnings.append(f"user_branches: userId '{row['userId']}' missing; skipped")
            continue
        if not new_branch_id:
            warnings.append(f"user_branches: branchId '{row['branchId']}' not in migrated branches; skipped")
            continue
        row["userId"] = new_user_id
        row["branchId"] = new_branch_id
        out.append(row)

    if out:
        bulk_insert(dst_cur, "user_branches", out)
    return len(out)


# ──────────────────────────────────────────────────────────────────────────────
# UserRoleAssignments
# ──────────────────────────────────────────────────────────────────────────────

def migrate_user_role_assignments(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    # Get user IDs for this org
    src_cur.execute(
        'SELECT "id" FROM "users" WHERE "organizationId" = %s',
        (org_id,),
    )
    user_ids = [r["id"] for r in src_cur.fetchall()]
    if not user_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "user_role_assignments" WHERE "userId" = ANY(%s)',
        (user_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    out = []
    for row in rows:
        new_user_id = id_map.get(row["userId"])
        new_role_id = id_map.get(row["roleId"])
        if not new_user_id:
            warnings.append(f"user_role_assignments: userId '{row['userId']}' missing; skipped")
            continue
        if not new_role_id:
            warnings.append(f"user_role_assignments: roleId '{row['roleId']}' missing; skipped")
            continue
        row["userId"] = new_user_id
        row["roleId"] = new_role_id
        if row.get("branchId"):
            new_branch_id = id_map.get(row["branchId"])
            if not new_branch_id:
                warnings.append(f"user_role_assignments: branchId '{row['branchId']}' not in migrated branches; set to NULL")
                row["branchId"] = None
            else:
                row["branchId"] = new_branch_id
        out.append(row)

    if out:
        bulk_insert(dst_cur, "user_role_assignments", out)
    return len(out)
