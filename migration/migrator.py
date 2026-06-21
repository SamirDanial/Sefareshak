"""
migrator.py — Core migration orchestrator.

Processes one organization at a time, wrapped in a single destination transaction.
"""

from __future__ import annotations

import time
from typing import Dict, List, Optional

import psycopg2
import psycopg2.extras
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn

from connection import (
    ensure_journal_table,
    journal_is_migrated,
    journal_record,
)
from tables.organization import (
    fetch_organization,
    slug_exists_in_dst,
    id_exists_in_dst,
    delete_organization_cascade,
    insert_organization,
    migrate_settings,
    migrate_reservation_settings,
    migrate_hero_section,
    migrate_roles,
)
from tables.branches import (
    migrate_branch_types,
    migrate_branches,
    migrate_zones,
    migrate_tables,
    migrate_floor_elements,
)
from tables.menu import (
    migrate_categories,
    migrate_declarations,
    migrate_optional_ingredients,
    migrate_meals,
    migrate_meal_junctions,
    migrate_deals,
)
from tables.addons import migrate_addons
from tables.pos_devices import migrate_pos_devices
# User-related tables excluded per user request
# from tables.users import (
#     migrate_users,
#     migrate_user_addresses,
#     migrate_user_branches,
#     migrate_user_role_assignments,
# )
# from tables.orders import (
#     migrate_business_day_sessions,  # Has closedByUserId - excluded
#     migrate_business_day_reports,    # References sessions - excluded
#     migrate_business_day_dsfinvk_submissions,  # References sessions - excluded
# )
# tables.reservations and tables.payments imports removed (all functions excluded)
# Fiscal tables excluded (reference orders which are excluded)
# from tables.fiscal import (
#     migrate_fiscal_transactions,
#     migrate_fiscal_signing_queue,
#     migrate_tss_outage_logs,
# )
# Push notification tables excluded (have userId FK)
# from tables.push_notifications import (
#     migrate_push_subscriptions,
#     migrate_push_notifications,
#     migrate_branch_clicks,
#     migrate_branch_subscriptions,
#     migrate_branch_likes,
# )
from tables.policies import (
    migrate_terms_and_policies,
    # migrate_audit_logs,  # May have userId - excluded
)
# from tables.vouchers import migrate_vouchers  # Excluded per user request
from tables.validation import migrate_organization_validations

console = Console()


# ──────────────────────────────────────────────────────────────────────────────
# Result dataclass
# ──────────────────────────────────────────────────────────────────────────────

class OrgMigrationResult:
    def __init__(self, org_id: str):
        self.org_id = org_id
        self.org_name: Optional[str] = None
        self.status: str = "pending"   # pending | success | skipped | failed
        self.reason: Optional[str] = None
        self.row_counts: Dict[str, int] = {}
        self.warnings: List[str] = []
        self.duration_s: float = 0.0

    def total_rows(self) -> int:
        return sum(self.row_counts.values())


# ──────────────────────────────────────────────────────────────────────────────
# Single-org migration
# ──────────────────────────────────────────────────────────────────────────────

