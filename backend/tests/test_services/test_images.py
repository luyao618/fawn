from __future__ import annotations

import io

import pytest
from PIL import Image

from fawn.services.images import ImageProcessingError, prepare_model_image


def _jpeg(width: int, height: int, quality: int = 95) -> bytes:
    image = Image.new("RGB", (width, height), color=(120, 80, 40))
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=quality)
    return output.getvalue()


def test_prepare_model_image_bounds_dimensions_and_returns_jpeg() -> None:
    content, mime_type = prepare_model_image(_jpeg(3200, 2400))

    with Image.open(io.BytesIO(content)) as image:
        assert image.format == "JPEG"
        assert max(image.size) <= 1280
    assert mime_type == "image/jpeg"


def test_prepare_model_image_rejects_invalid_image() -> None:
    with pytest.raises(ImageProcessingError):
        prepare_model_image(b"not an image")
