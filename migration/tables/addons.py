"""
tables/addons.py

Migrates:
  - addons              (org-scoped)
  - addon_sizes         (per-addon)
  - addon_categories    (junction addon ↔ category — after categories migrated)
  - addon_branch_prices (per-addon per-branch)
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
# AddOns
# ──────────────────────────────────────────────────────────────────────────────

def migrate_addons(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    src_cur.execute(
        'SELECT * FROM "addons" WHERE "organizationId" = %s',
        (org_id,),
    )
    addons = rows_to_dicts(src_cur.fetchall())
    if not addons:
        return counts

    addon_ids_src = [a["id"] for a in addons]

    for row in addons:
        _remap_row_id(dst_cur, "addons", row, id_map, warnings)
        row["excludedBranches"] = translate_excluded_branches(
            row.get("excludedBranches") or [],
            id_map,
            warnings,
            context=f"addon id={row['id']}",
        )

    bulk_insert(dst_cur, "addons", addons)
    counts["addons"] = len(addons)

    # AddonSizes
    src_cur.execute(
        'SELECT * FROM "addon_sizes" WHERE "addonId" = ANY(%s)',
        (addon_ids_src,),
    )
    sizes = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in sizes:
        new_addon_id = id_map.get(row["addonId"])
        if not new_addon_id:
            warnings.append(f"addon_sizes: addonId '{row['addonId']}' missing; skipped")
            continue
        row["addonId"] = new_addon_id
        _remap_row_id(dst_cur, "addon_sizes", row, id_map, warnings)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "addon_sizes", out)
    counts["addon_sizes"] = len(out)

    # AddonCategories (junction — categories must already be in id_map)
    src_cur.execute(
        'SELECT * FROM "addon_categories" WHERE "addonId" = ANY(%s)',
        (addon_ids_src,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        new_addon_id = id_map.get(row["addonId"])
        new_cat_id = id_map.get(row["categoryId"])
        if not new_addon_id or not new_cat_id:
            warnings.append(
                f"addon_categories: skipped addonId={row['addonId']} categoryId={row['categoryId']}"
            )
            continue
        row["addonId"] = new_addon_id
        row["categoryId"] = new_cat_id
        _remap_row_id(dst_cur, "addon_categories", row, id_map, warnings)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "addon_categories", out)
    counts["addon_categories"] = len(out)

    # AddonBranchPrices
    src_cur.execute(
        'SELECT * FROM "addon_branch_prices" WHERE "addonId" = ANY(%s)',
        (addon_ids_src,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        new_addon_id = id_map.get(row["addonId"])
        new_branch_id = id_map.get(row["branchId"])
        if not new_addon_id:
            warnings.append(f"addon_branch_prices: addonId '{row['addonId']}' missing; skipped")
            continue
        if not new_branch_id:
            warnings.append(
                f"addon_branch_prices: branchId '{row['branchId']}' not in migrated branches; skipped"
            )
            continue
        row["addonId"] = new_addon_id
        row["branchId"] = new_branch_id
        _remap_row_id(dst_cur, "addon_branch_prices", row, id_map, warnings)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "addon_branch_prices", out)
    counts["addon_branch_prices"] = len(out)

    return counts
