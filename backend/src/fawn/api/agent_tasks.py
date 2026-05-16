from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import (
    AgentTaskDefinitionRead,
    AgentTaskDefinitionsResponse,
    AgentTaskRunCreate,
    AgentTaskRunListResponse,
    AgentTaskRunRead,
)
from fawn.db.session import get_db
from fawn.dependencies import get_current_user
from fawn.models import User
from fawn.services import agent_task_runs as svc

router = APIRouter(prefix="/agent-tasks", tags=["agent-tasks"])


def _service_error(exc: svc.TaskServiceError) -> HTTPException:
    detail: dict[str, object] = {"code": exc.code, "message": exc.message}
    detail.update(exc.extra)
    return HTTPException(status_code=exc.http_status, detail=detail)


@router.get("/definitions", response_model=AgentTaskDefinitionsResponse)
async def list_definitions(
    _user: User = Depends(get_current_user),
) -> AgentTaskDefinitionsResponse:
    return AgentTaskDefinitionsResponse(
        definitions=[
            AgentTaskDefinitionRead(
                name=d.name,
                title=d.title,
                description=d.description,
                input_schema=d.input_schema,
                estimated_duration_seconds=d.estimated_duration_seconds,
                enabled=d.enabled,
            )
            for d in svc.list_task_definitions()
        ]
    )


@router.post(
    "/{name}/runs",
    response_model=AgentTaskRunRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_run(
    name: str,
    body: AgentTaskRunCreate | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AgentTaskRunRead:
    input_payload = body.input if body is not None else {}
    try:
        run = await svc.create_run(db, user, name=name, input=input_payload)
    except svc.TaskServiceError as exc:
        raise _service_error(exc) from exc
    return AgentTaskRunRead.model_validate(run)


@router.get("/runs", response_model=AgentTaskRunListResponse)
async def list_runs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    name: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> AgentTaskRunListResponse:
    runs = await svc.list_runs(db, user, name=name, limit=limit, offset=offset)
    return AgentTaskRunListResponse(
        runs=[AgentTaskRunRead.model_validate(r) for r in runs]
    )


@router.get("/runs/{run_id}", response_model=AgentTaskRunRead)
async def get_run(
    run_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AgentTaskRunRead:
    try:
        run = await svc.get_run(db, user, run_id)
    except svc.TaskServiceError as exc:
        raise _service_error(exc) from exc
    return AgentTaskRunRead.model_validate(run)
