"""
tables/payments.py

Migrates:
  - payments
  - refunds
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
# Payments
# ──────────────────────────────────────────────────────────────────────────────

def migrate_payments(
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

    # Get order IDs for this org's branches
    src_cur.execute(
        'SELECT "id" FROM "orders" WHERE "branchId" = ANY(%s)',
        (branch_ids,),
    )
    order_ids = [r["id"] for r in src_cur.fetchall()]
    
    # Get reservation order IDs for this org's branches
    src_cur.execute(
        'SELECT "id" FROM "reservation_orders" WHERE "branchId" = ANY(%s)',
        (branch_ids,),
    )
    reservation_order_ids = [r["id"] for r in src_cur.fetchall()]

    all_order_ids = order_ids + reservation_order_ids
    if not all_order_ids:
        return counts

    src_cur.execute(
        'SELECT * FROM "payments" WHERE "orderId" = ANY(%s) OR "reservationOrderId" = ANY(%s) ORDER BY "createdAt"',
        (order_ids, reservation_order_ids),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return counts

    payment_ids_src = [r["id"] for r in rows]

    for row in rows:
        _translate_fk(row, "orderId", id_map)
        _translate_fk(row, "reservationOrderId", id_map)
        _remap_row_id(dst_cur, "payments", row, id_map, warnings)

    bulk_insert(dst_cur, "payments", rows)
    counts["payments"] = len(rows)

    # Refunds
    counts["refunds"] = _migrate_refunds(src_cur, dst_cur, payment_ids_src, id_map, warnings)

    return counts


def _migrate_refunds(
    src_cur, dst_cur, payment_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "refunds" WHERE "paymentId" = ANY(%s)',
        (payment_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "orderId", id_map)
        _translate_fk(row, "reservationOrderId", id_map)
        _translate_fk(row, "paymentId", id_map)
        _remap_row_id(dst_cur, "refunds", row, id_map, warnings)

    bulk_insert(dst_cur, "refunds", rows)
    return len(rows)
