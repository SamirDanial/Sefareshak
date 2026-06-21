#!/usr/bin/env bash
# Export payment-related tables to CSV before migration.
# Usage:
#   DATABASE_URL="postgres://..." ./export-payments-data.sh [output_dir]
# Requires: psql in PATH.

set -euo pipefail

OUTPUT_DIR="${1:-./exports}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

log() { echo "[export] $*"; }
fail() { echo "[export][error] $*" >&2; exit 1; }

command -v psql >/dev/null 2>&1 || fail "psql is required but not found in PATH"
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL environment variable is required"

mkdir -p "${OUTPUT_DIR}"

run_export() {
  local query="$1"
  local filename="$2"
  local filepath="${OUTPUT_DIR}/${filename}_${TIMESTAMP}.csv"
  log "Exporting to ${filepath}"
  psql "${DATABASE_URL}" -c "\copy (${query}) TO STDOUT WITH CSV HEADER" > "${filepath}"
}

run_export "SELECT * FROM orders WHERE paymentIntentId IS NOT NULL OR paymentMethod = 'ONLINE_PAYMENT'" "orders_payments"
run_export "SELECT * FROM reservation_orders WHERE paymentIntentId IS NOT NULL" "reservation_orders_payments"
run_export "SELECT * FROM refunds" "refunds"

log "Exports completed. Files stored in ${OUTPUT_DIR}"

