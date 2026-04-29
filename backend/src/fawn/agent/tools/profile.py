import uuid
from typing import Any, Literal

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from fawn.db.session import async_session_factory
from fawn.models import ProfileItem


def _context(config: RunnableConfig | None) -> dict[str, str]:
    return dict((config or {}).get("configurable", {}))


@tool
async def update_user_profile(
    action: Literal["add", "update", "delete"],
    content: str | None = None,
    item_id: str | None = None,
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """Add, update, or delete a user profile item."""
    ctx = _context(config)
    user_id = uuid.UUID(ctx["user_id"])
    conversation_id = uuid.UUID(ctx["conversation_id"])
    async with async_session_factory() as db:
        if action == "add":
            if not content:
                return {"error": "content is required"}
            item = ProfileItem(
                user_id=user_id, content=content, source_conversation_id=conversation_id
            )
            db.add(item)
            await db.commit()
            await db.refresh(item)
            return {"item_id": str(item.id), "action": "add"}
        if not item_id:
            return {"error": "item_id is required"}
        item = await db.get(ProfileItem, uuid.UUID(item_id))
        if item is None or item.user_id != user_id:
            return {"error": "profile item not found"}
        if action == "update":
            if not content:
                return {"error": "content is required"}
            item.content = content
            await db.commit()
            await db.refresh(item)
            return {"item_id": str(item.id), "action": "update"}
        if action == "delete":
            await db.delete(item)
            await db.commit()
            return {"item_id": item_id, "action": "delete"}
    return {"error": "unknown action"}
