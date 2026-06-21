"""
config.py — Load and validate environment variables for the migration tool.
"""

import os
from dataclasses import dataclass, field
from typing import Optional

from dotenv import load_dotenv

load_dotenv()


def _get(key: str, default: Optional[str] = None, required: bool = False) -> Optional[str]:
    val = os.environ.get(key, default)
    if required and not val:
        raise EnvironmentError(f"Required environment variable '{key}' is not set. Check your .env file.")
    return val or None


def _get_int(key: str, default: int) -> int:
    val = os.environ.get(key)
    if not val or not val.strip():
        return default
    try:
        return int(val.strip())
    except ValueError:
        raise EnvironmentError(f"Environment variable '{key}' must be an integer, got: '{val}'")


@dataclass
class SSHConfig:
    host: Optional[str]
    port: int
    user: Optional[str]
    key_path: Optional[str]
    key_passphrase: Optional[str]
    password: Optional[str]

    @property
    def enabled(self) -> bool:
        return bool(self.host)

    def validate(self, prefix: str) -> None:
        if not self.enabled:
            return
        if not self.user:
            raise EnvironmentError(f"'{prefix}_SSH_USER' is required when SSH is enabled.")
        if not self.key_path and not self.password:
            raise EnvironmentError(
                f"Either '{prefix}_SSH_KEY_PATH' or '{prefix}_SSH_PASSWORD' must be set "
                f"when SSH is enabled for {prefix}."
            )
        if self.key_path and not os.path.isfile(self.key_path):
            raise EnvironmentError(
                f"SSH key file not found for {prefix}: '{self.key_path}'"
            )


@dataclass
class DBConfig:
    host: str
    port: int
    name: str
    user: str
    password: str
    connect_timeout: int
    sslmode: str
    sslrootcert: Optional[str]
    sslcert: Optional[str]
    sslkey: Optional[str]
    application_name: str
    ssh: SSHConfig = field(default=None)  # type: ignore[assignment]  # set post-init in load_config

    def validate_ssl(self, prefix: str) -> None:
        import warnings as _warnings
        if self.sslmode in ("verify-ca", "verify-full") and not self.sslrootcert:
            _warnings.warn(
                f"[{prefix}] sslmode='{self.sslmode}' but {prefix}_DB_SSLROOTCERT is not set. "
                f"psycopg2 will use the system CA bundle or may reject the connection."
            )
        if bool(self.sslcert) != bool(self.sslkey):
            _warnings.warn(
                f"[{prefix}] {prefix}_DB_SSLCERT and {prefix}_DB_SSLKEY should both be set "
                f"or both left blank for mutual TLS."
            )
        if self.sslrootcert and not os.path.isfile(self.sslrootcert):
            raise EnvironmentError(
                f"[{prefix}] SSL CA cert file not found: '{self.sslrootcert}'"
            )
        if self.sslcert and not os.path.isfile(self.sslcert):
            raise EnvironmentError(
                f"[{prefix}] SSL client cert file not found: '{self.sslcert}'"
            )
        if self.sslkey and not os.path.isfile(self.sslkey):
            raise EnvironmentError(
                f"[{prefix}] SSL client key file not found: '{self.sslkey}'"
            )


@dataclass
class Config:
    source: DBConfig
    destination: DBConfig

    def validate(self) -> None:
        self.source.ssh.validate("SRC")
        self.destination.ssh.validate("DST")
        self.source.validate_ssl("SRC")
        self.destination.validate_ssl("DST")


