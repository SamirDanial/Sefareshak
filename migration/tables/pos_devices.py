"""
tables/pos_devices.py

Migrates:
  - pos_devices  (per-org/branch; Fiskaly provisioning fields reset)
"""

from __future__ import annotations

from typing import Dict, List

import psycopg2.extras

from tables.helpers import bulk_insert, new_cuid, rows_to_dicts

# Fiskaly fields to reset on pos_devices
_FISKALY_DEVICE_FIELDS = [
    "fiskalyClientId",
    "fiskalyClientSerialNumber",
    "fiskalyClientProvisioningStatus",
    "fiskalyClientProvisioningLastErrorCode",
    "fiskalyClientProvisioningLastErrorMessage",
    "fiskalyDeprovisioned",
    "deletedAt",
    "deletedBy",
    "deletionReason",
]


def migrate_pos_devices(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    src_cur.execute(
        'SELECT * FROM "pos_devices" WHERE "organizationId" = %s',
        (org_id,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    out = []
    for row in rows:
        # Translate branchId
        new_branch = id_map.get(row["branchId"])
        if not new_branch:
            warnings.append(
                f"pos_devices: branchId '{row['branchId']}' not in migrated branches; skipped device id={row['id']}"
            )
            continue
        row["branchId"] = new_branch

        # Reset Fiskaly provisioning — credentials are TSS/env-specific
        for f in _FISKALY_DEVICE_FIELDS:
            if f in row:
                if f == "fiskalyDeprovisioned":
                    row[f] = False
                else:
                    row[f] = None

        # Reset soft-delete state
        row["isDeleted"] = False

        # Handle ID collision
        dst_cur.execute('SELECT 1 FROM "pos_devices" WHERE "id" = %s', (row["id"],))
        if dst_cur.fetchone():
            new_id = new_cuid()
            warnings.append(f"pos_devices id collision '{row['id']}'; remapped → {new_id}")
            id_map[row["id"]] = new_id
            row["id"] = new_id
        else:
            id_map.setdefault(row["id"], row["id"])

        # Handle unique(organizationId, deviceCode) — if code exists, append suffix
        dst_cur.execute(
            'SELECT 1 FROM "pos_devices" WHERE "organizationId" = %s AND "deviceCode" = %s',
            (org_id, row["deviceCode"]),
        )
        if dst_cur.fetchone():
            import time
            suffix = str(int(time.time()))[-4:]
            old_code = row["deviceCode"]
            row["deviceCode"] = f"{old_code}_{suffix}"
            warnings.append(
                f"pos_devices deviceCode '{old_code}' already exists; renamed to '{row['deviceCode']}'"
            )

        out.append(row)

    if out:
        bulk_insert(dst_cur, "pos_devices", out)
    return len(out)
