from types import SimpleNamespace

from fawn.services import storage


class FakeMinio:
    calls: list[tuple[str, bool, str]] = []
    response_headers: dict[str, str] | None = None

    def __init__(self, endpoint: str, *, access_key: str, secret_key: str, secure: bool, region: str):
        self.endpoint = endpoint
        self.secure = secure
        self.calls.append((endpoint, secure, region))

    def presigned_get_object(self, bucket: str, key: str, *, expires, response_headers=None):
        type(self).response_headers = response_headers
        scheme = "https" if self.secure else "http"
        return f"{scheme}://{self.endpoint}/{bucket}/{key}?expires={expires.total_seconds():.0f}"


def test_presigned_url_uses_public_minio_endpoint(monkeypatch):
    FakeMinio.calls = []
    FakeMinio.response_headers = None
    monkeypatch.setattr(storage, "Minio", FakeMinio)
    monkeypatch.setattr(
        storage,
        "get_settings",
        lambda: SimpleNamespace(
            minio_endpoint="minio:9000",
            minio_public_endpoint="localhost:9000",
            minio_access_key="minioadmin",
            minio_secret_key="minioadmin",
            minio_bucket="fawn",
            minio_region="us-east-1",
            minio_use_ssl=False,
            minio_public_use_ssl=False,
        ),
    )

    assert storage.get_presigned_url("photos/baby.jpg").startswith(
        "http://127.0.0.1:9000/fawn/photos/baby.jpg"
    )
    assert FakeMinio.calls == [("127.0.0.1:9000", False, "us-east-1")]
    assert FakeMinio.response_headers is None


def test_presigned_download_url_sets_attachment_header(monkeypatch):
    FakeMinio.calls = []
    FakeMinio.response_headers = None
    monkeypatch.setattr(storage, "Minio", FakeMinio)
    monkeypatch.setattr(
        storage,
        "get_settings",
        lambda: SimpleNamespace(
            minio_endpoint="minio:9000",
            minio_public_endpoint="127.0.0.1:9000",
            minio_access_key="minioadmin",
            minio_secret_key="minioadmin",
            minio_bucket="fawn",
            minio_region="us-east-1",
            minio_use_ssl=False,
            minio_public_use_ssl=False,
        ),
    )

    url = storage.get_presigned_download_url("photos/baby.jpg", "晨晨.jpg")

    assert url.startswith("http://127.0.0.1:9000/fawn/photos/baby.jpg")
    assert FakeMinio.response_headers is not None
    assert FakeMinio.response_headers["response-content-disposition"].startswith(
        "attachment;"
    )
    assert "filename*=UTF-8''%E6%99%A8%E6%99%A8.jpg" in FakeMinio.response_headers[
        "response-content-disposition"
    ]
