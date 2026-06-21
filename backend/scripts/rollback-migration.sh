#!/usr/bin/env bash
# Rollback script to restore database from a backup created by backup-before-migration.sh
# Usage:
#   DATABASE_URL="postgres://..." ./rollback-migration.sh /path/to/backup_file.dump
# Notes:
#   - Stops on first error.
#   - Does NOT manage application processes; ensure app services are stopped before running.

set -euo pipefail

BACKUP_FILE="${1:-}"

log() { echo "[rollback] $*"; }
fail() { echo "[rollback][error] $*" >&2; exit 1; }

[[ -n "${BACKUP_FILE}" ]] || fail "Backup file path is required"
[[ -f "${BACKUP_FILE}" ]] || fail "Backup file not found: ${BACKUP_FILE}"
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL environment variable is required"

command -v pg_restore >/dev/null 2>&1 || fail "pg_restore is required but not found in PATH"

log "Restoring database from ${BACKUP_FILE}"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="${DATABASE_URL}" "${BACKUP_FILE}"

log "Rollback completed successfully"

