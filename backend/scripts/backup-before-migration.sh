#!/usr/bin/env bash
# Backup script to create a full PostgreSQL dump before payment migration.
# Usage:
#   DATABASE_URL="postgres://user:pass@host:port/db" ./backup-before-migration.sh [output_dir]
# Notes:
#   - Requires pg_dump to be installed and accessible in PATH.
#   - Produces a custom-format dump (*.dump) suitable for pg_restore.
#   - Exits non-zero on any error.

set -euo pipefail

OUTPUT_DIR="${1:-./backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${OUTPUT_DIR}/backup_${TIMESTAMP}.dump"

log() {
  echo "[backup] $*"
}

fail() {
  echo "[backup][error] $*" >&2
  exit 1
}

command -v pg_dump >/dev/null 2>&1 || fail "pg_dump is required but not found in PATH"

if [[ -z "${DATABASE_URL:-}" ]]; then
  fail "DATABASE_URL environment variable is required"
fi

mkdir -p "${OUTPUT_DIR}"

log "Starting backup to ${BACKUP_FILE}"
pg_dump --format=custom --file="${BACKUP_FILE}" "${DATABASE_URL}"

if [[ ! -s "${BACKUP_FILE}" ]]; then
  fail "Backup file was not created or is empty: ${BACKUP_FILE}"
fi

log "Backup completed successfully: ${BACKUP_FILE}"

