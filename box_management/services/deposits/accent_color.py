from io import BytesIO
from math import log2

import requests
from PIL import Image

from box_management.models import Song

ACCENT_COLOR_TARGET_SIZE = 64
ACCENT_COLOR_EDGE_RATIO = 0.1
ACCENT_COLOR_MIN_ALPHA = 128
ACCENT_COLOR_MIN_SATURATION_STRICT = 0.18
ACCENT_COLOR_MIN_SATURATION_FALLBACK = 0.08
ACCENT_COLOR_MIN_LIGHTNESS_STRICT = 0.18
ACCENT_COLOR_MAX_LIGHTNESS_STRICT = 0.92
ACCENT_COLOR_MIN_LIGHTNESS_FALLBACK = 0.14
ACCENT_COLOR_MAX_LIGHTNESS_FALLBACK = 0.96
ACCENT_COLOR_QUANTIZATION_STEP = 32
ACCENT_COLOR_IDEAL_LIGHTNESS = 0.58
ACCENT_COLOR_BROWN_HUE_MIN = 18 / 360
ACCENT_COLOR_BROWN_HUE_MAX = 50 / 360
ACCENT_COLOR_BROWN_MAX_LIGHTNESS = 0.5
ACCENT_COLOR_BROWN_MIN_SATURATION = 0.18
ACCENT_COLOR_BROWN_PENALTY_WEIGHT = 240
ACCENT_COLOR_SATURATION_SCORE_WEIGHT = 1000
ACCENT_COLOR_COUNT_SCORE_WEIGHT = 14
ACCENT_COLOR_LIGHTNESS_SCORE_WEIGHT = 8
ACCENT_COLOR_REQUEST_TIMEOUT = 8


def _accent_clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _accent_clamp_byte(value: float) -> int:
    return int(_accent_clamp(round(value or 0), 0, 255))


def _accent_rgb_to_hex(r: float, g: float, b: float) -> str:
    return f"#{_accent_clamp_byte(r):02X}{_accent_clamp_byte(g):02X}{_accent_clamp_byte(b):02X}"


def _accent_rgb_to_hsl(r: float, g: float, b: float) -> tuple[float, float, float]:
    rn = _accent_clamp_byte(r) / 255.0
    gn = _accent_clamp_byte(g) / 255.0
    bn = _accent_clamp_byte(b) / 255.0

    max_value = max(rn, gn, bn)
    min_value = min(rn, gn, bn)
    lightness = (max_value + min_value) / 2.0

    if max_value == min_value:
        return 0.0, 0.0, lightness

    delta = max_value - min_value
    saturation = delta / (2.0 - max_value - min_value) if lightness > 0.5 else delta / (max_value + min_value)

    if max_value == rn:
        hue = (gn - bn) / delta + (6 if gn < bn else 0)
    elif max_value == gn:
        hue = (bn - rn) / delta + 2
    else:
        hue = (rn - gn) / delta + 4

    hue /= 6.0
    return hue, saturation, lightness


def _accent_get_brown_penalty(hue: float, saturation: float, lightness: float) -> float:
    is_brown_hue = ACCENT_COLOR_BROWN_HUE_MIN <= hue <= ACCENT_COLOR_BROWN_HUE_MAX
    is_brown_candidate = (
        is_brown_hue
        and saturation >= ACCENT_COLOR_BROWN_MIN_SATURATION
        and lightness <= ACCENT_COLOR_BROWN_MAX_LIGHTNESS
    )
    if not is_brown_candidate:
        return 0.0

    hue_center = (ACCENT_COLOR_BROWN_HUE_MIN + ACCENT_COLOR_BROWN_HUE_MAX) / 2.0
    hue_half_range = (ACCENT_COLOR_BROWN_HUE_MAX - ACCENT_COLOR_BROWN_HUE_MIN) / 2.0
    hue_distance = abs(hue - hue_center)
    hue_factor = 1 - _accent_clamp(hue_distance / hue_half_range, 0.0, 1.0)
    darkness_factor = _accent_clamp(
        (ACCENT_COLOR_BROWN_MAX_LIGHTNESS - lightness) / ACCENT_COLOR_BROWN_MAX_LIGHTNESS,
        0.0,
        1.0,
    )
    return ACCENT_COLOR_BROWN_PENALTY_WEIGHT * hue_factor * darkness_factor


def _accent_is_pixel_eligible(r: int, g: int, b: int, a: int, mode: str) -> bool:
    if a < ACCENT_COLOR_MIN_ALPHA:
        return False

    _h, saturation, lightness = _accent_rgb_to_hsl(r, g, b)

    if mode == "strict":
        return (
            saturation >= ACCENT_COLOR_MIN_SATURATION_STRICT
            and lightness >= ACCENT_COLOR_MIN_LIGHTNESS_STRICT
            and lightness <= ACCENT_COLOR_MAX_LIGHTNESS_STRICT
        )

    return (
        saturation >= ACCENT_COLOR_MIN_SATURATION_FALLBACK
        and lightness >= ACCENT_COLOR_MIN_LIGHTNESS_FALLBACK
        and lightness <= ACCENT_COLOR_MAX_LIGHTNESS_FALLBACK
    )