def migrate_organization(
    src_conn: psycopg2.extensions.connection,
    dst_conn: psycopg2.extensions.connection,
    org_id: str,
    on_conflict: str = "skip",
    dry_run: bool = False,
    verbose: bool = False,
) -> OrgMigrationResult:
    result = OrgMigrationResult(org_id)
    start = time.time()

    with src_conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as src_cur, \
         dst_conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as dst_cur:
        # ── 1. Fetch source org ──────────────────────────────────────────────
        org = fetch_organization(src_cur, org_id)
        if not org:
            result.status = "failed"
            result.reason = f"Organization '{org_id}' not found in source database."
            result.duration_s = time.time() - start
            return result

        result.org_name = org.get("name", org_id)

        # ── 2. Check journal (idempotency) ───────────────────────────────────
        if not dry_run and on_conflict != "overwrite" and journal_is_migrated(dst_conn, org_id):
            result.status = "skipped"
            result.reason = "Already migrated (journal record found). Use --on-conflict overwrite to re-migrate."
            result.duration_s = time.time() - start
            return result

        # ── 3. Conflict resolution ───────────────────────────────────────────
        slug_conflict = slug_exists_in_dst(dst_cur, org["slug"])
        id_conflict = id_exists_in_dst(dst_cur, org_id)

        if slug_conflict or id_conflict:
            conflict_detail = []
            if slug_conflict:
                conflict_detail.append(f"slug='{org['slug']}'")
            if id_conflict:
                conflict_detail.append(f"id='{org_id}'")
            detail_str = ", ".join(conflict_detail)

            if on_conflict == "skip":
                result.status = "skipped"
                result.reason = f"Organization already exists in destination ({detail_str}). Use --on-conflict overwrite to replace."
                result.duration_s = time.time() - start
                return result
            elif on_conflict == "abort":
                raise RuntimeError(
                    f"Conflict detected for org {org_id} ({detail_str}). "
                    f"Aborting as requested by --on-conflict abort."
                )
            elif on_conflict == "overwrite":
                if not dry_run:
                    if id_conflict:
                        console.print(
                            f"  [yellow]⚠ Overwriting existing org id={org_id} (CASCADE delete)[/yellow]"
                        )
                        delete_organization_cascade(dst_cur, org_id)
                    elif slug_conflict:
                        # Delete by slug
                        dst_cur.execute(
                            'DELETE FROM "organizations" WHERE "slug" = %s', (org["slug"],)
                        )

        if dry_run:
            result.status = "success"
            result.reason = "DRY RUN — no data written"
            _preview_counts(src_cur, org_id, result)
            result.duration_s = time.time() - start
            return result

        # ── 4. Migrate inside a transaction ──────────────────────────────────
        id_map: Dict[str, str] = {}
        warnings: List[str] = []
        counts: Dict[str, int] = {}
        try:
            # org
            insert_organization(dst_cur, dict(org))
            counts["organizations"] = 1

            # settings
            counts["settings"] = migrate_settings(src_cur, dst_cur, org_id, id_map, warnings)
            counts["reservation_settings"] = migrate_reservation_settings(src_cur, dst_cur, org_id, warnings)
            counts["hero_sections"] = migrate_hero_section(src_cur, dst_cur, org_id, warnings)
            counts["roles"] = migrate_roles(src_cur, dst_cur, org_id, id_map, warnings)

            # branch_types (global upsert)
            counts["branch_types"] = migrate_branch_types(src_cur, dst_cur, org_id, id_map, warnings)

            # branches + floor
            counts["branches"] = migrate_branches(src_cur, dst_cur, org_id, id_map, warnings)
            counts["zones"] = migrate_zones(src_cur, dst_cur, org_id, id_map, warnings)
            counts["tables"] = migrate_tables(src_cur, dst_cur, org_id, id_map, warnings)
            counts["floor_elements"] = migrate_floor_elements(src_cur, dst_cur, org_id, id_map, warnings)

            # menu — order matters: categories / declarations / oi BEFORE meals/addons
            counts["categories"] = migrate_categories(src_cur, dst_cur, org_id, id_map, warnings)
            counts["declarations"] = migrate_declarations(src_cur, dst_cur, org_id, id_map, warnings)
            counts["optional_ingredients"] = migrate_optional_ingredients(src_cur, dst_cur, org_id, id_map, warnings)

            # addons (before meal_junctions which reference addons)
            addon_counts = migrate_addons(src_cur, dst_cur, org_id, id_map, warnings)
            counts.update(addon_counts)

            # meals + branch sub-tables (no junctions yet)
            meal_counts = migrate_meals(src_cur, dst_cur, org_id, id_map, warnings)
            counts.update(meal_counts)

            # meal junctions (requires meals + addons + declarations + oi in id_map)
            junction_counts = migrate_meal_junctions(src_cur, dst_cur, org_id, id_map, warnings)
            counts.update(junction_counts)

            # deals
            deal_counts = migrate_deals(src_cur, dst_cur, org_id, id_map, warnings)
            counts.update(deal_counts)

            # pos_devices
            counts["pos_devices"] = migrate_pos_devices(src_cur, dst_cur, org_id, id_map, warnings)

            # User-related tables excluded per user request
            # # users
            # counts["users"] = migrate_users(src_cur, dst_cur, org_id, id_map, warnings)
            # counts["user_addresses"] = migrate_user_addresses(src_cur, dst_cur, org_id, id_map, warnings)
            # counts["user_branches"] = migrate_user_branches(src_cur, dst_cur, org_id, id_map, warnings)
            # counts["user_role_assignments"] = migrate_user_role_assignments(src_cur, dst_cur, org_id, id_map, warnings)

            # business_day_sessions (excluded - has closedByUserId)
            # counts["business_day_sessions"] = migrate_business_day_sessions(src_cur, dst_cur, org_id, id_map, warnings)

            # orders (excluded - has userId FK)
            # order_counts = migrate_orders(src_cur, dst_cur, org_id, id_map, warnings)
            # counts.update(order_counts)

            # business_day_reports and dsfinvk_submissions (excluded - reference sessions)
            # counts["business_day_reports"] = migrate_business_day_reports(src_cur, dst_cur, org_id, id_map, warnings)
            # counts["business_day_dsfinvk_submissions"] = migrate_business_day_dsfinvk_submissions(src_cur, dst_cur, org_id, id_map, warnings)

            # order_adjustments (excluded - has userId FK)
            # counts["order_adjustments"] = migrate_order_adjustments(src_cur, dst_cur, org_id, id_map, warnings)

            # reservations (excluded - has userId FK)
            # reservation_counts = migrate_reservations(src_cur, dst_cur, org_id, id_map, warnings)
            # counts.update(reservation_counts)

            # reservation_orders (excluded - related to reservations)
            # reservation_order_counts = migrate_reservation_orders(src_cur, dst_cur, org_id, id_map, warnings)
            # counts.update(reservation_order_counts)

            # payments (excluded - related to orders)
            # payment_counts = migrate_payments(src_cur, dst_cur, org_id, id_map, warnings)
            # counts.update(payment_counts)

            # fiscal tables (excluded - reference orders which are excluded)
            # fiscal_counts = migrate_fiscal_transactions(src_cur, dst_cur, org_id, id_map, warnings)
            # counts.update(fiscal_counts)
            # counts["fiscal_signing_queue"] = migrate_fiscal_signing_queue(src_cur, dst_cur, org_id, id_map, warnings)
            # counts["tss_outage_logs"] = migrate_tss_outage_logs(src_cur, dst_cur, org_id, id_map, warnings)

            # push notifications (excluded - have userId FK)
            # counts["push_subscriptions"] = migrate_push_subscriptions(src_cur, dst_cur, org_id, id_map, warnings)
            # push_notification_counts = migrate_push_notifications(src_cur, dst_cur, org_id, id_map, warnings)
            # counts.update(push_notification_counts)
            # counts["branch_clicks"] = migrate_branch_clicks(src_cur, dst_cur, org_id, id_map, warnings)
            # counts["branch_subscriptions"] = migrate_branch_subscriptions(src_cur, dst_cur, org_id, id_map, warnings)
            # counts["branch_likes"] = migrate_branch_likes(src_cur, dst_cur, org_id, id_map, warnings)

            # policies
            policy_counts = migrate_terms_and_policies(src_cur, dst_cur, org_id, id_map, warnings)
            counts.update(policy_counts)
            # audit_logs (excluded - may have userId)
            # counts["audit_logs"] = migrate_audit_logs(src_cur, dst_cur, org_id, id_map, warnings)

            # vouchers (excluded per user request)
            # voucher_counts = migrate_vouchers(src_cur, dst_cur, org_id, id_map, warnings)
            # counts.update(voucher_counts)

            # organization validations
            validation_counts = migrate_organization_validations(src_cur, dst_cur, org_id, id_map, warnings)
            counts.update(validation_counts)

            dst_conn.commit()

            # Record in journal
            journal_record(dst_conn, org_id, counts, warnings)

            result.status = "success"
            result.row_counts = counts
            result.warnings = warnings

            if verbose and warnings:
                for w in warnings:
                    console.print(f"    [dim]⚠ {w}[/dim]")

        except Exception as exc:
            dst_conn.rollback()
            result.status = "failed"
            result.reason = str(exc)
            result.warnings = warnings

        finally:
            result.duration_s = time.time() - start

    return result


