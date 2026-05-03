from datetime import date

from sqlalchemy import func, select

from fawn.models import Baby, User, WhoGrowthReference
from fawn.services.tracker import (
    PermissionDenied,
    calculate_age_months,
    ensure_tracker_write,
    lms_percentile,
    seed_who_csv,
)


def test_lms_percentile_returns_median_for_m_value() -> None:
    assert lms_percentile(value=4.2, l_value=1.0, m_value=4.2, s_value=0.1) == 50.0


def test_age_months_applies_premature_correction() -> None:
    baby = Baby(
        family_id="00000000-0000-0000-0000-000000000000",
        name="Baby",
        gender="female",
        birth_date=date(2026, 1, 1),
        is_premature=True,
        gestational_weeks=35,
    )

    corrected = calculate_age_months(baby, date(2026, 2, 1))

    assert corrected < (31 / 30.4375)


def test_friend_without_tracker_permission_is_rejected() -> None:
    user = User(
        family_id="00000000-0000-0000-0000-000000000000",
        username="family",
        display_name="Family",
        password_hash="hash",
        access_type="friend",
        role="儿科医生",
        permissions={"can_upload_photos": True, "can_write_tracker": False},
    )

    try:
        ensure_tracker_write(user)
    except PermissionDenied as exc:
        assert "Tracker write permission" in str(exc)
        return
    raise AssertionError("family user without permission should be rejected")


async def test_seed_who_csv_is_idempotent(db, tmp_path) -> None:
    csv_path = tmp_path / "who.csv"
    csv_path.write_text(
        "\n".join(
            [
                "gender,indicator,age_months,l_value,m_value,s_value",
                "male,weight,0.00,0.348700,3.346400,0.146020",
                "male,weight,0.03,0.312700,3.317400,0.146930",
            ]
        ),
        encoding="utf-8",
    )

    first_insert = await seed_who_csv(db, csv_path, idempotent=True)
    second_insert = await seed_who_csv(db, csv_path, idempotent=True)
    count = await db.scalar(select(func.count()).select_from(WhoGrowthReference))

    assert first_insert == 2
    assert second_insert == 0
    assert count == 2
