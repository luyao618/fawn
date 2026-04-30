import uuid
from typing import Annotated, Any, Literal

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from fawn.db.session import async_session_factory
from fawn.models import ProfileItem


InjectedUserId = Annotated[str, InjectedState("user_id")]
InjectedConversationId = Annotated[str, InjectedState("conversation_id")]


@tool
async def update_user_profile(
    action: Literal["add", "update", "delete"],
    content: str | None = None,
    item_id: str | None = None,
    user_id: InjectedUserId = "",
    conversation_id: InjectedConversationId = "",
) -> dict[str, Any]:
    """Add, update, or delete a user profile item."""
    if not user_id:
        return {"error": "missing user context"}
    user_uuid = uuid.UUID(user_id)
    conversation_uuid = uuid.UUID(conversation_id) if conversation_id else None
    async with async_session_factory() as db:
        if action == "add":
            if not content:
                return {"error": "content is required"}
            item = ProfileItem(
                user_id=user_uuid,
                content=content,
                source_conversation_id=conversation_uuid,
            )
            db.add(item)
            await db.commit()
            await db.refresh(item)
            return {"item_id": str(item.id), "action": "add"}
        if not item_id:
            return {"error": "item_id is required"}
        item = await db.get(ProfileItem, uuid.UUID(item_id))
        if item is None or item.user_id != user_uuid:
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
