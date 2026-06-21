"""
tables/fiscal.py

Migrates:
  - fiscal_transactions
  - fiscal_signing_queue
  - tss_outage_logs
  - fiscal_transaction_corrections
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
# FiscalTransactions
# ──────────────────────────────────────────────────────────────────────────────

def migrate_fiscal_transactions(
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
        'SELECT * FROM "fiscal_transactions" WHERE "organizationId" = %s ORDER BY "createdAt"',
        (org_id,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return counts

    transaction_ids_src = [r["id"] for r in rows]

    for row in rows:
        _translate_fk(row, "branchId", id_map)
        _translate_fk(row, "deviceId", id_map)
        _translate_fk(row, "orderId", id_map)
        _translate_fk(row, "reservationOrderId", id_map)
        _remap_row_id(dst_cur, "fiscal_transactions", row, id_map, warnings)

    bulk_insert(dst_cur, "fiscal_transactions", rows)
    counts["fiscal_transactions"] = len(rows)

    # FiscalTransactionCorrections
    counts["fiscal_transaction_corrections"] = _migrate_fiscal_transaction_corrections(
        src_cur, dst_cur, transaction_ids_src, id_map, warnings
    )

    return counts


def _migrate_fiscal_transaction_corrections(
    src_cur, dst_cur, transaction_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "fiscal_transaction_corrections" WHERE "fiscalTransactionId" = ANY(%s)',
        (transaction_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "branchId", id_map)
        _translate_fk(row, "deviceId", id_map)
        _translate_fk(row, "orderId", id_map)
        _translate_fk(row, "reservationOrderId", id_map)
        _translate_fk(row, "fiscalTransactionId", id_map)
        _remap_row_id(dst_cur, "fiscal_transaction_corrections", row, id_map, warnings)

    bulk_insert(dst_cur, "fiscal_transaction_corrections", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# FiscalSigningQueue
# ──────────────────────────────────────────────────────────────────────────────

def migrate_fiscal_signing_queue(
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

    # Get order IDs for this org's branches
    src_cur.execute(
        'SELECT "id" FROM "orders" WHERE "branchId" = ANY(%s)',
        (branch_ids,),
    )
    order_ids = [r["id"] for r in src_cur.fetchall()]
    if not order_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "fiscal_signing_queue" WHERE "orderId" = ANY(%s)',
        (order_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "orderId", id_map)
        _remap_row_id(dst_cur, "fiscal_signing_queue", row, id_map, warnings)

    bulk_insert(dst_cur, "fiscal_signing_queue", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# TssOutageLogs
# ──────────────────────────────────────────────────────────────────────────────

def migrate_tss_outage_logs(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    src_cur.execute(
        'SELECT * FROM "tss_outage_logs" WHERE "organizationId" = %s ORDER BY "createdAt"',
        (org_id,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _remap_row_id(dst_cur, "tss_outage_logs", row, id_map, warnings)

    bulk_insert(dst_cur, "tss_outage_logs", rows)
    return len(rows)
