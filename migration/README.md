# Bellami Database Migration Tool

Migrates selected organizations (and all their dependent data) from a **source PostgreSQL database** (optionally accessed via SSH tunnel to a VPS) to a **destination AWS PostgreSQL database**, without copying orders, reservations, or logs.

---

## Prerequisites

- Python 3.11+
- Access credentials for source DB (VPS) and destination DB (AWS RDS)
- SSH private key or password for the VPS (if using SSH tunnel)

---

## Setup

```bash
cd migration

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy the example env file and fill in your credentials
cp .env.example .env
```

---

## Configuration (`.env`)

| Variable | Required | Description |
|---|---|---|
| `SRC_SSH_HOST` | if using SSH | VPS hostname or IP |
| `SRC_SSH_PORT` | no (default 22) | SSH port |
| `SRC_SSH_USER` | if SSH | SSH username |
| `SRC_SSH_KEY_PATH` | if SSH (or password) | Path to private key file |
| `SRC_SSH_PASSWORD` | if SSH (or key) | SSH password |
| `SRC_DB_HOST` | **yes** | DB host as seen from **inside** the VPS (usually `127.0.0.1`) |
| `SRC_DB_PORT` | no (default 5432) | DB port |
| `SRC_DB_NAME` | **yes** | Source database name |
| `SRC_DB_USER` | **yes** | DB username |
| `SRC_DB_PASSWORD` | **yes** | DB password |
| `DST_DB_HOST` | **yes** | AWS RDS endpoint |
| `DST_DB_PORT` | no (default 5432) | DB port |
| `DST_DB_NAME` | **yes** | Destination database name |
| `DST_DB_USER` | **yes** | DB username |
| `DST_DB_PASSWORD` | **yes** | DB password |
| `DST_SSH_HOST` | optional | Only if destination also needs SSH tunnel |
| `DST_SSH_*` | optional | Same pattern as source SSH fields |

---

## Usage

### Dry run (preview only — no writes)

```bash
python migrate.py --org-ids org_abc org_def --dry-run
```

### Migrate organizations

```bash
python migrate.py --org-ids org_abc org_def
```

### Migrate with verbose output + JSON report

```bash
python migrate.py --org-ids org_abc --verbose --report migration_report.json
```

### Re-migrate an org (overwrite existing data in destination)

```bash
python migrate.py --org-ids org_abc --on-conflict overwrite
```

### Abort on first conflict

```bash
python migrate.py --org-ids org_abc --on-conflict abort
```

---

## What Gets Migrated

| Entity | Notes |
|---|---|
| `organizations` | Validation fields reset (destination starts fresh) |
| `settings` | Fiskaly credentials **reset to NULL** (env-specific) |
| `reservation_settings` | Fully copied |
| `hero_sections` | Fully copied |
| `roles` | Custom roles only (`isSystem = false`) |
| `branch_types` | Global table — upsert by slug (skip if exists) |
| `branches` | All org branches |
| `zones` + `tables` + `floor_elements` | Table status reset → `AVAILABLE` |
| `categories` + `declarations` + `optional_ingredients` | Menu taxonomy |
| `addons` + `addon_sizes` + `addon_categories` + `addon_branch_prices` | |
| `meals` + all sub-tables | Prices, availabilities, sizes, weights, deliverables, junctions |
| `deals` + all sub-tables | Components, prices, junctions |
| `pos_devices` | Fiskaly provisioning fields reset |

## What Is Excluded

- `orders`, `order_items`, and all order sub-tables
- `reservations`, `reservation_orders`, and sub-tables
- `audit_logs`, `kitchen_tickets`, `notifications`
- `business_day_sessions` and related fiscal/DSFinV-K tables
- `fiscal_transactions` and corrections
- `users`, `user_branches`, `user_role_assignments` (Clerk-auth–bound)
- `organization_validations`, `validation_payments`
- `push_subscriptions`, `push_notifications` and sub-tables
- `branch_clicks`, `terms_and_policies`, `policy_user_consents`

---

## Safety Features

- **Per-org transactions** — rollback entire org on any failure; never partial writes
- **Idempotent** — a `_migration_journal` table in the destination prevents double-migration on re-runs
- **ID collision detection** — if a record's ID already exists in the destination, a new cuid is generated and all FK references are remapped automatically
- **`excludedBranches` array translation** — branch IDs in these arrays are translated to destination IDs; unknown IDs are stripped with a warning
- **Fiskaly credentials stripped** — no TSS secrets leak from source to destination
- **Dry-run mode** — shows expected row counts per table without touching the database

---

## Migration Journal

A `_migration_journal` table is automatically created in the destination database:

```sql
SELECT * FROM _migration_journal;
```

To clear the journal for a specific org (allow re-migration):

```sql
DELETE FROM _migration_journal WHERE org_id = 'org_abc';
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `SSH key file not found` | Check `SRC_SSH_KEY_PATH` points to a valid private key file |
| `Failed to connect to database` | Verify DB host/port/credentials; for VPS, ensure `SRC_DB_HOST=127.0.0.1` (not the VPS IP) |
| `Organization not found in source` | Double-check the org ID — it must exist in the source DB |
| `Conflict detected (abort)` | Use `--on-conflict skip` or `--on-conflict overwrite` |
| Partial migration / rollback | Check the error message; fix the issue, then re-run (journal prevents double-insert) |
