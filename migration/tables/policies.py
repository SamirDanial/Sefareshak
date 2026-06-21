"""
tables/policies.py

Migrates:
  - terms_and_policies
  - policy_user_consents
  - audit_logs
"""

from __future__ import annotations

from typing import Dict, List

import psycopg2.extras

from tables.helpers import (
    bulk_insert,
    new_cuid,
    rows_to_dicts,
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


def _translate_fk(row: dict, field: str, id_map: Dict[str, str]) -> None:
    if row.get(field):
        row[field] = id_map.get(row[field], row[field])


# ──────────────────────────────────────────────────────────────────────────────
# TermsAndPolicies
# ──────────────────────────────────────────────────────────────────────────────

def migrate_terms_and_policies(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    # Migrate all policies (they are global, not org-scoped)
    src_cur.execute(
        'SELECT * FROM "terms_and_policies"',
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return counts

    policy_ids_src = [r["id"] for r in rows]

    for row in rows:
        # Check if policy already exists by unique constraint
        dst_cur.execute(
            'SELECT "id" FROM "terms_and_policies" WHERE "type" = %s AND "language" = %s AND "version" = %s',
            (row["type"], row["language"], row["version"]),
        )
        existing = dst_cur.fetchone()
        if existing:
            # Map source ID to existing destination ID
            id_map[row["id"]] = existing["id"]
            warnings.append(
                f"terms_and_policies: policy type={row['type']} language={row['language']} version={row['version']} already exists; mapped"
            )
            continue
        else:
            _remap_row_id(dst_cur, "terms_and_policies", row, id_map, warnings)

    bulk_insert(dst_cur, "terms_and_policies", rows)
    counts["terms_and_policies"] = len(rows)

    # PolicyUserConsents
    counts["policy_user_consents"] = _migrate_policy_user_consents(
        src_cur, dst_cur, org_id, policy_ids_src, id_map, warnings
    )

    return counts


def _migrate_policy_user_consents(
    src_cur, dst_cur, org_id: str, policy_ids: List[str], id_map: Dict, warnings: List
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
        'SELECT * FROM "policy_user_consents" WHERE "userId" = ANY(%s) AND "policyId" = ANY(%s)',
        (user_ids, policy_ids),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    out = []
    for row in rows:
        _translate_fk(row, "userId", id_map)
        _translate_fk(row, "policyId", id_map)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "policy_user_consents", out)
    return len(out)


# ──────────────────────────────────────────────────────────────────────────────
# AuditLogs
# ──────────────────────────────────────────────────────────────────────────────

def migrate_audit_logs(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    # Get branch IDs for this org
    src_cur.execute(
        'SELECT "id" FROM "branches" WHERE "organizationId" = %s',
        (org_id,),
    )
    branch_ids = [r["id"] for r in src_cur.fetchall()]

    src_cur.execute(
        'SELECT * FROM "audit_logs" WHERE "organizationId" = %s OR ("branchId" IS NOT NULL AND "branchId" = ANY(%s)) ORDER BY "createdAt"',
        (org_id, branch_ids),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "organizationId", id_map)
        _translate_fk(row, "branchId", id_map)
        _remap_row_id(dst_cur, "audit_logs", row, id_map, warnings)

    bulk_insert(dst_cur, "audit_logs", rows)
    return len(rows)
