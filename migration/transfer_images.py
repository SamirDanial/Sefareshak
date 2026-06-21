"""
transfer_images.py — CLI for transferring org images from VPS to EC2.

Usage:
  python3 transfer_images.py --org-ids <id1> <id2> [options]
"""

from __future__ import annotations

import json
import sys
import time
from typing import List

import click
import psycopg2.extras
from rich.console import Console
from rich.table import Table

from config import load_config, load_image_transfer_config
from connection import db_connection
from image_collector import collect_images
from sftp_transfer import transfer_images

console = Console()


def _rewrite_urls_in_db(
    dst_conn,
    org_ids: List[str],
    src_base_url: str,
    dst_base_url: str,
    verbose: bool,
) -> int:
    """
    Replace src_base_url with dst_base_url in all image columns of the destination DB
    for the given org IDs. Returns total rows updated.
    """
    image_update_specs = [
        ("settings",      "businessLogo",   '"organizationId" = ANY(%s)',  org_ids),
        ("settings",      "seoOgImage",     '"organizationId" = ANY(%s)',  org_ids),
        ("hero_sections", "backgroundImage",'"organizationId" = ANY(%s)',  org_ids),
        ("branches",      "branchImage",    '"organizationId" = ANY(%s)',  org_ids),
        ("categories",    "image",          '"organizationId" = ANY(%s)',  org_ids),
        ("meals",         "image",          '"organizationId" = ANY(%s)',  org_ids),
        ("deals",         "image",          '"organizationId" = ANY(%s)',  org_ids),
        ("addons",        "image",          '"organizationId" = ANY(%s)',  org_ids),
    ]

    total = 0
    with dst_conn.cursor() as cur:
        for table, column, where_clause, params in image_update_specs:
            cur.execute(
                f'UPDATE "{table}" SET "{column}" = replace("{column}", %s, %s) '
                f'WHERE "{column}" IS NOT NULL AND "{column}" LIKE %s AND {where_clause}',
                (src_base_url, dst_base_url, src_base_url + "%", params),
            )
            total += cur.rowcount
            if verbose and cur.rowcount:
                console.print(f"    {table}.{column}: {cur.rowcount} rows updated")

        dst_conn.commit()
    return total


