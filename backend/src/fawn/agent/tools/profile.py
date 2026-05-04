import uuid
from typing import Annotated, Any, Literal

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from fawn.db.session import async_session_factory
from fawn.models import User
from fawn.services import profile as profile_service


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
        user = await db.get(User, user_uuid)
        if user is None:
            return {"error": "user not found"}
        if user.access_type == "friend":
            return {"error": "您当前只有查看权限，不能写入个人画像"}
        if action == "add":
            if not content:
                return {"error": "content is required"}
            try:
                item = await profile_service.create_profile_item(
                    db,
                    family_id=user.family_id,
                    user_id=user_uuid,
                    scope="user",
                    content=content,
                    source_conversation_id=conversation_uuid,
                )
            except profile_service.MemorySyncError:
                return {"error": "长期记忆同步失败，画像未更新"}
            return {"item_id": str(item.id), "action": "add"}
        if not item_id:
            return {"error": "item_id is required"}
        if action == "update":
            if not content:
                return {"error": "content is required"}
            try:
                item = await profile_service.update_profile_item(
                    db, user_uuid, uuid.UUID(item_id), content
                )
            except profile_service.NotFound:
                return {"error": "profile item not found"}
            except profile_service.PermissionDenied:
                return {"error": "profile item not found"}
            except profile_service.MemorySyncError:
                return {"error": "长期记忆同步失败，画像未更新"}
            return {"item_id": str(item.id), "action": "update"}
        if action == "delete":
            try:
                await profile_service.delete_profile_item(db, user_uuid, uuid.UUID(item_id))
            except profile_service.NotFound:
                return {"error": "profile item not found"}
            except profile_service.PermissionDenied:
                return {"error": "profile item not found"}
            except profile_service.MemorySyncError:
                return {"error": "长期记忆同步失败，画像未更新"}
            return {"item_id": item_id, "action": "delete"}
    return {"error": "unknown action"}
