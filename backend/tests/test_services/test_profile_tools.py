from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import ProfileItem, User


def _make_ctx(user_id: uuid.UUID):
    return {"user_id": str(user_id), "conversation_id": str(uuid.uuid4())}


async def test_update_user_profile_add(db: AsyncSession, test_user: User):
    @asynccontextmanager
    async def mock_session():
        yield db

    ctx = _make_ctx(test_user.id)

    with patch("fawn.agent.tools.profile.async_session_factory", side_effect=mock_session), \
         patch("fawn.agent.tools.profile._context", return_value=ctx):
        from fawn.agent.tools.profile import update_user_profile
        result = await update_user_profile.ainvoke(
            {"action": "add", "content": "Baby sleeps at 8pm"},
        )

    assert result["action"] == "add"
    assert "item_id" in result


async def test_update_user_profile_add_no_content(db: AsyncSession, test_user: User):
    @asynccontextmanager
    async def mock_session():
        yield db

    ctx = _make_ctx(test_user.id)

    with patch("fawn.agent.tools.profile.async_session_factory", side_effect=mock_session), \
         patch("fawn.agent.tools.profile._context", return_value=ctx):
        from fawn.agent.tools.profile import update_user_profile
        result = await update_user_profile.ainvoke(
            {"action": "add", "content": None},
        )

    assert "error" in result


async def test_update_user_profile_delete(db: AsyncSession, test_user: User):
    item = ProfileItem(
        user_id=test_user.id,
        content="To be deleted",
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    @asynccontextmanager
    async def mock_session():
        yield db

    ctx = _make_ctx(test_user.id)

    with patch("fawn.agent.tools.profile.async_session_factory", side_effect=mock_session), \
         patch("fawn.agent.tools.profile._context", return_value=ctx):
        from fawn.agent.tools.profile import update_user_profile
        result = await update_user_profile.ainvoke(
            {"action": "delete", "item_id": str(item.id)},
        )

    assert result["action"] == "delete"


async def test_update_user_profile_not_found(db: AsyncSession, test_user: User):
    @asynccontextmanager
    async def mock_session():
        yield db

    ctx = _make_ctx(test_user.id)

    with patch("fawn.agent.tools.profile.async_session_factory", side_effect=mock_session), \
         patch("fawn.agent.tools.profile._context", return_value=ctx):
        from fawn.agent.tools.profile import update_user_profile
        result = await update_user_profile.ainvoke(
            {"action": "delete", "item_id": str(uuid.uuid4())},
        )

    assert "error" in result
