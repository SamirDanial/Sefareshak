"""
tables/orders.py

Migrates:
  - orders
  - order_items
  - order_item_addons
  - order_item_optional_ingredients
  - notifications (order-related)
  - refunds
  - business_day_sessions
  - business_day_reports
  - business_day_dsfinvk_submissions
  - order_adjustments
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
# BusinessDaySessions
# ──────────────────────────────────────────────────────────────────────────────

def migrate_business_day_sessions(
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
    if not branch_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "business_day_sessions" WHERE "branchId" = ANY(%s) ORDER BY "createdAt"',
        (branch_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "branchId", id_map)
        _remap_row_id(dst_cur, "business_day_sessions", row, id_map, warnings)

    bulk_insert(dst_cur, "business_day_sessions", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# Orders
# ──────────────────────────────────────────────────────────────────────────────

def migrate_orders(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    # Get branch IDs for this org
    src_cur.execute(
        'SELECT "id" FROM "branches" WHERE "organizationId" = %s',
        (org_id,),
    )
    branch_ids = [r["id"] for r in src_cur.fetchall()]
    if not branch_ids:
        return counts

    src_cur.execute(
        'SELECT * FROM "orders" WHERE "branchId" = ANY(%s) ORDER BY "createdAt"',
        (branch_ids,),
    )
    orders = rows_to_dicts(src_cur.fetchall())
    if not orders:
        return counts

    order_ids_src = [o["id"] for o in orders]

    for row in orders:
        _translate_fk(row, "branchId", id_map)
        _translate_fk(row, "userId", id_map)
        _translate_fk(row, "businessDaySessionId", id_map)
        _remap_row_id(dst_cur, "orders", row, id_map, warnings)

    bulk_insert(dst_cur, "orders", orders)
    counts["orders"] = len(orders)

    # OrderItems
    counts.update(_migrate_order_items(src_cur, dst_cur, order_ids_src, id_map, warnings))

    # Notifications (order-related)
    counts.update(_migrate_notifications(src_cur, dst_cur, order_ids_src, id_map, warnings))

    return counts


def _migrate_order_items(
    src_cur, dst_cur, order_ids: List[str], id_map: Dict, warnings: List
) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    src_cur.execute(
        'SELECT * FROM "order_items" WHERE "orderId" = ANY(%s)',
        (order_ids,),
    )
    items = rows_to_dicts(src_cur.fetchall())
    if not items:
        return counts

    item_ids_src = [i["id"] for i in items]

    for row in items:
        _translate_fk(row, "orderId", id_map)
        _translate_fk(row, "mealId", id_map)
        _translate_fk(row, "dealId", id_map)
        _translate_fk(row, "dealComponentId", id_map)
        _translate_fk(row, "parentDealItemId", id_map)
        _remap_row_id(dst_cur, "order_items", row, id_map, warnings)

    bulk_insert(dst_cur, "order_items", items)
    counts["order_items"] = len(items)

    # OrderItemAddOns
    counts["order_item_addons"] = _migrate_order_item_addons(src_cur, dst_cur, item_ids_src, id_map, warnings)

    # OrderItemOptionalIngredients
    counts["order_item_optional_ingredients"] = _migrate_order_item_optional_ingredients(
        src_cur, dst_cur, item_ids_src, id_map, warnings
    )

    return counts


def _migrate_order_item_addons(
    src_cur, dst_cur, item_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "order_item_addons" WHERE "orderItemId" = ANY(%s)',
        (item_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        _translate_fk(row, "orderItemId", id_map)
        _translate_fk(row, "addon_id", id_map)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "order_item_addons", out)
    return len(out)


def _migrate_order_item_optional_ingredients(
    src_cur, dst_cur, item_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "order_item_optional_ingredients" WHERE "orderItemId" = ANY(%s)',
        (item_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        _translate_fk(row, "orderItemId", id_map)
        _translate_fk(row, "optionalIngredientId", id_map)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "order_item_optional_ingredients", out)
    return len(out)


def _migrate_notifications(
    src_cur, dst_cur, order_ids: List[str], id_map: Dict, warnings: List
) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    
    src_cur.execute(
        'SELECT * FROM "notifications" WHERE "orderId" = ANY(%s)',
        (order_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return counts

    for row in rows:
        _translate_fk(row, "orderId", id_map)
        _remap_row_id(dst_cur, "notifications", row, id_map, warnings)

    bulk_insert(dst_cur, "notifications", rows)
    counts["notifications"] = len(rows)
    return counts


# ──────────────────────────────────────────────────────────────────────────────
# BusinessDayReports
# ──────────────────────────────────────────────────────────────────────────────

def migrate_business_day_reports(
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
    if not branch_ids:
        return 0

    # Get session IDs
    src_cur.execute(
        'SELECT "id" FROM "business_day_sessions" WHERE "branchId" = ANY(%s)',
        (branch_ids,),
    )
    session_ids = [r["id"] for r in src_cur.fetchall()]
    if not session_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "business_day_reports" WHERE "sessionId" = ANY(%s)',
        (session_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "sessionId", id_map)
        _remap_row_id(dst_cur, "business_day_reports", row, id_map, warnings)

    bulk_insert(dst_cur, "business_day_reports", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# BusinessDayDsfinvkSubmissions
# ──────────────────────────────────────────────────────────────────────────────

def migrate_business_day_dsfinvk_submissions(
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
    if not branch_ids:
        return 0

    # Get session IDs
    src_cur.execute(
        'SELECT "id" FROM "business_day_sessions" WHERE "branchId" = ANY(%s)',
        (branch_ids,),
    )
    session_ids = [r["id"] for r in src_cur.fetchall()]
    if not session_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "business_day_dsfinvk_submissions" WHERE "sessionId" = ANY(%s)',
        (session_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "sessionId", id_map)
        _remap_row_id(dst_cur, "business_day_dsfinvk_submissions", row, id_map, warnings)

    bulk_insert(dst_cur, "business_day_dsfinvk_submissions", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# OrderAdjustments
# ──────────────────────────────────────────────────────────────────────────────

def migrate_order_adjustments(
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
    if not branch_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "order_adjustments" WHERE "branchId" = ANY(%s) ORDER BY "createdAt"',
        (branch_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "branchId", id_map)
        _translate_fk(row, "originalOrderId", id_map)
        _translate_fk(row, "originalSessionId", id_map)
        _translate_fk(row, "appliedSessionId", id_map)
        _translate_fk(row, "refundId", id_map)
        _remap_row_id(dst_cur, "order_adjustments", row, id_map, warnings)

    bulk_insert(dst_cur, "order_adjustments", rows)
    return len(rows)