# ──────────────────────────────────────────────────────────────────────────────
# Dry-run: estimate counts from source without writing
# ──────────────────────────────────────────────────────────────────────────────

def _preview_counts(
    src_cur: psycopg2.extras.DictCursor,
    org_id: str,
    result: OrgMigrationResult,
) -> None:
    """Populate result.row_counts with source counts for dry-run display."""
    tables_and_filters = [
        ("organizations", '"id" = %s'),
        ("settings", '"organizationId" = %s'),
        ("reservation_settings", '"organizationId" = %s'),
        ("hero_sections", '"organizationId" = %s'),
        ("roles", '"organizationId" = %s AND "isSystem" = false'),
        ("branches", '"organizationId" = %s'),
        ("categories", '"organizationId" = %s'),
        ("declarations", '"organizationId" = %s'),
        ("optional_ingredients", '"organizationId" = %s'),
        ("addons", '"organizationId" = %s'),
        ("meals", '"organizationId" = %s'),
        ("deals", '"organizationId" = %s'),
        ("pos_devices", '"organizationId" = %s'),
    ]
    for tbl, where in tables_and_filters:
        src_cur.execute(f'SELECT COUNT(*) FROM "{tbl}" WHERE {where}', (org_id,))
        result.row_counts[tbl] = src_cur.fetchone()[0]

    # Zones + tables + floor_elements — join through branches
    for tbl, join_col in [("zones", "branchId"), ("tables", "branchId"), ("floor_elements", None)]:
        src_cur.execute(
            f"""
            SELECT COUNT(*) FROM "{tbl}" t
            INNER JOIN "branches" b ON b."id" = t."branchId"
            WHERE b."organizationId" = %s
            """ if tbl != "floor_elements" else
            f"""
            SELECT COUNT(*) FROM "floor_elements" fe
            INNER JOIN "zones" z ON z."id" = fe."zoneId"
            INNER JOIN "branches" b ON b."id" = z."branchId"
            WHERE b."organizationId" = %s
            """,
            (org_id,),
        )
        result.row_counts[tbl] = src_cur.fetchone()[0]