@click.command()
@click.option("--org-ids", required=True, multiple=True, help="One or more organization IDs to transfer images for.")
@click.option("--dry-run", is_flag=True, default=False, help="List files that would be transferred without doing any SFTP operations.")
@click.option("--skip-db-update", is_flag=True, default=False, help="Transfer files but do NOT rewrite image URLs in the destination DB.")
@click.option("--verbose", "-v", is_flag=True, default=False, help="Print per-file progress.")
@click.option("--report", default=None, help="Save a JSON report to this file path.")
def main(org_ids, dry_run, skip_db_update, verbose, report):
    """Transfer org images from the source VPS to the destination EC2 instance."""

    console.rule("[bold cyan]Bellami Image Transfer Tool")
    console.print(f"  Org IDs:    {', '.join(org_ids)}")
    console.print(f"  Dry run:    {'YES — no files will be transferred' if dry_run else 'NO'}")
    if dry_run:
        skip_db_update = True

    start = time.time()

    # Load configs
    try:
        cfg = load_config()
        img_cfg = load_image_transfer_config()
    except EnvironmentError as exc:
        console.print(f"[red]Configuration error:[/red] {exc}")
        sys.exit(1)

    console.print(f"  Source VPS: {cfg.source.ssh.host} (uploads: {img_cfg.src_upload_path})")
    console.print(f"  Dest EC2:   {img_cfg.ec2_host} (uploads: {img_cfg.ec2_upload_path})")
    console.print(f"  URL rewrite: {img_cfg.src_base_url} → {img_cfg.dst_base_url}")
    console.print()

    # Collect image records from source DB
    console.print("[bold]Collecting image URLs from source database...[/bold]")
    with db_connection(cfg.source, "SOURCE") as src_conn:
        with src_conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as src_cur:
            records = collect_images(src_cur, list(org_ids), img_cfg.src_base_url)

    console.print(f"  Found [bold]{len(records)}[/bold] unique image files to transfer.\n")

    if not records:
        console.print("[yellow]No images found for the given org IDs. Nothing to do.[/yellow]")
        sys.exit(0)

    if verbose or dry_run:
        console.print("[bold]File list:[/bold]")
        for rec in records:
            console.print(f"  {rec.table}.{rec.column} → {rec.relative_path}")
        console.print()

    # Transfer files
    console.print("[bold]Transferring files...[/bold]")
    results = transfer_images(
        records=records,
        cfg=img_cfg,
        src_ssh_host=cfg.source.ssh.host,
        src_ssh_port=cfg.source.ssh.port,
        src_ssh_user=cfg.source.ssh.user,
        src_ssh_key_path=cfg.source.ssh.key_path,
        src_ssh_password=cfg.source.ssh.password,
        src_ssh_key_passphrase=cfg.source.ssh.key_passphrase,
        dry_run=dry_run,
        verbose=verbose,
    )

    # Tally results
    transferred = [r for r in results if r.status == "transferred"]
    skipped     = [r for r in results if r.status == "already_exists"]
    missing     = [r for r in results if r.status == "missing_on_src"]
    failed      = [r for r in results if r.status == "failed"]
    dry_run_lst = [r for r in results if r.status == "dry_run"]
    total_bytes = sum(r.size_bytes for r in transferred)

    console.print()

    # Rewrite DB URLs
    db_rows_updated = 0
    if not skip_db_update and transferred:
        console.print("[bold]Rewriting image URLs in destination database...[/bold]")
        with db_connection(cfg.destination, "DESTINATION") as dst_conn:
            db_rows_updated = _rewrite_urls_in_db(
                dst_conn, list(org_ids),
                img_cfg.src_base_url, img_cfg.dst_base_url,
                verbose,
            )
        console.print(f"  {db_rows_updated} DB row(s) updated.\n")

    # Summary table
    console.rule("[bold cyan]Transfer Summary")
    tbl = Table(show_header=True, header_style="bold")
    tbl.add_column("Status")
    tbl.add_column("Count", justify="right")
    tbl.add_column("Details")

    if dry_run:
        tbl.add_row("[cyan]Would transfer[/cyan]", str(len(dry_run_lst)), "")
    else:
        tbl.add_row("[green]Transferred[/green]",   str(len(transferred)), f"{total_bytes:,} bytes")
        tbl.add_row("[yellow]Already exists[/yellow]", str(len(skipped)),  "skipped")
        tbl.add_row("[yellow]Missing on VPS[/yellow]", str(len(missing)),  "")
        tbl.add_row("[red]Failed[/red]",             str(len(failed)),     "")

    console.print(tbl)

    if failed:
        console.print("\n[red]Failures:[/red]")
        for r in failed:
            console.print(f"  {r.relative_path}: {r.error}")

    if missing:
        console.print("\n[yellow]Missing on VPS:[/yellow]")
        for r in missing:
            console.print(f"  {r.relative_path}")

    duration = time.time() - start
    console.print(f"\n  Duration: {duration:.1f}s | DB rows updated: {db_rows_updated}")

    if dry_run:
        console.print("\n[cyan]DRY RUN complete — no files were transferred.[/cyan]")

    # JSON report
    if report:
        report_data = {
            "org_ids": list(org_ids),
            "dry_run": dry_run,
            "transferred": len(transferred),
            "already_exists": len(skipped),
            "missing_on_src": len(missing),
            "failed": len(failed),
            "total_bytes": total_bytes,
            "db_rows_updated": db_rows_updated,
            "duration_s": round(duration, 1),
            "files": [
                {"path": r.relative_path, "status": r.status, "error": r.error, "bytes": r.size_bytes}
                for r in results
            ],
        }
        with open(report, "w") as f:
            json.dump(report_data, f, indent=2)
        console.print(f"  Report saved to: {report}")

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
