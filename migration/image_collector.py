"""
image_collector.py — Query source DB for all image URLs belonging to given org IDs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List
from urllib.parse import urlparse

import psycopg2.extras


@dataclass
class ImageRecord:
    url: str               # full URL as stored in the DB
    relative_path: str     # e.g. /uploads/meals/abc.jpg
    table: str
    column: str
    row_id: str
    org_id: str


# Maps (table, column) → query to fetch (row_id, org_id, url)
_IMAGE_QUERIES = [
    (
        "settings", "businessLogo",
        'SELECT "id", "organizationId" AS "orgId", "businessLogo" AS url FROM "settings" WHERE "organizationId" = ANY(%s) AND "businessLogo" IS NOT NULL AND "businessLogo" != \'\'',
    ),
    (
        "settings", "seoOgImage",
        'SELECT "id", "organizationId" AS "orgId", "seoOgImage" AS url FROM "settings" WHERE "organizationId" = ANY(%s) AND "seoOgImage" IS NOT NULL AND "seoOgImage" != \'\'',
    ),
    (
        "hero_sections", "backgroundImage",
        'SELECT "id", "organizationId" AS "orgId", "backgroundImage" AS url FROM "hero_sections" WHERE "organizationId" = ANY(%s) AND "backgroundImage" IS NOT NULL AND "backgroundImage" != \'\'',
    ),
    (
        "branches", "branchImage",
        'SELECT "id", "organizationId" AS "orgId", "branchImage" AS url FROM "branches" WHERE "organizationId" = ANY(%s) AND "branchImage" IS NOT NULL AND "branchImage" != \'\'',
    ),
    (
        "categories", "image",
        'SELECT "id", "organizationId" AS "orgId", "image" AS url FROM "categories" WHERE "organizationId" = ANY(%s) AND "image" IS NOT NULL AND "image" != \'\'',
    ),
    (
        "meals", "image",
        'SELECT "id", "organizationId" AS "orgId", "image" AS url FROM "meals" WHERE "organizationId" = ANY(%s) AND "image" IS NOT NULL AND "image" != \'\'',
    ),
    (
        "deals", "image",
        'SELECT "id", "organizationId" AS "orgId", "image" AS url FROM "deals" WHERE "organizationId" = ANY(%s) AND "image" IS NOT NULL AND "image" != \'\'',
    ),
    (
        "addons", "image",
        'SELECT "id", "organizationId" AS "orgId", "image" AS url FROM "addons" WHERE "organizationId" = ANY(%s) AND "image" IS NOT NULL AND "image" != \'\'',
    ),
]


def _to_relative(url: str, src_base_url: str) -> str:
    """
    Convert a stored image value to a relative path under the upload root.

    Handles three formats:
      https://feetages.cloud/uploads/meals/abc.jpg  →  /uploads/meals/abc.jpg
      /uploads/meals/abc.jpg                        →  /uploads/meals/abc.jpg
      abc.jpg  (bare filename, no path)             →  /abc.jpg
    """
    stripped = src_base_url.rstrip("/")
    if url.startswith(stripped):
        rel = url[len(stripped):]
        return rel if rel.startswith("/") else "/" + rel
    parsed = urlparse(url)
    if parsed.scheme in ("http", "https"):
        # Full URL from a different host — take the path component
        return parsed.path if parsed.path else "/" + url
    if url.startswith("/"):
        return url
    # Bare filename — prepend slash so it sits directly in the upload root
    return "/" + url


def collect_images(
    cur: psycopg2.extras.DictCursor,
    org_ids: List[str],
    src_base_url: str,
) -> List[ImageRecord]:
    """
    Return a deduplicated list of ImageRecord for all org IDs.
    Records with unparseable/empty relative paths are skipped with a warning.
    """
    seen_paths: set = set()
    records: List[ImageRecord] = []

    for table, column, query in _IMAGE_QUERIES:
        cur.execute(query, (org_ids,))
        rows = cur.fetchall()
        for row in rows:
            url = row["url"]
            if not url:
                continue
            rel = _to_relative(url, src_base_url)
            if not rel or rel in ("/", ""):
                continue
            if rel in seen_paths:
                continue
            seen_paths.add(rel)
            records.append(ImageRecord(
                url=url,
                relative_path=rel,
                table=table,
                column=column,
                row_id=row["id"],
                org_id=row["orgId"],
            ))

    return records
