"""
tables/organization.py

Migrates:
  - organizations
  - settings               (1-to-1, Fiskaly fields reset)
  - reservation_settings   (1-to-1)
  - hero_sections          (1-to-1)
  - roles                  (custom roles only — isSystem=false)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import psycopg2.extras

from tables.helpers import (
    bulk_insert,
    row_to_dict,
    rows_to_dicts,
    translate_id,
    upsert_insert,
)

# Fiskaly fields to reset to NULL in settings + pos_devices
_FISKALY_SETTINGS_FIELDS = [
    "fiskalyClientId",
    "fiskalyClientSecret",
    "fiskalyManagedOrganizationId",
    "fiskalyTssId",
    "fiskalyTssAdminPuk",
    "fiskalyTssAdminPinEncrypted",
    "fiskalyProvisioningStatus",
    "fiskalyProvisioningLastErrorCode",
    "fiskalyProvisioningLastErrorMessage",
    "fiskalyProvisionedAt",
    "fiskalyApiBaseUrl",
    "fiskalyEnabled",
]


# ──────────────────────────────────────────────────────────────────────────────
# Organization
# ──────────────────────────────────────────────────────────────────────────────

def fetch_organization(src_cur: psycopg2.extras.DictCursor, org_id: str) -> Optional[Dict]:
    src_cur.execute('SELECT * FROM "organizations" WHERE "id" = %s', (org_id,))
    row = src_cur.fetchone()
    return row_to_dict(row) if row else None


def slug_exists_in_dst(dst_cur: psycopg2.extras.DictCursor, slug: str) -> bool:
    dst_cur.execute('SELECT 1 FROM "organizations" WHERE "slug" = %s', (slug,))
    return dst_cur.fetchone() is not None


def id_exists_in_dst(dst_cur: psycopg2.extras.DictCursor, org_id: str) -> bool:
    dst_cur.execute('SELECT 1 FROM "organizations" WHERE "id" = %s', (org_id,))
    return dst_cur.fetchone() is not None


def delete_organization_cascade(dst_cur: psycopg2.extras.DictCursor, org_id: str) -> None:
    """Delete org by ID — cascades to all child tables."""
    dst_cur.execute('DELETE FROM "organizations" WHERE "id" = %s', (org_id,))


def insert_organization(dst_cur: psycopg2.extras.DictCursor, org: Dict) -> None:
    # Strip validation fields — destination starts fresh
    strip_fields = [
        "isValidated", "validatedAt", "validatedBy", "validationExpiresAt",
        "validationNotes", "gracePeriodEndsAt",
    ]
    row = {k: v for k, v in org.items() if k not in strip_fields}
    # Reset validation state
    row["isValidated"] = False
    row["validatedAt"] = None
    row["validatedBy"] = None
    row["validationExpiresAt"] = None
    row["validationNotes"] = None
    row["gracePeriodEndsAt"] = None
    bulk_insert(dst_cur, "organizations", [row])


# ──────────────────────────────────────────────────────────────────────────────
# Settings
# ──────────────────────────────────────────────────────────────────────────────

def migrate_settings(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    src_cur.execute('SELECT * FROM "settings" WHERE "organizationId" = %s', (org_id,))
    row = src_cur.fetchone()
    if not row:
        return 0

    settings = row_to_dict(row)

    # Reset Fiskaly credentials — they are environment-specific
    for f in _FISKALY_SETTINGS_FIELDS:
        if f in settings:
            if f == "fiskalyEnabled":
                settings[f] = False
            else:
                settings[f] = None

    # Translate mainBranchId
    if settings.get("mainBranchId"):
        mapped = id_map.get(settings["mainBranchId"])
        if mapped:
            settings["mainBranchId"] = mapped
        else:
            warnings.append(
                f"settings.mainBranchId '{settings['mainBranchId']}' not found in migrated branches; set to NULL"
            )
            settings["mainBranchId"] = None

    bulk_insert(dst_cur, "settings", [settings])
    return 1


# ──────────────────────────────────────────────────────────────────────────────
# ReservationSettings
# ──────────────────────────────────────────────────────────────────────────────

def migrate_reservation_settings(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    warnings: List[str],
) -> int:
    src_cur.execute(
        'SELECT * FROM "reservation_settings" WHERE "organizationId" = %s', (org_id,)
    )
    row = src_cur.fetchone()
    if not row:
        return 0
    bulk_insert(dst_cur, "reservation_settings", [row_to_dict(row)])
    return 1


# ──────────────────────────────────────────────────────────────────────────────
# HeroSection
# ──────────────────────────────────────────────────────────────────────────────

def migrate_hero_section(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    warnings: List[str],
) -> int:
    src_cur.execute(
        'SELECT * FROM "hero_sections" WHERE "organizationId" = %s', (org_id,)
    )
    row = src_cur.fetchone()
    if not row:
        return 0
    bulk_insert(dst_cur, "hero_sections", [row_to_dict(row)])
    return 1


# ──────────────────────────────────────────────────────────────────────────────
# Roles  (custom only)
# ──────────────────────────────────────────────────────────────────────────────

def migrate_roles(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> int:
    src_cur.execute(
        'SELECT * FROM "roles" WHERE "organizationId" = %s AND "isSystem" = false',
        (org_id,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for r in rows:
        id_map[r["id"]] = r["id"]  # roles keep their IDs

    # ON CONFLICT DO NOTHING on (organizationId, name) unique constraint
    # We use bulk_insert but guard via upsert to skip duplicate role names
    inserted = 0
    for row in rows:
        try:
            dst_cur.execute("SAVEPOINT role_insert")
            bulk_insert(dst_cur, "roles", [row])
            dst_cur.execute("RELEASE SAVEPOINT role_insert")
            inserted += 1
        except psycopg2.errors.UniqueViolation:
            dst_cur.execute("ROLLBACK TO SAVEPOINT role_insert")
            warnings.append(
                f"Role '{row['name']}' already exists for org {org_id}; skipped"
            )

    return inserted