def _accent_quantize_channel(value: int) -> int:
    quantized = int(_accent_clamp_byte(value) / ACCENT_COLOR_QUANTIZATION_STEP) * ACCENT_COLOR_QUANTIZATION_STEP
    centered = quantized + (ACCENT_COLOR_QUANTIZATION_STEP / 2)
    return _accent_clamp_byte(centered)


def _accent_bucket_key(r: int, g: int, b: int) -> tuple[int, int, int]:
    return (
        _accent_quantize_channel(r),
        _accent_quantize_channel(g),
        _accent_quantize_channel(b),
    )


def _accent_score_bucket(bucket: dict[str, float]) -> float:
    avg_r = bucket["r_sum"] / bucket["count"]
    avg_g = bucket["g_sum"] / bucket["count"]
    avg_b = bucket["b_sum"] / bucket["count"]
    hue, saturation, lightness = _accent_rgb_to_hsl(avg_r, avg_g, avg_b)

    saturation_score = saturation * ACCENT_COLOR_SATURATION_SCORE_WEIGHT
    count_score = log2(bucket["count"] + 1) * ACCENT_COLOR_COUNT_SCORE_WEIGHT
    lightness_score = (1 - abs(lightness - ACCENT_COLOR_IDEAL_LIGHTNESS) * 2) * ACCENT_COLOR_LIGHTNESS_SCORE_WEIGHT
    brown_penalty = _accent_get_brown_penalty(hue, saturation, lightness)

    return saturation_score + count_score + lightness_score - brown_penalty


def _extract_accent_color_from_rgba_image(image: Image.Image, mode: str) -> str | None:
    width, height = image.size
    edge_x = int(width * ACCENT_COLOR_EDGE_RATIO)
    edge_y = int(height * ACCENT_COLOR_EDGE_RATIO)

    if width - (edge_x * 2) <= 0 or height - (edge_y * 2) <= 0:
        edge_x = 0
        edge_y = 0

    pixels = image.load()
    buckets: dict[tuple[int, int, int], dict[str, float]] = {}

    for y in range(edge_y, height - edge_y):
        for x in range(edge_x, width - edge_x):
            r, g, b, a = pixels[x, y]
            if not _accent_is_pixel_eligible(r, g, b, a, mode):
                continue

            key = _accent_bucket_key(r, g, b)
            bucket = buckets.setdefault(
                key,
                {"count": 0, "r_sum": 0.0, "g_sum": 0.0, "b_sum": 0.0},
            )
            bucket["count"] += 1
            bucket["r_sum"] += r
            bucket["g_sum"] += g
            bucket["b_sum"] += b

    best_bucket = None
    best_score = float("-inf")

    for bucket in buckets.values():
        if bucket["count"] <= 0:
            continue
        score = _accent_score_bucket(bucket)
        if score > best_score:
            best_bucket = bucket
            best_score = score

    if not best_bucket:
        return None

    return _accent_rgb_to_hex(
        best_bucket["r_sum"] / best_bucket["count"],
        best_bucket["g_sum"] / best_bucket["count"],
        best_bucket["b_sum"] / best_bucket["count"],
    )


def _fetch_remote_image_for_accent(image_url: str) -> Image.Image | None:
    if not image_url:
        return None

    try:
        response = requests.get(
            image_url,
            timeout=ACCENT_COLOR_REQUEST_TIMEOUT,
            headers={"User-Agent": "musikmap-accent-color/1.0"},
        )
        response.raise_for_status()
        with Image.open(BytesIO(response.content)) as raw_image:
            rgba_image = raw_image.convert("RGBA")
            try:
                resample = Image.Resampling.LANCZOS
            except AttributeError:
                resample = Image.LANCZOS
            return rgba_image.resize(
                (ACCENT_COLOR_TARGET_SIZE, ACCENT_COLOR_TARGET_SIZE),
                resample=resample,
            )
    except Exception:
        return None


def extract_accent_color_from_urls(
    image_url_small: str | None = None,
    image_url: str | None = None,
) -> str | None:
    source_url = (image_url_small or image_url or "").strip()
    if not source_url:
        return None

    image = _fetch_remote_image_for_accent(source_url)
    if image is None:
        return None

    return (
        _extract_accent_color_from_rgba_image(image, mode="strict")
        or _extract_accent_color_from_rgba_image(image, mode="fallback")
        or None
    )


def refresh_song_accent_color(song: Song, force: bool = False) -> str | None:
    if not force and (getattr(song, "accent_color", "") or "").strip():
        return song.accent_color

    accent_color = extract_accent_color_from_urls(
        image_url_small=getattr(song, "image_url_small", "") or "",
        image_url=getattr(song, "image_url", "") or "",
    )

    if accent_color:
        song.accent_color = accent_color

    return accent_color


__all__ = ["extract_accent_color_from_urls", "refresh_song_accent_color"]
