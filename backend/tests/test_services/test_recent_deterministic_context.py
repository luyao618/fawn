from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from fawn.models import Baby, FeedingRecord, GrowthRecord, HealthRecord, SleepRecord
from fawn.services.recent_deterministic_context import build_recent_deterministic_context


async def test_recent_deterministic_context_filters_and_limits(
    db,
    test_family,
    test_user,
    test_baby,
) -> None:
    now = datetime(2026, 5, 4, 10, 0, tzinfo=UTC)
    other_baby = Baby(
        id=uuid.uuid4(),
        family_id=uuid.uuid4(),
        name="Other Baby",
        gender="female",
        birth_date=date(2026, 1, 1),
        is_premature=False,
    )
    db.add(other_baby)
    for index in range(4):
        db.add(
            FeedingRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                feed_time=now - timedelta(hours=index),
                feed_type="formula",
                amount_ml=80 + index,
                created_at=now - timedelta(hours=index),
                updated_at=now - timedelta(hours=index),
            )
        )
    db.add_all(
        [
            GrowthRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                measurement_date=date(2026, 5, 4),
                weight_g=5200,
                created_at=now - timedelta(hours=2),
                updated_at=now - timedelta(hours=2),
            ),
            SleepRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                sleep_start=now - timedelta(hours=8),
                sleep_end=now - timedelta(hours=5),
                sleep_type="night",
                created_at=now - timedelta(hours=1),
                updated_at=now - timedelta(hours=1),
            ),
            HealthRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                record_date=date(2026, 5, 3),
                record_type="checkup",
                title="体检",
                created_at=now - timedelta(days=2),
                updated_at=now - timedelta(days=2),
            ),
            FeedingRecord(
                baby_id=other_baby.id,
                recorded_by=test_user.id,
                feed_time=now,
                feed_type="formula",
                amount_ml=120,
                created_at=now,
                updated_at=now,
            ),
        ]
    )
    await db.commit()

    context = await build_recent_deterministic_context(db, test_family.id, now=now)

    assert context is not None
    rendered = context.render_for_prompt()
    assert rendered.count("喂养") == 3
    assert "80ml" in rendered
    assert "83ml" not in rendered
    assert "体检" not in rendered
    assert "Other Baby" not in rendered
    assert f"当前家庭：{test_family.id}" in rendered
    assert "当前时间" in rendered
    assert "业务时间" in rendered
    assert "写入/更新时间" in rendered
