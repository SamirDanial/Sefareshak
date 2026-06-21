#!/usr/bin/env python3
"""
migrate.py — Bellami Database Migration CLI

Usage:
  python migrate.py --org-ids <id1> <id2> ...  [options]

Options:
  --org-ids       One or more organization IDs to migrate (required)
  --dry-run       Preview what would be migrated without writing anything
  --on-conflict   What to do if org already exists: skip | overwrite | abort  [default: skip]
  --verbose       Print per-row warnings and SQL details
  --report        Path to write a JSON summary report

Example:
  python migrate.py --org-ids org_abc org_def --dry-run
  python migrate.py --org-ids org_abc --on-conflict overwrite --report report.json
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from typing import List

import click
from rich.console import Console
from rich.rule import Rule
from rich.table import Table

from config import load_config
from connection import db_connection
from migrator import run_migration, OrgMigrationResult

console = Console()


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

@click.command()
@click.option(
    "--org-ids",
    multiple=True,
    required=True,
    help="One or more organization IDs to migrate.",
)
@click.option(
    "--dry-run",
    is_flag=True,
    default=False,
    help="Preview migration counts without writing to destination.",
)
@click.option(
    "--on-conflict",
    type=click.Choice(["skip", "overwrite", "abort"], case_sensitive=False),
    default="skip",
    show_default=True,
    help="Conflict resolution when org already exists in destination.",
)
@click.option(
    "--verbose",
    is_flag=True,
    default=False,
    help="Print per-row warnings and remapped IDs.",
)
@click.option(
    "--report",
    "report_path",
    default=None,
    type=click.Path(),
    help="Write a JSON summary report to this file path.",
)
def cli(
    org_ids: tuple,
    dry_run: bool,
    on_conflict: str,
    verbose: bool,
    report_path: str,
) -> None:
    """Bellami Database Migration Tool"""
    console.print(Rule("[bold blue]Bellami Migration Tool[/bold blue]"))
    console.print(f"  [bold]Org IDs:[/bold]      {', '.join(org_ids)}")
    console.print(f"  [bold]Dry run:[/bold]      {'YES — no data will be written' if dry_run else 'NO'}")
    console.print(f"  [bold]On conflict:[/bold]  {on_conflict.upper()}")
    console.print()

    # ── Load & validate config ──────────────────────────────────────────────
    try:
        cfg = load_config()
    except EnvironmentError as exc:
        console.print(f"[red]Configuration error:[/red] {exc}")
        sys.exit(1)

    src_ssh_label = f"SSH→{cfg.source.ssh.host}" if cfg.source.ssh.enabled else "direct"
    dst_ssh_label = f"SSH→{cfg.destination.ssh.host}" if cfg.destination.ssh.enabled else "direct"
    console.print(f"  [bold]Source DB:[/bold]    {cfg.source.name}@{cfg.source.host} ({src_ssh_label})")
    console.print(f"  [bold]Dest DB:[/bold]      {cfg.destination.name}@{cfg.destination.host} ({dst_ssh_label})")
    console.print()

    overall_start = time.time()

    # ── Open connections ────────────────────────────────────────────────────
    try:
        console.print("[dim]Opening source database connection...[/dim]")
        with db_connection(cfg.source, label="SOURCE") as src_conn, \
             db_connection(cfg.destination, label="DESTINATION") as dst_conn:

            console.print("[dim]Connections established.[/dim]")
            console.print()

            # ── Run migration ───────────────────────────────────────────────
            results: List[OrgMigrationResult] = run_migration(
                src_conn=src_conn,
                dst_conn=dst_conn,
                org_ids=list(org_ids),
                on_conflict=on_conflict,
                dry_run=dry_run,
                verbose=verbose,
            )

    except ConnectionError as exc:
        console.print(f"\n[red]Connection failed:[/red] {exc}")
        sys.exit(1)
    except RuntimeError as exc:
        console.print(f"\n[red]Migration aborted:[/red] {exc}")
        sys.exit(1)
    except KeyboardInterrupt:
        console.print("\n[yellow]Migration interrupted by user.[/yellow]")
        sys.exit(130)

    overall_duration = time.time() - overall_start

    # ── Summary table ───────────────────────────────────────────────────────
    console.print()
    console.print(Rule("[bold]Migration Summary[/bold]"))

    summary = Table(show_header=True, header_style="bold magenta")
    summary.add_column("Org ID", style="dim", width=32)
    summary.add_column("Name", width=28)
    summary.add_column("Status", width=10)
    summary.add_column("Rows", justify="right", width=8)
    summary.add_column("Warnings", justify="right", width=8)
    summary.add_column("Time (s)", justify="right", width=8)

    succeeded = skipped = failed = 0
    total_rows = 0

    for r in results:
        status_style = {
            "success": "green",
            "skipped": "yellow",
            "failed": "red",
        }.get(r.status, "white")

        summary.add_row(
            r.org_id,
            r.org_name or "-",
            f"[{status_style}]{r.status.upper()}[/{status_style}]",
            str(r.total_rows()),
            str(len(r.warnings)),
            f"{r.duration_s:.1f}",
        )

        if r.status == "success":
            succeeded += 1
            total_rows += r.total_rows()
        elif r.status == "skipped":
            skipped += 1
        elif r.status == "failed":
            failed += 1

    console.print(summary)
    console.print()
    console.print(
        f"  Orgs: [green]{succeeded} succeeded[/green]  "
        f"[yellow]{skipped} skipped[/yellow]  "
        f"[red]{failed} failed[/red]  |  "
        f"Total rows written: [bold]{total_rows}[/bold]  |  "
        f"Duration: {overall_duration:.1f}s"
    )

    # ── Row breakdown (verbose) ──────────────────────────────────────────────
    if verbose:
        for r in results:
            if r.status == "success" and r.row_counts:
                console.print()
                console.print(f"[dim]Row counts for {r.org_id} ({r.org_name}):[/dim]")
                row_tbl = Table(show_header=False, box=None, padding=(0, 2))
                row_tbl.add_column("Table", style="dim")
                row_tbl.add_column("Count", justify="right")
                for tbl, cnt in sorted(r.row_counts.items()):
                    if cnt:
                        row_tbl.add_row(tbl, str(cnt))
                console.print(row_tbl)

    # ── Failed org details ───────────────────────────────────────────────────
    for r in results:
        if r.status == "failed" and r.reason:
            console.print(f"\n[red]FAILED {r.org_id}:[/red] {r.reason}")

    # ── JSON report ──────────────────────────────────────────────────────────
    if report_path:
        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "dry_run": dry_run,
            "on_conflict": on_conflict,
            "total_duration_s": round(overall_duration, 2),
            "summary": {
                "succeeded": succeeded,
                "skipped": skipped,
                "failed": failed,
                "total_rows": total_rows,
            },
            "organizations": [
                {
                    "org_id": r.org_id,
                    "org_name": r.org_name,
                    "status": r.status,
                    "reason": r.reason,
                    "row_counts": r.row_counts,
                    "warnings": r.warnings,
                    "duration_s": round(r.duration_s, 2),
                }
                for r in results
            ],
        }
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, default=str)
        console.print(f"\n[dim]Report saved to: {report_path}[/dim]")

    if dry_run:
        console.print("\n[yellow]DRY RUN complete — no data was written.[/yellow]")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    cli()
