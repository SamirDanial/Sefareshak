"""
tables/reservations.py

Migrates:
  - reservations
  - reservation_orders
  - reservation_order_items
  - reservation_order_order_item_addons
  - reservation_order_item_optional_ingredients
  - reservation_tables
  - kitchen_tickets
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
# Reservations
# ──────────────────────────────────────────────────────────────────────────────

def migrate_reservations(
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
        'SELECT * FROM "reservations" WHERE "branchId" = ANY(%s) ORDER BY "createdAt"',
        (branch_ids,),
    )
    reservations = rows_to_dicts(src_cur.fetchall())
    if not reservations:
        return counts

    reservation_ids_src = [r["id"] for r in reservations]

    for row in reservations:
        _translate_fk(row, "branchId", id_map)
        _translate_fk(row, "userId", id_map)
        _translate_fk(row, "zoneId", id_map)
        _translate_fk(row, "tableId", id_map)
        _remap_row_id(dst_cur, "reservations", row, id_map, warnings)

    bulk_insert(dst_cur, "reservations", reservations)
    counts["reservations"] = len(reservations)

    # ReservationTables
    counts["reservation_tables"] = _migrate_reservation_tables(src_cur, dst_cur, reservation_ids_src, id_map, warnings)

    # KitchenTickets
    counts["kitchen_tickets"] = _migrate_kitchen_tickets(src_cur, dst_cur, reservation_ids_src, id_map, warnings)

    # Notifications (reservation-related)
    counts.update(_migrate_reservation_notifications(src_cur, dst_cur, reservation_ids_src, id_map, warnings))

    return counts


def _migrate_reservation_tables(
    src_cur, dst_cur, reservation_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "reservation_tables" WHERE "reservationId" = ANY(%s)',
        (reservation_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        _translate_fk(row, "reservationId", id_map)
        _translate_fk(row, "tableId", id_map)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "reservation_tables", out)
    return len(out)


def _migrate_kitchen_tickets(
    src_cur, dst_cur, reservation_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "kitchen_tickets" WHERE "reservationId" = ANY(%s)',
        (reservation_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "branchId", id_map)
        _translate_fk(row, "reservationId", id_map)
        _translate_fk(row, "createdByUserId", id_map)
        _remap_row_id(dst_cur, "kitchen_tickets", row, id_map, warnings)

    bulk_insert(dst_cur, "kitchen_tickets", rows)
    return len(rows)


def _migrate_reservation_notifications(
    src_cur, dst_cur, reservation_ids: List[str], id_map: Dict, warnings: List
) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    
    src_cur.execute(
        'SELECT * FROM "notifications" WHERE "reservationId" = ANY(%s)',
        (reservation_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return counts

    for row in rows:
        _translate_fk(row, "reservationId", id_map)
        _remap_row_id(dst_cur, "notifications", row, id_map, warnings)

    bulk_insert(dst_cur, "notifications", rows)
    counts["notifications"] = len(rows)
    return counts


# ──────────────────────────────────────────────────────────────────────────────
# ReservationOrders
# ──────────────────────────────────────────────────────────────────────────────

def migrate_reservation_orders(
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
        'SELECT * FROM "reservation_orders" WHERE "branchId" = ANY(%s) ORDER BY "createdAt"',
        (branch_ids,),
    )
    orders = rows_to_dicts(src_cur.fetchall())
    if not orders:
        return counts

    order_ids_src = [o["id"] for o in orders]

    for row in orders:
        _translate_fk(row, "branchId", id_map)
        _translate_fk(row, "businessDaySessionId", id_map)
        _remap_row_id(dst_cur, "reservation_orders", row, id_map, warnings)

    bulk_insert(dst_cur, "reservation_orders", orders)
    counts["reservation_orders"] = len(orders)

    # ReservationOrderItems
    counts.update(_migrate_reservation_order_items(src_cur, dst_cur, order_ids_src, id_map, warnings))

    return counts


def _migrate_reservation_order_items(
    src_cur, dst_cur, order_ids: List[str], id_map: Dict, warnings: List
) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    src_cur.execute(
        'SELECT * FROM "reservation_order_items" WHERE "reservationOrderId" = ANY(%s)',
        (order_ids,),
    )
    items = rows_to_dicts(src_cur.fetchall())
    if not items:
        return counts

    item_ids_src = [i["id"] for i in items]

    for row in items:
        _translate_fk(row, "reservationOrderId", id_map)
        _translate_fk(row, "mealId", id_map)
        _remap_row_id(dst_cur, "reservation_order_items", row, id_map, warnings)

    bulk_insert(dst_cur, "reservation_order_items", items)
    counts["reservation_order_items"] = len(items)

    # ReservationOrderItemAddOns
    counts["reservation_order_item_addons"] = _migrate_reservation_order_item_addons(
        src_cur, dst_cur, item_ids_src, id_map, warnings
    )

    # ReservationOrderItemOptionalIngredients
    counts["reservation_order_item_optional_ingredients"] = _migrate_reservation_order_item_optional_ingredients(
        src_cur, dst_cur, item_ids_src, id_map, warnings
    )

    return counts


def _migrate_reservation_order_item_addons(
    src_cur, dst_cur, item_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "reservation_order_item_addons" WHERE "reservationOrderItemId" = ANY(%s)',
        (item_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        _translate_fk(row, "reservationOrderItemId", id_map)
        _translate_fk(row, "addon_id", id_map)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "reservation_order_item_addons", out)
    return len(out)


def _migrate_reservation_order_item_optional_ingredients(
    src_cur, dst_cur, item_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "reservation_order_item_optional_ingredients" WHERE "reservationOrderItemId" = ANY(%s)',
        (item_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        _translate_fk(row, "reservationOrderItemId", id_map)
        _translate_fk(row, "optionalIngredientId", id_map)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "reservation_order_item_optional_ingredients", out)
    return len(out)