# ──────────────────────────────────────────────────────────────────────────────
# Multi-org entry point
# ──────────────────────────────────────────────────────────────────────────────

def run_migration(
    src_conn: psycopg2.extensions.connection,
    dst_conn: psycopg2.extensions.connection,
    org_ids: List[str],
    on_conflict: str = "skip",
    dry_run: bool = False,
    verbose: bool = False,
) -> List[OrgMigrationResult]:
    if not dry_run:
        ensure_journal_table(dst_conn)

    results: List[OrgMigrationResult] = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Migrating organizations...", total=len(org_ids))

        for org_id in org_ids:
            progress.update(task, description=f"[cyan]Migrating org:[/cyan] {org_id}")
            result = migrate_organization(
                src_conn, dst_conn, org_id,
                on_conflict=on_conflict,
                dry_run=dry_run,
                verbose=verbose,
            )
            results.append(result)

            status_icon = {
                "success": "[green]✓[/green]",
                "skipped": "[yellow]⊘[/yellow]",
                "failed":  "[red]✗[/red]",
            }.get(result.status, "?")

            label = result.org_name or org_id
            console.print(
                f"  {status_icon} [bold]{label}[/bold] ({org_id}) — "
                f"{result.status.upper()} | "
                f"{result.total_rows()} rows | "
                f"{result.duration_s:.1f}s"
                + (f" | {result.reason}" if result.reason else "")
            )

            if verbose and result.warnings:
                for w in result.warnings:
                    console.print(f"      [dim]⚠ {w}[/dim]")

            progress.advance(task)

    return results
