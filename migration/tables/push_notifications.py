"""
tables/push_notifications.py

Migrates:
  - push_subscriptions
  - push_notifications
  - push_notification_deliveries
  - push_notification_clicks
  - branch_clicks
  - branch_subscriptions
  - branch_likes
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
# PushSubscriptions
# ──────────────────────────────────────────────────────────────────────────────

def migrate_push_subscriptions(
    src_cur: psycopg2.extras.DictCursor,
    dst_cur: psycopg2.extras.DictCursor,
    org_id: str,
    id_map: Dict[str, str],
    warnings: List[str],
) -> Dict[str, int]:
    counts: Dict[str, int] = {}

    # Migrate ALL push_subscriptions (they are global entities, not org-scoped)
    # This ensures all subscriptions referenced by deliveries are available
    src_cur.execute(
        'SELECT * FROM "push_subscriptions" ORDER BY "createdAt"',
    )
    rows = rows_to_dicts(src_cur.fetchall())
    
    if not rows:
        return counts

    for row in rows:
        _translate_fk(row, "userId", id_map)
        _translate_fk(row, "organizationId", id_map)
        _translate_fk(row, "branchId", id_map)
        _remap_row_id(dst_cur, "push_subscriptions", row, id_map, warnings)

    bulk_insert(dst_cur, "push_subscriptions", rows)
    counts["push_subscriptions"] = len(rows)

    return counts


# ──────────────────────────────────────────────────────────────────────────────
# PushNotifications
# ──────────────────────────────────────────────────────────────────────────────

def migrate_push_notifications(
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
        'SELECT * FROM "push_notifications" WHERE "organizationId" = %s OR "branchId" = ANY(%s) ORDER BY "createdAt"',
        (org_id, branch_ids),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return counts

    notification_ids_src = [r["id"] for r in rows]

    for row in rows:
        _translate_fk(row, "organizationId", id_map)
        _translate_fk(row, "branchId", id_map)
        _remap_row_id(dst_cur, "push_notifications", row, id_map, warnings)

    bulk_insert(dst_cur, "push_notifications", rows)
    counts["push_notifications"] = len(rows)

    # PushNotificationDeliveries
    counts["push_notification_deliveries"] = _migrate_push_notification_deliveries(
        src_cur, dst_cur, notification_ids_src, id_map, warnings
    )

    # PushNotificationClicks
    counts["push_notification_clicks"] = _migrate_push_notification_clicks(
        src_cur, dst_cur, notification_ids_src, id_map, warnings
    )

    return counts


def _migrate_push_notification_deliveries(
    src_cur, dst_cur, notification_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "push_notification_deliveries" WHERE "notificationId" = ANY(%s)',
        (notification_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        _translate_fk(row, "notificationId", id_map)
        _translate_fk(row, "subscriptionId", id_map)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "push_notification_deliveries", out)
    return len(out)


def _migrate_push_notification_clicks(
    src_cur, dst_cur, notification_ids: List[str], id_map: Dict, warnings: List
) -> int:
    src_cur.execute(
        'SELECT * FROM "push_notification_clicks" WHERE "notificationId" = ANY(%s)',
        (notification_ids,),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    out = []
    for row in rows:
        _translate_fk(row, "notificationId", id_map)
        _translate_fk(row, "subscriptionId", id_map)
        out.append(row)
    if out:
        bulk_insert(dst_cur, "push_notification_clicks", out)
    return len(out)


# ──────────────────────────────────────────────────────────────────────────────
# BranchClicks
# ──────────────────────────────────────────────────────────────────────────────

def migrate_branch_clicks(
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

    # Get user IDs for this org
    src_cur.execute(
        'SELECT "id" FROM "users" WHERE "organizationId" = %s',
        (org_id,),
    )
    user_ids = [r["id"] for r in src_cur.fetchall()]

    src_cur.execute(
        'SELECT * FROM "branch_clicks" WHERE "branchId" = ANY(%s) OR ("userId" IS NOT NULL AND "userId" = ANY(%s)) ORDER BY "clickTime"',
        (branch_ids, user_ids),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "branchId", id_map)
        _translate_fk(row, "userId", id_map)
        _remap_row_id(dst_cur, "branch_clicks", row, id_map, warnings)

    bulk_insert(dst_cur, "branch_clicks", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# BranchSubscriptions
# ──────────────────────────────────────────────────────────────────────────────

def migrate_branch_subscriptions(
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

    # Get user IDs for this org
    src_cur.execute(
        'SELECT "id" FROM "users" WHERE "organizationId" = %s',
        (org_id,),
    )
    user_ids = [r["id"] for r in src_cur.fetchall()]
    if not user_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "branch_subscriptions" WHERE "branchId" = ANY(%s) AND "userId" = ANY(%s)',
        (branch_ids, user_ids),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "branchId", id_map)
        _translate_fk(row, "userId", id_map)
        _remap_row_id(dst_cur, "branch_subscriptions", row, id_map, warnings)

    bulk_insert(dst_cur, "branch_subscriptions", rows)
    return len(rows)


# ──────────────────────────────────────────────────────────────────────────────
# BranchLikes
# ──────────────────────────────────────────────────────────────────────────────

def migrate_branch_likes(
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

    # Get user IDs for this org
    src_cur.execute(
        'SELECT "id" FROM "users" WHERE "organizationId" = %s',
        (org_id,),
    )
    user_ids = [r["id"] for r in src_cur.fetchall()]
    if not user_ids:
        return 0

    src_cur.execute(
        'SELECT * FROM "branch_likes" WHERE "branchId" = ANY(%s) AND "userId" = ANY(%s)',
        (branch_ids, user_ids),
    )
    rows = rows_to_dicts(src_cur.fetchall())
    if not rows:
        return 0

    for row in rows:
        _translate_fk(row, "branchId", id_map)
        _translate_fk(row, "userId", id_map)
        _remap_row_id(dst_cur, "branch_likes", row, id_map, warnings)

    bulk_insert(dst_cur, "branch_likes", rows)
    return len(rows)
