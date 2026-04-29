from fastapi import APIRouter

from fawn.api import auth, chat, dashboard, tracker

api_router = APIRouter()


@api_router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


api_router.include_router(auth.router)
api_router.include_router(chat.router)
api_router.include_router(tracker.router)
api_router.include_router(dashboard.router)
