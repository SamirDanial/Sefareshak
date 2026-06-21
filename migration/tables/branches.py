"""
tables/branches.py

Migrates:
  - branch_types   (global — upsert by slug)
  - branches       (org-scoped)
  - zones          (per-branch)
  - tables         (per-branch/zone; status reset → AVAILABLE)
  - floor_elements (per-zone)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import psycopg2.extras

from tables.helpers import (
    bulk_insert,
    rows_to_dicts,
    row_to_dict,
    translate_id,
    upsert_insert,
    check_and_remap_id,
)


# ──────────────────────────────────────────────────────────────────────────────
# BranchTypes  (global table — upsert by slug)
# ──────────────────────────────────────────────────────────────────────────────

def migrate_branch_types(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    """Fetch branch_types used by this org's branches; upsert into destination."""
    src_cur.execute(
        """
        SELECT DISTINCT bt.*
        FROM "branch_types" bt
        INNER JOIN "branches" b ON b."branchTypeId" = bt."id"
        WHERE b."organizationId" = %s
        """,
        (org_id,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    inserted = 0
    for row in rows:
        # Check slug collision
        dst_cur.execute('SELECT "id" FROM "branch_types" WHERE "slug" = %s', (row["slug"],))
        existing = dst_cur.fetchone()
        if existing:
            # Map source id → existing dst id so FK references resolve
            if row["id"] != existing["id"]:
                id_map[row["id"]] = existing["id"]
                warnings.append(
                    f"branch_type slug='{row['slug']}' already exists in dst (id={existing['id']}); "
                    f"source id={row['id']} remapped."
                )
        else:
            # Also handle PK collision (different slug, same id)
            dst_cur.execute('SELECT 1 FROM "branch_types" WHERE "id" = %s', (row["id"],))
            if dst_cur.fetchone():
                from tables.helpers import new_cuid
                new_id = new_cuid()
                warnings.append(
                    f"branch_type id collision '{row['id']}'; remapped → {new_id}"
                )
                id_map[row["id"]] = new_id
                row["id"] = new_id
            bulk_insert(dst_cur, "branch_types", [row])
            inserted += 1

    return inserted


# ──────────────────────────────────────────────────────────────────────────────
# Branches
# ──────────────────────────────────────────────────────────────────────────────

def migrate_branches(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    src_cur.execute(
        'SELECT * FROM "branches" WHERE "organizationId" = %s',
        (org_id,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        # Translate branchTypeId if remapped
        if row.get("branchTypeId"):
            row["branchTypeId"] = id_map.get(row["branchTypeId"], row["branchTypeId"])

        # Register branch IDs in map (keep original — collision check)
        dst_cur.execute('SELECT 1 FROM "branches" WHERE "id" = %s', (row["id"],))
        if dst_cur.fetchone():
            from tables.helpers import new_cuid
            new_id = new_cuid()
            warnings.append(f"Branch id collision '{row['id']}'; remapped → {new_id}")
            id_map[row["id"]] = new_id
            row["id"] = new_id
        else:
            id_map[row["id"]] = row["id"]

    bulk_insert(dst_cur, "branches", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# Zones
# ──────────────────────────────────────────────────────────────────────────────

def migrate_zones(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    # Get all branch IDs for this org
    branch_ids = _branch_ids_for_org(src_cur, org_id)
    if not branch_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "zones" WHERE "branchId" = ANY(%s)',
        (branch_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        row["branchId"] = id_map.get(row["branchId"], row["branchId"])
        # Handle id collision
        dst_cur.execute('SELECT 1 FROM "zones" WHERE "id" = %s', (row["id"],))
        if dst_cur.fetchone():
            from tables.helpers import new_cuid
            new_id = new_cuid()
            warnings.append(f"Zone id collision '{row['id']}'; remapped → {new_id}")
            id_map[row["id"]] = new_id
            row["id"] = new_id
        else:
            id_map[row["id"]] = row["id"]

    bulk_insert(dst_cur, "zones", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# Tables
# ──────────────────────────────────────────────────────────────────────────────

def migrate_tables(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    branch_ids = _branch_ids_for_org(src_cur, org_id)
    if not branch_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "tables" WHERE "branchId" = ANY(%s)',
        (branch_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        row["branchId"] = id_map.get(row["branchId"], row["branchId"])
        if row.get("zoneId"):
            row["zoneId"] = id_map.get(row["zoneId"], row["zoneId"])
        # Reset table status to AVAILABLE in destination
        row["status"] = "AVAILABLE"

        dst_cur.execute('SELECT 1 FROM "tables" WHERE "id" = %s', (row["id"],))
        if dst_cur.fetchone():
            from tables.helpers import new_cuid
            new_id = new_cuid()
            warnings.append(f"Table id collision '{row['id']}'; remapped → {new_id}")
            id_map[row["id"]] = new_id
            row["id"] = new_id
        else:
            id_map[row["id"]] = row["id"]

    bulk_insert(dst_cur, "tables", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# FloorElements
# ──────────────────────────────────────────────────────────────────────────────

def migrate_floor_elements(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    branch_ids = _branch_ids_for_org(src_cur, org_id)
    if not branch_ids:
        return 0

    # Get zone IDs for this org's branches
    src_cur.execute(
        'SELECT "id" FROM "zones" WHERE "branchId" = ANY(%s)',
        (branch_ids,),
    )
    zone_ids = [r["id"] for r in src_cur.fetchall()]
    if not zone_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "floor_elements" WHERE "zoneId" = ANY(%s)',
        (zone_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        row["zoneId"] = id_map.get(row["zoneId"], row["zoneId"])
        dst_cur.execute('SELECT 1 FROM "floor_elements" WHERE "id" = %s', (row["id"],))
        if dst_cur.fetchone():
            from tables.helpers import new_cuid
            new_id = new_cuid()
            id_map[row["id"]] = new_id
            row["id"] = new_id

    bulk_insert(dst_cur, "floor_elements", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────────────────────────────────────

def _branch_ids_for_org(src_cur: psycopg2.extras.DictCursor, org_id: str) -> List[str]:
    src_cur.execute(
        'SELECT "id" FROM "branches" WHERE "organizationId" = %s',
        (org_id,),
    )
    return [r["id"] for r in src_cur.fetchall()]
