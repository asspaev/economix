from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.categories import router as categories_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.onboarding import router as onboarding_router
from app.api.v1.snapshots import router as snapshots_router

router = APIRouter(prefix="/v1", tags=["v1"])
router.include_router(auth_router)
router.include_router(onboarding_router)
router.include_router(dashboard_router)
router.include_router(categories_router)
router.include_router(snapshots_router)
