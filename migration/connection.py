"""
connection.py — SSH tunnel + psycopg2 connection factory.
"""

from __future__ import annotations

import contextlib
from typing import Generator, Optional, Tuple

import psycopg2
import psycopg2.extras
from sshtunnel import SSHTunnelForwarder

from config import DBConfig, SSHConfig


def _open_ssh_tunnel(ssh: SSHConfig, db_host: str, db_port: int) -> SSHTunnelForwarder:
    """Start an SSH tunnel and return the running forwarder."""
    kwargs: dict = {
        "ssh_username": ssh.user,
        "remote_bind_address": (db_host, db_port),
        "set_keepalive": 30,
    }
    if ssh.key_path:
        kwargs["ssh_pkey"] = ssh.key_path
    if ssh.key_passphrase:
        kwargs["ssh_private_key_password"] = ssh.key_passphrase
    if ssh.password:
        kwargs["ssh_password"] = ssh.password

    tunnel = SSHTunnelForwarder(
        (ssh.host, ssh.port),
        **kwargs,
    )
    tunnel.start()
    return tunnel


@contextlib.contextmanager
def db_connection(
    db_cfg: DBConfig,
    label: str = "DB",
) -> Generator[psycopg2.extensions.connection, None, None]:
    """
    Context manager that yields a psycopg2 connection.
    Handles optional SSH tunnel transparently.
    Closes tunnel and connection on exit.
    """
    tunnel: Optional[SSHTunnelForwarder] = None
    conn: Optional[psycopg2.extensions.connection] = None

    try:
        if db_cfg.ssh.enabled:
            tunnel = _open_ssh_tunnel(db_cfg.ssh, db_cfg.host, db_cfg.port)
            host = "127.0.0.1"
            port = tunnel.local_bind_port
        else:
            host = db_cfg.host
            port = db_cfg.port

        connect_kwargs: dict = {
            "host": host,
            "port": port,
            "dbname": db_cfg.name,
            "user": db_cfg.user,
            "password": db_cfg.password,
            "connect_timeout": db_cfg.connect_timeout,
            "sslmode": db_cfg.sslmode,
            "application_name": db_cfg.application_name,
            "options": "-c timezone=UTC",
        }
        # Only pass SSL cert/key/rootcert when explicitly configured
        if db_cfg.sslrootcert:
            connect_kwargs["sslrootcert"] = db_cfg.sslrootcert
        if db_cfg.sslcert:
            connect_kwargs["sslcert"] = db_cfg.sslcert
        if db_cfg.sslkey:
            connect_kwargs["sslkey"] = db_cfg.sslkey

        conn = psycopg2.connect(**connect_kwargs)
        conn.autocommit = False
        yield conn

    except psycopg2.OperationalError as exc:
        raise ConnectionError(f"[{label}] Failed to connect to database: {exc}") from exc
    except Exception as exc:
        raise ConnectionError(f"[{label}] Unexpected connection error: {exc}") from exc
    finally:
        if conn and not conn.closed:
            conn.close()
        if tunnel and tunnel.is_active:
            tunnel.stop()


def dict_cursor(conn: psycopg2.extensions.connection) -> psycopg2.extras.DictCursor:
    """Return a DictCursor for the given connection."""
    return conn.cursor(cursor_factory=psycopg2.extras.DictCursor)


def ensure_journal_table(conn: psycopg2.extensions.connection) -> None:
    """
    Create a migration journal table in the destination DB if it doesn't exist.
    Used to track which orgs have already been migrated (idempotency).
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS _migration_journal (
                org_id        TEXT PRIMARY KEY,
                migrated_at   TIMESTAMPTZ DEFAULT now(),
                row_counts    JSONB,
                warnings      JSONB
            );
            """
        )
    conn.commit()


def journal_is_migrated(conn: psycopg2.extensions.connection, org_id: str) -> bool:
    """Return True if this org_id is already recorded in the journal."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM _migration_journal WHERE org_id = %s", (org_id,)
        )
        return cur.fetchone() is not None


def journal_record(
    conn: psycopg2.extensions.connection,
    org_id: str,
    row_counts: dict,
    warnings: list,
) -> None:
    """Record a successfully migrated org in the journal."""
    import json

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO _migration_journal (org_id, row_counts, warnings)
            VALUES (%s, %s::jsonb, %s::jsonb)
            ON CONFLICT (org_id) DO UPDATE
                SET migrated_at = now(),
                    row_counts  = EXCLUDED.row_counts,
                    warnings    = EXCLUDED.warnings;
            """,
            (org_id, json.dumps(row_counts), json.dumps(warnings)),
        )
    conn.commit()
