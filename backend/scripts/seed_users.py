from __future__ import annotations

import argparse
import asyncio
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import select

from fawn.db.session import async_session_factory
from fawn.models import Baby, Family, User
from fawn.services.auth import hash_password

DEFAULT_PERMISSIONS = {"can_upload_photos": True, "can_write_tracker": False}


def load_seed_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    family = data.get("family")
    if not isinstance(family, list):
        raise ValueError("family.yaml must contain a top-level 'family' list")
    baby = data.get("baby")
    if baby is not None and not isinstance(baby, dict):
        raise ValueError("family.yaml 'baby' must be an object when provided")
    return data


def _parse_date(value: Any) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _optional_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _access_type(value: str) -> str:
    if value in {"admin", "parent"}:
        return "parent"
    if value in {"family", "friend"}:
        return value
    return "family"


async def ensure_family(session, config: dict[str, Any]) -> Family:
    existing = await session.scalar(select(Family).order_by(Family.created_at.asc()).limit(1))
    if existing is not None:
        return existing
    baby_config = config.get("baby") or {}
    family_name = config.get("family_name") or (
        f"{baby_config['name']}的家庭" if baby_config.get("name") else "默认家庭"
    )
    family = Family(name=family_name)
    session.add(family)
    await session.flush()
    return family


async def seed_users_from_config(config: dict[str, Any], idempotent: bool) -> int:
    members = config["family"]
    created = 0
    async with async_session_factory() as session:
        family = await ensure_family(session, config)
        for member in members:
            username = member["username"]
            existing = await session.scalar(select(User).where(User.username == username))
            if existing is not None:
                if idempotent:
                    continue
                raise ValueError(f"User already exists: {username}")
            user = User(
                family_id=family.id,
                username=username,
                display_name=member["display_name"],
                password_hash=hash_password(member["password"]),
                access_type=_access_type(member["role"]),
                role=member.get("family_role") or member.get("display_role") or member["display_name"],
                permissions=member.get("permissions") or {
                    "can_upload_photos": _access_type(member["role"]) in {"parent", "family"},
                    "can_write_tracker": _access_type(member["role"]) in {"parent", "family"},
                },
                avatar_url=member.get("avatar_url"),
            )
            session.add(user)
            created += 1
        await session.commit()
    return created


async def seed_baby_from_config(config: dict[str, Any], idempotent: bool) -> int:
    baby_config = config.get("baby")
    if not baby_config:
        return 0

    async with async_session_factory() as session:
        family = await ensure_family(session, config)
        existing = await session.scalar(select(Baby).order_by(Baby.created_at.asc()).limit(1))
        if existing is not None:
            if idempotent:
                return 0
            raise ValueError("Baby profile already exists")

        baby = Baby(
            family_id=family.id,
            name=baby_config["name"],
            gender=baby_config["gender"],
            birth_date=_parse_date(baby_config["birth_date"]),
            birth_weight_g=baby_config.get("birth_weight_g"),
            birth_height_cm=_optional_decimal(baby_config.get("birth_height_cm")),
            birth_head_cm=_optional_decimal(baby_config.get("birth_head_cm")),
            is_premature=bool(baby_config.get("is_premature", False)),
            gestational_weeks=baby_config.get("gestational_weeks"),
        )
        session.add(baby)
        await session.commit()
        return 1


async def seed(config_path: Path, idempotent: bool) -> tuple[int, int]:
    config = load_seed_config(config_path)
    users_created = await seed_users_from_config(config, idempotent)
    babies_created = await seed_baby_from_config(config, idempotent)
    return users_created, babies_created


async def seed_users(config_path: Path, idempotent: bool) -> int:
    config = load_seed_config(config_path)
    return await seed_users_from_config(config, idempotent)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Fawn family users")
    parser.add_argument("--config", default="config/family.yaml", help="Path to family YAML config")
    parser.add_argument("--idempotent", action="store_true", help="Skip users that already exist")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    users_created, babies_created = asyncio.run(seed(Path(args.config), args.idempotent))
    print(f"seed_users: created {users_created} user(s), {babies_created} baby profile(s)")


if __name__ == "__main__":
    main()
