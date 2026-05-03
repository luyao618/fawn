from fastapi import APIRouter

from fawn.api import album, auth, baby, chat, dashboard, family, profile, tracker

api_router = APIRouter()


@api_router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


api_router.include_router(auth.router)
api_router.include_router(family.router)
api_router.include_router(chat.router)
api_router.include_router(tracker.router)
api_router.include_router(dashboard.router)
api_router.include_router(album.router)
api_router.include_router(profile.router)
api_router.include_router(baby.router)
