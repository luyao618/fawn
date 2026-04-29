from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import select

from fawn.db.session import async_session_factory
from fawn.models import User
from fawn.services.auth import hash_password

DEFAULT_PERMISSIONS = {"can_upload_photos": True, "can_write_tracker": False}


def load_family_config(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    family = data.get("family")
    if not isinstance(family, list):
        raise ValueError("family.yaml must contain a top-level 'family' list")
    return family


async def seed_users(config_path: Path, idempotent: bool) -> int:
    members = load_family_config(config_path)
    created = 0
    async with async_session_factory() as session:
        for member in members:
            username = member["username"]
            existing = await session.scalar(select(User).where(User.username == username))
            if existing is not None:
                if idempotent:
                    continue
                raise ValueError(f"User already exists: {username}")
            user = User(
                username=username,
                display_name=member["display_name"],
                password_hash=hash_password(member["password"]),
                role=member["role"],
                permissions=member.get("permissions") or DEFAULT_PERMISSIONS,
                avatar_url=member.get("avatar_url"),
            )
            session.add(user)
            created += 1
        await session.commit()
    return created


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Fawn family users")
    parser.add_argument("--config", default="config/family.yaml", help="Path to family YAML config")
    parser.add_argument("--idempotent", action="store_true", help="Skip users that already exist")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    created = asyncio.run(seed_users(Path(args.config), args.idempotent))
    print(f"seed_users: created {created} user(s)")


if __name__ == "__main__":
    main()
