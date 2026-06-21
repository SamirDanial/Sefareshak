"""
tables/menu.py

Migrates:
  - categories            (org-scoped)
  - declarations          (org-scoped allergen/type)
  - optional_ingredients  (org-scoped)
  - meals + sub-tables:
      meal_sizes
      meal_addons          (junction — after addons are migrated)
      meal_declarations    (junction)
      meal_optional_ingredients (junction)
      meal_branch_prices
      meal_branch_availabilities + meal_branch_availability_windows
      meal_size_weights
      meal_daily_deliverables
  - deals + sub-tables:
      deal_components
      deal_branch_prices
      deal_component_branch_prices
      deal_addons          (junction — after addons are migrated)
      deal_declarations    (junction)
      deal_optional_ingredients (junction)
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


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _remap_row_id(
    dst_cur: psycopg2.extras.DictCursor,
    table: str,
    row: dict,
    id_map: Dict[str, str],
    warnings: List[str],
) -> None:
    """In-place: check if row['id'] collides in dst, remap if needed."""
    dst_cur.execute(f'SELECT 1 FROM "{table}" WHERE "id" = %s', (row["id"],))
    if dst_cur.fetchone():
        new_id = new_cuid()
        warnings.append(f"{table} id collision '{row['id']}'; remapped → {new_id}")
        id_map[row["id"]] = new_id
        row["id"] = new_id
    else:
        id_map.setdefault(row["id"], row["id"])


def _translate_row_ids(row: dict, fields: List[str], id_map: Dict[str, str]) -> None:
    """In-place: translate FK fields using id_map."""
    for f in fields:
        if row.get(f):
            row[f] = id_map.get(row[f], row[f])


# ──────────────────────────────────────────────────────────────────────────────
# Categories
# ──────────────────────────────────────────────────────────────────────────────

def migrate_categories(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    src_cur.execute(
        'SELECT * FROM "categories" WHERE "organizationId" = %s',
        (org_id,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _remap_row_id(dst_cur, "categories", row, id_map, warnings)
        row["excludedBranches"] = translate_excluded_branches(
            row.get("excludedBranches") or [],
            id_map,
            warnings,
            context=f"category id={row['id']}",
        )

    bulk_insert(dst_cur, "categories", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# Declarations
# ──────────────────────────────────────────────────────────────────────────────

def migrate_declarations(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    src_cur.execute(
        'SELECT * FROM "declarations" WHERE "organizationId" = %s',
        (org_id,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _remap_row_id(dst_cur, "declarations", row, id_map, warnings)
        row["excludedBranches"] = translate_excluded_branches(
            row.get("excludedBranches") or [],
            id_map,
            warnings,
            context=f"declaration id={row['id']}",
        )

    bulk_insert(dst_cur, "declarations", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# OptionalIngredients
# ──────────────────────────────────────────────────────────────────────────────

def migrate_optional_ingredients(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    src_cur.execute(
        'SELECT * FROM "optional_ingredients" WHERE "organizationId" = %s',
        (org_id,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _remap_row_id(dst_cur, "optional_ingredients", row, id_map, warnings)

    bulk_insert(dst_cur, "optional_ingredients", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# Meals + sub-tables
# ──────────────────────────────────────────────────────────────────────────────

def migrate_meals(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    src_cur.execute(
        'SELECT * FROM "meals" WHERE "organizationId" = %s',
        (org_id,),
    )
    meals = rows_to_dicts(src_cur.fetchall())
    if not meals:
        return counts

    meal_ids_src = [m["id"] for m in meals]

    for row in meals:
        _remap_row_id(dst_cur, "meals", row, id_map, warnings)
        _translate_row_ids(row, ["categoryId"], id_map)
        row["excludedBranches"] = translate_excluded_branches(
            row.get("excludedBranches") or [],
            id_map,
            warnings,
            context=f"meal id={row['id']}",
        )

    bulk_insert(dst_cur, "meals", meals)
    counts["meals"] = len(meals)

    # MealSizes
    counts["meal_sizes"] = _migrate_meal_sizes(src_cur, dst_cur, meal_ids_src, id_map, warnings)

    # MealBranchPrices
    counts["meal_branch_prices"] = _migrate_meal_branch_prices(src_cur, dst_cur, meal_ids_src, id_map, warnings)

    # MealBranchAvailabilities + windows
    avail_count, window_count = _migrate_meal_branch_availabilities(src_cur, dst_cur, meal_ids_src, id_map, warnings)
    counts["meal_branch_availabilities"] = avail_count
    counts["meal_branch_availability_windows"] = window_count

    # MealSizeWeights
    counts["meal_size_weights"] = _migrate_meal_size_weights(src_cur, dst_cur, meal_ids_src, id_map, warnings)

    # MealDailyDeliverables
    counts["meal_daily_deliverables"] = _migrate_meal_daily_deliverables(src_cur, dst_cur, meal_ids_src, id_map, warnings)

    return counts


def _migrate_meal_sizes(
    src_cur, dst_cur, meal_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "meal_sizes" WHERE "mealId" = ANY(%s)',
        (meal_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    for row in rows:
        _remap_row_id(dst_cur, "meal_sizes", row, id_map, warnings)
        _translate_row_ids(row, ["mealId"], id_map)
    if rows:
        bulk_insert(dst_cur, "meal_sizes", rows)
    return len(rows)


def _migrate_meal_branch_prices(
    src_cur, dst_cur, meal_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "meal_branch_prices" WHERE "mealId" = ANY(%s)',
        (meal_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        new_branch = id_map.get(row["branchId"])
        if not new_branch:
            warnings.append(
                f"meal_branch_prices: branchId '{row['branchId']}' not in migrated branches; skipped"
            )
            continue
        row["branchId"] = new_branch
        _translate_row_ids(row, ["mealId"], id_map)
        _remap_row_id(dst_cur, "meal_branch_prices", row, id_map, warnings)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "meal_branch_prices", out)
    return len(out)


def _migrate_meal_branch_availabilities(
    src_cur, dst_cur, meal_ids: List[str], id_map: Dict, warnings: List
) -> tuple:
    src_cur.execute(
        'SELECT * FROM "meal_branch_availabilities" WHERE "mealId" = ANY(%s)',
        (meal_ids,),
    )
    avail_rows = rows_to_dicts(src_cur.fetchall())
    avail_out = []
    avail_id_map: Dict[str, str] = {}

    for row in avail_rows:
        new_branch = id_map.get(row["branchId"])
        if not new_branch:
            warnings.append(
                f"meal_branch_availabilities: branchId '{row['branchId']}' not in migrated branches; skipped"
            )
            continue
        row["branchId"] = new_branch
        _translate_row_ids(row, ["mealId"], id_map)
        old_id = row["id"]
        _remap_row_id(dst_cur, "meal_branch_availabilities", row, id_map, warnings)
        avail_id_map[old_id] = row["id"]
        avail_out.append(row)

    if avail_out:
        bulk_insert(dst_cur, "meal_branch_availabilities", avail_out)

    # Windows
    if not avail_id_map:
        return len(avail_out), 0

    src_avail_ids = list(avail_id_map.keys())
    src_cur.execute(
        'SELECT * FROM "meal_branch_availability_windows" WHERE "availabilityId" = ANY(%s)',
        (src_avail_ids,),
    )
    win_rows = rows_to_dicts(src_cur.fetchall())
    win_out = []
    for row in win_rows:
        new_avail_id = avail_id_map.get(row["availabilityId"])
        if not new_avail_id:
            continue
        row["availabilityId"] = new_avail_id
        _remap_row_id(dst_cur, "meal_branch_availability_windows", row, id_map, warnings)
        win_out.append(row)

    if win_out:
        bulk_insert(dst_cur, "meal_branch_availability_windows", win_out)

    return len(avail_out), len(win_out)


def _migrate_meal_size_weights(
    src_cur, dst_cur, meal_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "meal_size_weights" WHERE "mealId" = ANY(%s)',
        (meal_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        new_branch = id_map.get(row["branchId"])
        if not new_branch:
            warnings.append(
                f"meal_size_weights: branchId '{row['branchId']}' not in migrated branches; skipped"
            )
            continue
        row["branchId"] = new_branch
        _translate_row_ids(row, ["mealId", "mealSizeId"], id_map)
        _remap_row_id(dst_cur, "meal_size_weights", row, id_map, warnings)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "meal_size_weights", out)
    return len(out)


def _migrate_meal_daily_deliverables(
    src_cur, dst_cur, meal_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "meal_daily_deliverables" WHERE "mealId" = ANY(%s)',
        (meal_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        new_branch = id_map.get(row["branchId"])
        if not new_branch:
            warnings.append(
                f"meal_daily_deliverables: branchId '{row['branchId']}' not in migrated branches; skipped"
            )
            continue
        row["branchId"] = new_branch
        _translate_row_ids(row, ["mealId"], id_map)
        _remap_row_id(dst_cur, "meal_daily_deliverables", row, id_map, warnings)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "meal_daily_deliverables", out)
    return len(out)


# ──────────────────────────────────────────────────────────────────────────────
# Meal junctions (addons, declarations, optional_ingredients)
# Called AFTER addons module runs
# ──────────────────────────────────────────────────────────────────────────────

def migrate_meal_junctions(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    src_cur.execute(
        'SELECT "id" FROM "meals" WHERE "organizationId" = %s',
        (org_id,),
    )
    meal_ids_src = [r["id"] for r in src_cur.fetchall()]
    if not meal_ids_src:
        return counts

    # MealAddOns
    src_cur.execute(
        'SELECT * FROM "meal_addons" WHERE "mealId" = ANY(%s)',
        (meal_ids_src,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        new_meal = id_map.get(row["mealId"])
        new_addon = id_map.get(row["addOnId"])
        if not new_meal or not new_addon:
            warnings.append(
                f"meal_addons: skipped mealId={row['mealId']} addOnId={row['addOnId']} "
                f"(missing in id_map)"
            )
            continue
        row["mealId"] = new_meal
        row["addOnId"] = new_addon
        out.append(row)
    if out:
        bulk_insert(dst_cur, "meal_addons", out)
    counts["meal_addons"] = len(out)

    # MealDeclarations
    src_cur.execute(
        'SELECT * FROM "meal_declarations" WHERE "mealId" = ANY(%s)',
        (meal_ids_src,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        new_meal = id_map.get(row["mealId"])
        new_decl = id_map.get(row["declarationId"])
        if not new_meal or not new_decl:
            warnings.append(
                f"meal_declarations: skipped mealId={row['mealId']} declarationId={row['declarationId']}"
            )
            continue
        row["mealId"] = new_meal
        row["declarationId"] = new_decl
        out.append(row)
    if out:
        bulk_insert(dst_cur, "meal_declarations", out)
    counts["meal_declarations"] = len(out)

    # MealOptionalIngredients
    src_cur.execute(
        'SELECT * FROM "meal_optional_ingredients" WHERE "mealId" = ANY(%s)',
        (meal_ids_src,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        new_meal = id_map.get(row["mealId"])
        new_oi = id_map.get(row["optionalIngredientId"])
        if not new_meal or not new_oi:
            warnings.append(
                f"meal_optional_ingredients: skipped mealId={row['mealId']} "
                f"optionalIngredientId={row['optionalIngredientId']}"
            )
            continue
        row["mealId"] = new_meal
        row["optionalIngredientId"] = new_oi
        out.append(row)
    if out:
        bulk_insert(dst_cur, "meal_optional_ingredients", out)
    counts["meal_optional_ingredients"] = len(out)

    return counts


# ──────────────────────────────────────────────────────────────────────────────
# Deals + sub-tables
# ──────────────────────────────────────────────────────────────────────────────

def migrate_deals(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    src_cur.execute(
        'SELECT * FROM "deals" WHERE "organizationId" = %s',
        (org_id,),
    )
    deals = rows_to_dicts(src_cur.fetchall())
    if not deals:
        return counts

    deal_ids_src = [d["id"] for d in deals]

    for row in deals:
        _remap_row_id(dst_cur, "deals", row, id_map, warnings)
        _translate_row_ids(row, ["categoryId"], id_map)
        row["excludedBranches"] = translate_excluded_branches(
            row.get("excludedBranches") or [],
            id_map,
            warnings,
            context=f"deal id={row['id']}",
        )

    bulk_insert(dst_cur, "deals", deals)
    counts["deals"] = len(deals)

    # DealComponents
    src_cur.execute(
        'SELECT * FROM "deal_components" WHERE "dealId" = ANY(%s)',
        (deal_ids_src,),
    )
    components = rows_to_dicts(src_cur.fetchall())
    comp_ids_src = [c["id"] for c in components]
    for row in components:
        _remap_row_id(dst_cur, "deal_components", row, id_map, warnings)
        _translate_row_ids(row, ["dealId"], id_map)
    if components:
        bulk_insert(dst_cur, "deal_components", components)
    counts["deal_components"] = len(components)

    # DealBranchPrices
    src_cur.execute(
        'SELECT * FROM "deal_branch_prices" WHERE "dealId" = ANY(%s)',
        (deal_ids_src,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        new_branch = id_map.get(row["branchId"])
        if not new_branch:
            warnings.append(
                f"deal_branch_prices: branchId '{row['branchId']}' not in migrated set; skipped"
            )
            continue
        row["branchId"] = new_branch
        _translate_row_ids(row, ["dealId"], id_map)
        _remap_row_id(dst_cur, "deal_branch_prices", row, id_map, warnings)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "deal_branch_prices", out)
    counts["deal_branch_prices"] = len(out)

    # DealComponentBranchPrices
    if comp_ids_src:
        src_cur.execute(
            'SELECT * FROM "deal_component_branch_prices" WHERE "dealComponentId" = ANY(%s)',
            (comp_ids_src,),
        )
        rows = rows_to_dicts(src_cur.fetchall())
        out = []
        for row in rows:
            new_branch = id_map.get(row["branchId"])
            if not new_branch:
                warnings.append(
                    f"deal_component_branch_prices: branchId '{row['branchId']}' not in migrated set; skipped"
                )
                continue
            row["branchId"] = new_branch
            _translate_row_ids(row, ["dealComponentId"], id_map)
            _remap_row_id(dst_cur, "deal_component_branch_prices", row, id_map, warnings)
            out.append(row)
        if out:
            bulk_insert(dst_cur, "deal_component_branch_prices", out)
        counts["deal_component_branch_prices"] = len(out)

    # Deal junctions (addons, declarations, optional_ingredients)
    junction_counts = migrate_deal_junctions(src_cur, dst_cur, deal_ids_src, id_map, warnings)
    counts.update(junction_counts)

    return counts


def migrate_deal_junctions(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    deal_ids_src: List[str],
    id_map: Dict[str, str],
    warnings: List[str],
) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    if not deal_ids_src:
        return counts

    # DealAddOns
    src_cur.execute(
        'SELECT * FROM "deal_addons" WHERE "dealId" = ANY(%s)',
        (deal_ids_src,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        new_deal = id_map.get(row["dealId"])
        new_addon = id_map.get(row["addOnId"])
        if not new_deal or not new_addon:
            warnings.append(
                f"deal_addons: skipped dealId={row['dealId']} addOnId={row['addOnId']}"
            )
            continue
        row["dealId"] = new_deal
        row["addOnId"] = new_addon
        out.append(row)
    if out:
        bulk_insert(dst_cur, "deal_addons", out)
    counts["deal_addons"] = len(out)

    # DealDeclarations
    src_cur.execute(
        'SELECT * FROM "deal_declarations" WHERE "dealId" = ANY(%s)',
        (deal_ids_src,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        new_deal = id_map.get(row["dealId"])
        new_decl = id_map.get(row["declarationId"])
        if not new_deal or not new_decl:
            continue
        row["dealId"] = new_deal
        row["declarationId"] = new_decl
        out.append(row)
    if out:
        bulk_insert(dst_cur, "deal_declarations", out)
    counts["deal_declarations"] = len(out)

    # DealOptionalIngredients
    src_cur.execute(
        'SELECT * FROM "deal_optional_ingredients" WHERE "dealId" = ANY(%s)',
        (deal_ids_src,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        new_deal = id_map.get(row["dealId"])
        new_oi = id_map.get(row["optionalIngredientId"])
        if not new_deal or not new_oi:
            continue
        row["dealId"] = new_deal
        row["optionalIngredientId"] = new_oi
        out.append(row)
    if out:
        bulk_insert(dst_cur, "deal_optional_ingredients", out)
    counts["deal_optional_ingredients"] = len(out)

    return counts
