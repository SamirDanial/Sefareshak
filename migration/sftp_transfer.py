"""
sftp_transfer.py — SFTP pull from VPS + push to EC2 via paramiko.
"""

from __future__ import annotations

import os
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Generator, List, Optional, Tuple

import paramiko

from config import ImageTransferConfig
from image_collector import ImageRecord


@dataclass
class TransferResult:
    relative_path: str
    status: str          # transferred | already_exists | missing_on_src | failed
    error: Optional[str] = None
    size_bytes: int = 0


@contextmanager
def _sftp_client(
    host: str,
    port: int,
    user: str,
    key_path: Optional[str] = None,
    password: Optional[str] = None,
    key_passphrase: Optional[str] = None,
) -> Generator[paramiko.SFTPClient, None, None]:
    """Open an SSH connection and yield an SFTP client."""
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    connect_kwargs = {"hostname": host, "port": port, "username": user, "timeout": 30}
    if key_path:
        pkey = None
        for key_class in (paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey, paramiko.DSSKey):
            try:
                pkey = key_class.from_private_key_file(key_path, password=key_passphrase)
                break
            except Exception:
                continue
        if pkey is None:
            raise ValueError(f"Could not load private key from '{key_path}' — unsupported key type or wrong passphrase.")
        connect_kwargs["pkey"] = pkey
    elif password:
        connect_kwargs["password"] = password

    ssh.connect(**connect_kwargs)
    sftp = ssh.open_sftp()
    try:
        yield sftp
    finally:
        sftp.close()
        ssh.close()


def _makedirs_sftp(sftp: paramiko.SFTPClient, remote_path: str) -> None:
    """Recursively create remote directories if they don't exist."""
    parts = remote_path.split("/")
    current = ""
    for part in parts:
        if not part:
            current = "/"
            continue
        current = os.path.join(current, part)
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def _remote_exists(sftp: paramiko.SFTPClient, path: str) -> bool:
    try:
        sftp.stat(path)
        return True
    except FileNotFoundError:
        return False


def transfer_images(
    records: List[ImageRecord],
    cfg: ImageTransferConfig,
    src_ssh_host: str,
    src_ssh_port: int,
    src_ssh_user: str,
    src_ssh_key_path: Optional[str],
    src_ssh_password: Optional[str],
    src_ssh_key_passphrase: Optional[str],
    dry_run: bool = False,
    verbose: bool = False,
) -> List[TransferResult]:
    """
    Pull each image from VPS via SFTP, push to EC2 via SFTP.
    Returns a list of TransferResult for every record.
    """
    results: List[TransferResult] = []

    if dry_run:
        for rec in records:
            src_path = cfg.src_upload_path.rstrip("/") + rec.relative_path
            dst_path = cfg.ec2_upload_path.rstrip("/") + rec.relative_path
            results.append(TransferResult(
                relative_path=rec.relative_path,
                status="dry_run",
            ))
            if verbose:
                print(f"  [DRY RUN] {src_path} → {dst_path}")
        return results

    with tempfile.TemporaryDirectory(prefix="bellami_img_") as tmp_dir:
        # Open both SFTP sessions once for all files
        with _sftp_client(
            host=src_ssh_host,
            port=src_ssh_port,
            user=src_ssh_user,
            key_path=src_ssh_key_path,
            password=src_ssh_password,
            key_passphrase=src_ssh_key_passphrase,
        ) as sftp_src, _sftp_client(
            host=cfg.ec2_host,
            port=cfg.ec2_port,
            user=cfg.ec2_user,
            key_path=cfg.ec2_key_path,
        ) as sftp_dst:

            for rec in records:
                rel = rec.relative_path
                src_path = cfg.src_upload_path.rstrip("/") + rel
                dst_path = cfg.ec2_upload_path.rstrip("/") + rel
                local_path = os.path.join(tmp_dir, rel.lstrip("/").replace("/", "_"))

                # Skip if already on EC2
                if _remote_exists(sftp_dst, dst_path):
                    results.append(TransferResult(relative_path=rel, status="already_exists"))
                    if verbose:
                        print(f"  [SKIP]   {rel} (already exists on EC2)")
                    continue

                # Check source exists
                if not _remote_exists(sftp_src, src_path):
                    results.append(TransferResult(
                        relative_path=rel,
                        status="missing_on_src",
                        error=f"Not found on VPS: {src_path}",
                    ))
                    if verbose:
                        print(f"  [MISS]   {rel} (not found on VPS)")
                    continue

                # Pull from VPS
                try:
                    sftp_src.get(src_path, local_path)
                    size = os.path.getsize(local_path)
                except Exception as exc:
                    results.append(TransferResult(
                        relative_path=rel,
                        status="failed",
                        error=f"Pull failed: {exc}",
                    ))
                    if verbose:
                        print(f"  [FAIL]   {rel} (pull: {exc})")
                    continue

                # Ensure destination directory exists
                dst_dir = os.path.dirname(dst_path)
                try:
                    _makedirs_sftp(sftp_dst, dst_dir)
                except Exception as exc:
                    results.append(TransferResult(
                        relative_path=rel,
                        status="failed",
                        error=f"mkdir failed: {exc}",
                    ))
                    continue

                # Push to EC2
                try:
                    sftp_dst.put(local_path, dst_path)
                    results.append(TransferResult(
                        relative_path=rel,
                        status="transferred",
                        size_bytes=size,
                    ))
                    if verbose:
                        print(f"  [OK]     {rel} ({size:,} bytes)")
                except Exception as exc:
                    results.append(TransferResult(
                        relative_path=rel,
                        status="failed",
                        error=f"Push failed: {exc}",
                    ))
                    if verbose:
                        print(f"  [FAIL]   {rel} (push: {exc})")

    return results