@dataclass
class ImageTransferConfig:
    src_upload_path: str
    ec2_host: str
    ec2_port: int
    ec2_user: str
    ec2_key_path: str
    ec2_upload_path: str
    src_base_url: str
    dst_base_url: str

    def validate(self) -> None:
        if not self.ec2_host:
            raise EnvironmentError("'EC2_SSH_HOST' is required for image transfer.")
        if not self.ec2_key_path:
            raise EnvironmentError("'EC2_SSH_KEY_PATH' is required for image transfer.")
        if not os.path.isfile(self.ec2_key_path):
            raise EnvironmentError(f"EC2 SSH key file not found: '{self.ec2_key_path}'")
        if not self.src_base_url:
            raise EnvironmentError("'SRC_BASE_URL' is required for image transfer.")
        if not self.dst_base_url:
            raise EnvironmentError("'DST_BASE_URL' is required for image transfer.")


def load_image_transfer_config() -> ImageTransferConfig:
    cfg = ImageTransferConfig(
        src_upload_path=_get("SRC_UPLOAD_PATH", default="/root/Bellami/backend/uploads"),
        ec2_host=_get("EC2_SSH_HOST", required=True),
        ec2_port=_get_int("EC2_SSH_PORT", 22),
        ec2_user=_get("EC2_SSH_USER", default="ubuntu"),
        ec2_key_path=_get("EC2_SSH_KEY_PATH", required=True),
        ec2_upload_path=_get("EC2_UPLOAD_PATH", default="/root/Bellami/backend/uploads"),
        src_base_url=_get("SRC_BASE_URL", required=True),
        dst_base_url=_get("DST_BASE_URL", required=True),
    )
    cfg.validate()
    return cfg


def load_config() -> Config:
    src_ssh = SSHConfig(
        host=_get("SRC_SSH_HOST"),
        port=_get_int("SRC_SSH_PORT", 22),
        user=_get("SRC_SSH_USER"),
        key_path=_get("SRC_SSH_KEY_PATH"),
        key_passphrase=_get("SRC_SSH_KEY_PASSPHRASE"),
        password=_get("SRC_SSH_PASSWORD"),
    )

    dst_ssh = SSHConfig(
        host=_get("DST_SSH_HOST"),
        port=_get_int("DST_SSH_PORT", 22),
        user=_get("DST_SSH_USER"),
        key_path=_get("DST_SSH_KEY_PATH"),
        key_passphrase=_get("DST_SSH_KEY_PASSPHRASE"),
        password=_get("DST_SSH_PASSWORD"),
    )

    source = DBConfig(
        host=_get("SRC_DB_HOST", required=True),
        port=_get_int("SRC_DB_PORT", 5432),
        name=_get("SRC_DB_NAME", required=True),
        user=_get("SRC_DB_USER", required=True),
        password=_get("SRC_DB_PASSWORD", required=True),
        connect_timeout=_get_int("SRC_DB_CONNECT_TIMEOUT", 15),
        sslmode=_get("SRC_DB_SSLMODE", default="prefer"),
        sslrootcert=_get("SRC_DB_SSLROOTCERT"),
        sslcert=_get("SRC_DB_SSLCERT"),
        sslkey=_get("SRC_DB_SSLKEY"),
        application_name=_get("SRC_DB_APPLICATION_NAME", default="bellami-migration"),
    )

    destination = DBConfig(
        host=_get("DST_DB_HOST", required=True),
        port=_get_int("DST_DB_PORT", 5432),
        name=_get("DST_DB_NAME", required=True),
        user=_get("DST_DB_USER", required=True),
        password=_get("DST_DB_PASSWORD", required=True),
        connect_timeout=_get_int("DST_DB_CONNECT_TIMEOUT", 15),
        sslmode=_get("DST_DB_SSLMODE", default="prefer"),
        sslrootcert=_get("DST_DB_SSLROOTCERT"),
        sslcert=_get("DST_DB_SSLCERT"),
        sslkey=_get("DST_DB_SSLKEY"),
        application_name=_get("DST_DB_APPLICATION_NAME", default="bellami-migration"),
    )

    # Attach ssh configs
    source.ssh = src_ssh
    destination.ssh = dst_ssh

    cfg = Config(source=source, destination=destination)
    cfg.validate()
    return cfg
