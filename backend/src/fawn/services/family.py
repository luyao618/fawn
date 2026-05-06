from __future__ import annotations

import re


class FamilyNameError(ValueError):
    pass


def display_family_name(value: str) -> str:
    name = re.sub(r"\s+", " ", value.strip())
    if not name:
        raise FamilyNameError("Family name is required")
    return name


def normalize_family_name(value: str) -> str:
    return display_family_name(value).casefold()
