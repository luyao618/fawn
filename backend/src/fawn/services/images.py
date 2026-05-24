from __future__ import annotations

import io

from PIL import Image, ImageOps, UnidentifiedImageError


MODEL_IMAGE_MAX_SIDE = 1280
MODEL_IMAGE_QUALITY = 78
MODEL_IMAGE_MIME_TYPE = "image/jpeg"
MODEL_IMAGE_EXTENSION = ".jpg"
ALBUM_THUMBNAIL_MAX_SIDE = 720
ALBUM_THUMBNAIL_QUALITY = 74


class ImageProcessingError(Exception):
    pass


def prepare_model_image(
    image_bytes: bytes,
    *,
    max_side: int = MODEL_IMAGE_MAX_SIDE,
    quality: int = MODEL_IMAGE_QUALITY,
) -> tuple[bytes, str]:
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            image = ImageOps.exif_transpose(image)
            if image.mode not in {"RGB", "L"}:
                image = image.convert("RGB")
            elif image.mode == "L":
                image = image.convert("RGB")
            image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

            output = io.BytesIO()
            image.save(output, format="JPEG", quality=quality, optimize=True)
            return output.getvalue(), MODEL_IMAGE_MIME_TYPE
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageProcessingError("Invalid image") from exc


def prepare_album_thumbnail(image_bytes: bytes) -> tuple[bytes, str]:
    return prepare_model_image(
        image_bytes,
        max_side=ALBUM_THUMBNAIL_MAX_SIDE,
        quality=ALBUM_THUMBNAIL_QUALITY,
    )
