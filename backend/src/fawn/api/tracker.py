import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import (
    DiaperRecordCreate,
    DiaperRecordRead,
    FeedingRecordCreate,
    FeedingRecordRead,
    GrowthRecordCreate,
    GrowthRecordRead,
    HealthRecordCreate,
    HealthRecordRead,
    SleepRecordCreate,
    SleepRecordRead,
    TrackerUpdate,
)
from fawn.db.session import get_db
from fawn.dependencies import get_current_user, require_tracker_writer
from fawn.models import User
from fawn.services.tracker import (
    NotFound,
    PermissionDenied,
    ValidationError,
    create_diaper_record,
    create_feeding_record,
    create_growth_record,
    create_health_record,
    create_sleep_record,
    delete_tracker_record,
    query_records,
    update_tracker_record,
)

router = APIRouter(prefix="/tracker", tags=["tracker"])

SCHEMAS = {
    "growth": GrowthRecordRead,
    "feeding": FeedingRecordRead,
    "sleep": SleepRecordRead,
    "health": HealthRecordRead,
    "diaper": DiaperRecordRead,
}


def _service_error(exc: Exception) -> HTTPException:
    if isinstance(exc, PermissionDenied):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    if isinstance(exc, NotFound):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, ValidationError):
        return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


async def _list_records(
    record_type: Literal["growth", "feeding", "sleep", "health", "diaper"],
    user: User,
    date_value: date | None,
    from_date: date | None,
    to_date: date | None,
    limit: int,
    offset: int,
    db: AsyncSession,
) -> list:
    try:
        records = await query_records(
            db,
            record_type,
            family_id=user.family_id,
            date_value=date_value,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:
        raise _service_error(exc) from exc
    schema = SCHEMAS[record_type]
    return [schema.model_validate(record) for record in records]


@router.get("/growth", response_model=list[GrowthRecordRead])
async def list_growth(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    date_value: date | None = Query(None, alias="date"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[GrowthRecordRead]:
    return await _list_records("growth", user, date_value, from_date, to_date, limit, offset, db)


@router.get("/feeding", response_model=list[FeedingRecordRead])
async def list_feeding(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    date_value: date | None = Query(None, alias="date"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[FeedingRecordRead]:
    return await _list_records("feeding", user, date_value, from_date, to_date, limit, offset, db)


@router.get("/sleep", response_model=list[SleepRecordRead])
async def list_sleep(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    date_value: date | None = Query(None, alias="date"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[SleepRecordRead]:
    return await _list_records("sleep", user, date_value, from_date, to_date, limit, offset, db)


@router.get("/health", response_model=list[HealthRecordRead])
async def list_health(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    date_value: date | None = Query(None, alias="date"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[HealthRecordRead]:
    return await _list_records("health", user, date_value, from_date, to_date, limit, offset, db)


@router.get("/diaper", response_model=list[DiaperRecordRead])
async def list_diaper(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    date_value: date | None = Query(None, alias="date"),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[DiaperRecordRead]:
    return await _list_records("diaper", user, date_value, from_date, to_date, limit, offset, db)


@router.post("/growth", response_model=GrowthRecordRead, status_code=status.HTTP_201_CREATED)
async def create_growth(
    body: GrowthRecordCreate,
    user: User = Depends(require_tracker_writer),
    db: AsyncSession = Depends(get_db),
) -> GrowthRecordRead:
    try:
        record = await create_growth_record(db, user, **body.model_dump())
    except Exception as exc:
        raise _service_error(exc) from exc
    return GrowthRecordRead.model_validate(record)


@router.post("/feeding", response_model=FeedingRecordRead, status_code=status.HTTP_201_CREATED)
async def create_feeding(
    body: FeedingRecordCreate,
    user: User = Depends(require_tracker_writer),
    db: AsyncSession = Depends(get_db),
) -> FeedingRecordRead:
    try:
        record = await create_feeding_record(db, user, **body.model_dump())
    except Exception as exc:
        raise _service_error(exc) from exc
    return FeedingRecordRead.model_validate(record)


@router.post("/diaper", response_model=DiaperRecordRead, status_code=status.HTTP_201_CREATED)
async def create_diaper(
    body: DiaperRecordCreate,
    user: User = Depends(require_tracker_writer),
    db: AsyncSession = Depends(get_db),
) -> DiaperRecordRead:
    try:
        record = await create_diaper_record(db, user, **body.model_dump())
    except Exception as exc:
        raise _service_error(exc) from exc
    return DiaperRecordRead.model_validate(record)


@router.post("/sleep", response_model=SleepRecordRead, status_code=status.HTTP_201_CREATED)
async def create_sleep(
    body: SleepRecordCreate,
    user: User = Depends(require_tracker_writer),
    db: AsyncSession = Depends(get_db),
) -> SleepRecordRead:
    try:
        record = await create_sleep_record(db, user, **body.model_dump())
    except Exception as exc:
        raise _service_error(exc) from exc
    return SleepRecordRead.model_validate(record)


@router.post("/health", response_model=HealthRecordRead, status_code=status.HTTP_201_CREATED)
async def create_health(
    body: HealthRecordCreate,
    user: User = Depends(require_tracker_writer),
    db: AsyncSession = Depends(get_db),
) -> HealthRecordRead:
    try:
        record = await create_health_record(db, user, **body.model_dump())
    except Exception as exc:
        raise _service_error(exc) from exc
    return HealthRecordRead.model_validate(record)


@router.patch("/{record_type}/{record_id}")
async def patch_tracker_record(
    record_type: Literal["growth", "feeding", "sleep", "health", "diaper"],
    record_id: uuid.UUID,
    body: TrackerUpdate,
    user: User = Depends(require_tracker_writer),
    db: AsyncSession = Depends(get_db),
):
    try:
        record = await update_tracker_record(
            db,
            user,
            record_type,
            record_id,
            body.model_dump(exclude_unset=True),
        )
    except Exception as exc:
        raise _service_error(exc) from exc
    return SCHEMAS[record_type].model_validate(record)


@router.delete("/{record_type}/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_tracker_record(
    record_type: Literal["growth", "feeding", "sleep", "health", "diaper"],
    record_id: uuid.UUID,
    user: User = Depends(require_tracker_writer),
    db: AsyncSession = Depends(get_db),
) -> Response:
    try:
        await delete_tracker_record(db, user, record_type, record_id)
    except Exception as exc:
        raise _service_error(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
