from __future__ import annotations

import re
import uuid
from datetime import date
from typing import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, text as sa_text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from fawn.models import Baby, Base, User
from fawn.services.auth import create_access_token, hash_password

try:
    from pgvector.sqlalchemy import Vector

    @compiles(Vector, "sqlite")
    def _compile_vector_sqlite(type_, compiler, **kw):
        return "TEXT"
except ImportError:
    pass


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


def _strip_pg_casts_for_sqlite(metadata):
    for table in metadata.tables.values():
        for col in table.columns:
            if col.server_default is not None and hasattr(col.server_default, "arg"):
                arg = col.server_default.arg
                if hasattr(arg, "text"):
                    cleaned = re.sub(r"::\w+", "", arg.text)
                    if cleaned != arg.text:
                        col.server_default.arg = sa_text(cleaned)


TEST_DATABASE_URL = "sqlite+aiosqlite:///file::memory:?cache=shared"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)


@event.listens_for(test_engine.sync_engine, "connect")
def _register_sqlite_functions(dbapi_conn, connection_record):
    import uuid as _uuid

    dbapi_conn.create_function("gen_random_uuid", 0, lambda: str(_uuid.uuid4()))


TestSessionFactory = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@pytest_asyncio.fixture(scope="function")
async def db() -> AsyncIterator[AsyncSession]:
    _strip_pg_casts_for_sqlite(Base.metadata)
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with TestSessionFactory() as session:
        yield session
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        username="testadmin",
        display_name="Test Admin",
        role="admin",
        password_hash=hash_password("testpass"),
        permissions={"can_write_tracker": True, "can_upload_photos": True},
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_family_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        username="testfamily",
        display_name="Test Family",
        role="family",
        password_hash=hash_password("testpass"),
        permissions={"can_write_tracker": False, "can_upload_photos": False},
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_baby(db: AsyncSession) -> Baby:
    baby = Baby(
        id=uuid.uuid4(),
        name="Test Baby",
        gender="male",
        birth_date=date(2026, 1, 1),
        is_premature=False,
    )
    db.add(baby)
    await db.commit()
    await db.refresh(baby)
    return baby


@pytest_asyncio.fixture
async def auth_headers(test_user: User) -> dict[str, str]:
    token = create_access_token(test_user.id, test_user.role)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def family_auth_headers(test_family_user: User) -> dict[str, str]:
    token = create_access_token(test_family_user.id, test_family_user.role)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncIterator[AsyncClient]:
    from fawn.db.session import get_db
    from fawn.main import app

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
