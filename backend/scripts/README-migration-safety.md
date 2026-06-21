# Migration Safety Checklist (Backup & Rollback Testing)

## Testing on Staging

1. **Backup Test**
   - Set `DATABASE_URL` to staging DB.
   - Run `./backup-before-migration.sh ./backups-staging`.
   - Verify backup file exists and is non-empty.

2. **Rollback Test**
   - Temporarily apply a harmless change (e.g., create a temp table).
   - Run `./rollback-migration.sh ./backups-staging/<backup_file>.dump`.
   - Verify temp change is reverted.

3. **Verification**
   - Run `npx ts-node backend/scripts/pre-migration-counts.ts` to confirm counts.
   - Review logs and backup locations.

> Do NOT run these against production without a confirmed maintenance window.

