import uuid

import pytest

from fawn.services.auth import create_access_token, decode_token, hash_password, verify_password


def test_hash_and_verify_password() -> None:
    hashed = hash_password("secret-password")

    assert hashed != "secret-password"
    assert verify_password("secret-password", hashed)
    assert not verify_password("wrong-password", hashed)


def test_create_access_token_payload() -> None:
    user_id = uuid.uuid4()

    token = create_access_token(user_id, "parent")
    payload = decode_token(token)

    assert payload["sub"] == str(user_id)
    assert payload["role"] == "parent"
    assert payload["access_type"] == "parent"
    assert "exp" in payload


def test_decode_invalid_token_fails() -> None:
    with pytest.raises(Exception):
        decode_token("not-a-token")
