from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from fawn.db.session import async_session_factory
from fawn.services.tracker import seed_who_csv


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed WHO LMS growth reference data")
    parser.add_argument(
        "--csv", required=True, help="CSV path with gender,indicator,age_months,L/M/S columns"
    )
    parser.add_argument(
        "--idempotent", action="store_true", help="Skip import when data already exists"
    )
    return parser.parse_args()


async def run() -> int:
    args = parse_args()
    async with async_session_factory() as session:
        return await seed_who_csv(session, Path(args.csv), args.idempotent)


def main() -> None:
    inserted = asyncio.run(run())
    print(f"seed_who_data: inserted {inserted} row(s)")


if __name__ == "__main__":
    main()
