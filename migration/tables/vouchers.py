"""
tables/vouchers.py

Migrates:
  - vouchers
  - voucher_transactions
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
# Vouchers
# ──────────────────────────────────────────────────────────────────────────────

def migrate_vouchers(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    # Vouchers are global (not org-scoped), so we migrate all of them
    # But skip if they already exist (from previous org migration)
    src_cur.execute(
        'SELECT * FROM "vouchers"',
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return counts

    inserted = 0
    for row in rows:
        # Check if voucher already exists by voucherCode
        dst_cur.execute(
            'SELECT "id" FROM "vouchers" WHERE "voucherCode" = %s',
            (row["voucherCode"],),
        )
        existing = dst_cur.fetchone()
        if existing:
            # Map source ID to existing destination ID
            id_map[row["id"]] = existing["id"]
            warnings.append(
                f"vouchers: voucherCode '{row['voucherCode']}' already exists; mapped"
            )
            continue
        else:
            _remap_row_id(dst_cur, "vouchers", row, id_map, warnings)

        try:
            dst_cur.execute("SAVEPOINT voucher_insert")
            bulk_insert(dst_cur, "vouchers", [row])
            dst_cur.execute("RELEASE SAVEPOINT voucher_insert")
            inserted += 1
        except psycopg2.errors.UniqueViolation:
            dst_cur.execute("ROLLBACK TO SAVEPOINT voucher_insert")
            warnings.append(
                f"vouchers: voucherCode '{row['voucherCode']}' unique constraint violation; skipped"
            )

    counts["vouchers"] = inserted

    # VoucherTransactions
    # Get all voucher IDs from source
    src_cur.execute('SELECT "id" FROM "vouchers"')
    voucher_ids_src = [r["id"] for r in src_cur.fetchall()]
    counts["voucher_transactions"] = _migrate_voucher_transactions(
        src_cur, dst_cur, org_id, voucher_ids_src, id_map, warnings
    )

    return counts


def _migrate_voucher_transactions(
    src_cur, dst_cur, org_id: str, voucher_ids: List[str], id_map: Dict, warnings: List
) -> int:
    # Get branch IDs for this org
    src_cur.execute(
        'SELECT "id" FROM "branches" WHERE "organizationId" = %s',
        (org_id,),
    )
    branch_ids = [r["id"] for r in src_cur.fetchall()]

    # Get order IDs for this org's branches
    src_cur.execute(
        'SELECT "id" FROM "orders" WHERE "branchId" = ANY(%s)',
        (branch_ids,),
    )
    order_ids = [r["id"] for r in src_cur.fetchall()]

    src_cur.execute(
        'SELECT * FROM "voucher_transactions" WHERE "voucherId" = ANY(%s) AND ("orderId" IS NULL OR "orderId" = ANY(%s))',
        (voucher_ids, order_ids),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "voucherId", id_map)
        _translate_fk(row, "orderId", id_map)
        _remap_row_id(dst_cur, "voucher_transactions", row, id_map, warnings)

    bulk_insert(dst_cur, "voucher_transactions", rows)
    return len(rows)
