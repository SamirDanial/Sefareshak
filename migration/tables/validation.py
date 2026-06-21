"""
tables/validation.py

Migrates:
  - organization_validations
  - validation_payments
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
# OrganizationValidations
# ──────────────────────────────────────────────────────────────────────────────

def migrate_organization_validations(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    src_cur.execute(
        'SELECT * FROM "organization_validations" WHERE "organizationId" = %s',
        (org_id,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return counts

    validation_ids_src = [r["id"] for r in rows]

    for row in rows:
        _translate_fk(row, "organizationId", id_map)
        _remap_row_id(dst_cur, "organization_validations", row, id_map, warnings)

    bulk_insert(dst_cur, "organization_validations", rows)
    counts["organization_validations"] = len(rows)

    # ValidationPayments
    counts["validation_payments"] = _migrate_validation_payments(
        src_cur, dst_cur, validation_ids_src, id_map, warnings
    )

    return counts


def _migrate_validation_payments(
    src_cur, dst_cur, validation_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "validation_payments" WHERE "validationId" = ANY(%s)',
        (validation_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "organizationId", id_map)
        _translate_fk(row, "validationId", id_map)
        _remap_row_id(dst_cur, "validation_payments", row, id_map, warnings)

    bulk_insert(dst_cur, "validation_payments", rows)
    return len(rows)
