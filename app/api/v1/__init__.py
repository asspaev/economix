from fastapi import APIRouter

from app.api.v1.auth import router as auth_router

router = APIRouter(prefix="/v1", tags=["v1"])
router.include_router(auth_router)
