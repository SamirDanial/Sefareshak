"""
helpers.py — Shared utilities for table migration modules.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

import psycopg2.extras
import psycopg2.extensions


# ---------------------------------------------------------------------------
# ID utilities
# ---------------------------------------------------------------------------

def new_cuid() -> str:
    """Generate a simple cuid-compatible unique ID (prefixed UUID4, no dashes)."""
    return "c" + uuid.uuid4().hex


def translate_id(original: Optional[str], id_map: Dict[str, str]) -> Optional[str]:
    """Return the mapped ID if present, else the original."""
    if original is None:
        return None
    return id_map.get(original, original)


def translate_id_list(ids: List[str], id_map: Dict[str, str]) -> List[str]:
    """Translate a list of IDs; drop any that aren't in id_map AND aren't found in dst."""
    return [id_map.get(i, i) for i in ids if i]


# ---------------------------------------------------------------------------
# Batch insert helper
# ---------------------------------------------------------------------------

def _serialize_value(v: Any) -> Any:
    """
    Prepare a value for psycopg2:
    - dicts → JSON string (for JSONB columns)
    - list of dicts → JSON string (for JSONB[] / Json columns that hold object arrays)
    - list of scalars → Python list (psycopg2 adapts natively to Postgres text[]/int[])
    - everything else → unchanged
    """
    if isinstance(v, dict):
        return json.dumps(v)
    if isinstance(v, list) and v and isinstance(v[0], dict):
        return json.dumps(v)
    return v


def _serialize_row(row: Dict[str, Any], columns: List[str]) -> tuple:
    return tuple(_serialize_value(row[c]) for c in columns)


def bulk_insert(
    cur: psycopg2.extras.DictCursor,
    table: str,
    rows: List[Dict[str, Any]],
) -> int:
    """
    Insert a list of row dicts into `table`.
    Columns are derived from the first row's keys.
    Returns the number of rows inserted.
    """
    if not rows:
        return 0

    columns = list(rows[0].keys())
    placeholders = ",".join(["%s"] * len(columns))
    col_names = ",".join(f'"{c}"' for c in columns)
    sql = f'INSERT INTO "{table}" ({col_names}) VALUES ({placeholders})'

    data = [_serialize_row(row, columns) for row in rows]
    psycopg2.extras.execute_batch(cur, sql, data, page_size=200)
    return len(rows)


def upsert_insert(
    cur: psycopg2.extras.DictCursor,
    table: str,
    rows: List[Dict[str, Any]],
    conflict_col: str = "id",
) -> int:
    """
    INSERT … ON CONFLICT (conflict_col) DO NOTHING.
    Returns rows inserted (not counting skipped).
    """
    if not rows:
        return 0

    columns = list(rows[0].keys())
    placeholders = ",".join(["%s"] * len(columns))
    col_names = ",".join(f'"{c}"' for c in columns)
    sql = (
        f'INSERT INTO "{table}" ({col_names}) VALUES ({placeholders}) '
        f'ON CONFLICT ("{conflict_col}") DO NOTHING'
    )

    data = [_serialize_row(row, columns) for row in rows]
    psycopg2.extras.execute_batch(cur, sql, data, page_size=200)
    return len(rows)


# ---------------------------------------------------------------------------
# Row → dict helpers
# ---------------------------------------------------------------------------

def row_to_dict(row: psycopg2.extras.DictRow) -> Dict[str, Any]:
    return dict(row)


def rows_to_dicts(rows: List[psycopg2.extras.DictRow]) -> List[Dict[str, Any]]:
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Collision check / ID remap
# ---------------------------------------------------------------------------

def check_and_remap_id(
    cur: psycopg2.extras.DictCursor,
    table: str,
    record_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> str:
    """
    Check if `record_id` already exists in `table` on the destination.
    If so, generate a new ID, register it in id_map, and return the new ID.
    """
    cur.execute(f'SELECT 1 FROM "{table}" WHERE "id" = %s', (record_id,))
    if cur.fetchone():
        new_id = new_cuid()
        id_map[record_id] = new_id
        warnings.append(
            f"ID collision in '{table}' for id={record_id}; remapped → {new_id}"
        )
        return new_id
    return record_id


# ---------------------------------------------------------------------------
# excludedBranches array translation
# ---------------------------------------------------------------------------

def translate_excluded_branches(
    excluded: List[str],
    id_map: Dict[str, str],
    warnings: List[str],
    context: str = "",
) -> List[str]:
    """
    Translate a source excludedBranches array to destination branch IDs.
    IDs not present in id_map are dropped with a warning.
    """
    result = []
    for bid in excluded:
        if bid in id_map:
            result.append(id_map[bid])
        else:
            warnings.append(
                f"excludedBranches: unknown branchId '{bid}' dropped{' in ' + context if context else ''}"
            )
    return result
