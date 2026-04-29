from datetime import date

from fawn.models import Baby, User
from fawn.services.tracker import (
    PermissionDenied,
    calculate_age_months,
    ensure_tracker_write,
    lms_percentile,
)


def test_lms_percentile_returns_median_for_m_value() -> None:
    assert lms_percentile(value=4.2, l_value=1.0, m_value=4.2, s_value=0.1) == 50.0


def test_age_months_applies_premature_correction() -> None:
    baby = Baby(
        name="Baby",
        gender="female",
        birth_date=date(2026, 1, 1),
        is_premature=True,
        gestational_weeks=35,
    )

    corrected = calculate_age_months(baby, date(2026, 2, 1))

    assert corrected < (31 / 30.4375)


def test_family_without_tracker_permission_is_rejected() -> None:
    user = User(
        username="family",
        display_name="Family",
        password_hash="hash",
        role="family",
        permissions={"can_upload_photos": True, "can_write_tracker": False},
    )

    try:
        ensure_tracker_write(user)
    except PermissionDenied as exc:
        assert "Tracker write permission" in str(exc)
        return
    raise AssertionError("family user without permission should be rejected")
