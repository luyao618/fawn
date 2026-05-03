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

from fawn.models import Baby, Base, Family, User
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


TEST_DATABASE_URL = "sqlite+aiosqlite:///file:fawn-test?mode=memory&cache=shared&uri=true"

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
async def test_family(db: AsyncSession) -> Family:
    family = Family(id=uuid.uuid4(), name="Test Family")
    db.add(family)
    await db.commit()
    await db.refresh(family)
    return family


@pytest_asyncio.fixture
async def test_user(db: AsyncSession, test_family: Family) -> User:
    user = User(
        id=uuid.uuid4(),
        family_id=test_family.id,
        username="testadmin",
        display_name="Test Admin",
        access_type="parent",
        role="爸爸",
        password_hash=hash_password("testpass"),
        permissions={"can_write_tracker": True, "can_upload_photos": True},
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_family_user(db: AsyncSession, test_family: Family) -> User:
    user = User(
        id=uuid.uuid4(),
        family_id=test_family.id,
        username="testfamily",
        display_name="Test Family",
        access_type="family",
        role="奶奶",
        password_hash=hash_password("testpass"),
        permissions={"can_write_tracker": True, "can_upload_photos": True},
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_friend_user(db: AsyncSession, test_family: Family) -> User:
    user = User(
        id=uuid.uuid4(),
        family_id=test_family.id,
        username="testfriend",
        display_name="Test Friend",
        access_type="friend",
        role="儿科医生",
        password_hash=hash_password("testpass"),
        permissions={"can_write_tracker": False, "can_upload_photos": False},
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_baby(db: AsyncSession, test_family: Family) -> Baby:
    baby = Baby(
        id=uuid.uuid4(),
        family_id=test_family.id,
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
    token = create_access_token(test_user.id, test_user.access_type)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def family_auth_headers(test_family_user: User) -> dict[str, str]:
    token = create_access_token(test_family_user.id, test_family_user.access_type)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def friend_auth_headers(test_friend_user: User) -> dict[str, str]:
    token = create_access_token(test_friend_user.id, test_friend_user.access_type)
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
