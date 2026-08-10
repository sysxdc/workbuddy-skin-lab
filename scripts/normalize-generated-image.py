#!/usr/bin/env python3
"""Normalize generated theme images into the fixed WorkBuddy template sizes."""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover - exercised by preflight in environments without Pillow.
    Image = None
    ImageOps = None

SPECS = {
    "background": {"size": (2048, 1152), "mode": "RGB", "max": 12 * 1024 * 1024},
    "hero": {"size": (1024, 1024), "mode": "RGBA", "max": 4 * 1024 * 1024},
    "icon": {"size": (1024, 1024), "mode": "RGBA", "max": 4 * 1024 * 1024},
    "composer": {"size": (512, 512), "mode": "RGBA", "max": 2 * 1024 * 1024},
    "particle": {"size": (512, 512), "mode": "RGBA", "max": 1024 * 1024},
}


class NormalizeError(RuntimeError):
    pass


def dominant_border_color(image):
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = []
    for x in range(width):
        pixels.extend((rgb.getpixel((x, 0)), rgb.getpixel((x, height - 1))))
    for y in range(height):
        pixels.extend((rgb.getpixel((0, y)), rgb.getpixel((width - 1, y))))
    quantized = [tuple(channel // 8 * 8 for channel in pixel) for pixel in pixels]
    return Counter(quantized).most_common(1)[0][0]


def remove_flat_background(image):
    rgba = image.convert("RGBA")
    key = dominant_border_color(rgba)
    result = Image.new("RGBA", rgba.size)
    source = rgba.load()
    target = result.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, original_alpha = source[x, y]
            distance = math.sqrt((red - key[0]) ** 2 + (green - key[1]) ** 2 + (blue - key[2]) ** 2)
            if distance <= 18:
                alpha = 0
            elif distance >= 80:
                alpha = original_alpha
            else:
                alpha = round(original_alpha * (distance - 18) / 62)
            target[x, y] = (red, green, blue, alpha)
    return result


def normalize(source_value: str | Path, output_value: str | Path, kind: str) -> dict:
    if Image is None:
        raise NormalizeError("缺少 Pillow；请按 references/NONELINEAR_SETUP.md 配置 Python 环境")
    if kind not in SPECS:
        raise NormalizeError("未知素材类型")
    source = Path(source_value).expanduser().resolve(strict=True)
    output = Path(output_value).expanduser().resolve()
    if not source.is_file() or source.stat().st_size < 1 or source.stat().st_size > 20 * 1024 * 1024:
        raise NormalizeError("源图片必须是 1 B 到 20 MB 的普通文件")
    spec = SPECS[kind]
    try:
        with Image.open(source) as opened:
            opened.verify()
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened)
            if kind == "background":
                result = ImageOps.fit(image.convert("RGB"), spec["size"], method=Image.Resampling.LANCZOS)
            else:
                rgba = image.convert("RGBA")
                has_real_transparency = "A" in image.getbands() and rgba.getchannel("A").getextrema()[0] < 255
                transparent = rgba if has_real_transparency else remove_flat_background(image)
                transparent.thumbnail(spec["size"], Image.Resampling.LANCZOS)
                result = Image.new("RGBA", spec["size"], (0, 0, 0, 0))
                result.alpha_composite(transparent, ((spec["size"][0] - transparent.width) // 2, (spec["size"][1] - transparent.height) // 2))
    except Exception as error:
        if isinstance(error, NormalizeError):
            raise
        raise NormalizeError("源文件不是可解码的图片") from error
    output.parent.mkdir(parents=True, exist_ok=True)
    if kind == "background":
        result.save(output, format="JPEG", quality=90, optimize=True, progressive=True)
    else:
        result.save(output, format="PNG", optimize=True)
        alphas = result.getchannel("A")
        if alphas.getextrema() == (255, 255) or any(result.getpixel(point)[3] > 24 for point in [(0, 0), (result.width - 1, 0), (0, result.height - 1), (result.width - 1, result.height - 1)]):
            output.unlink(missing_ok=True)
            raise NormalizeError("透明素材去背失败：边角仍不透明")
    size = output.stat().st_size
    if size < 1 or size > spec["max"]:
        output.unlink(missing_ok=True)
        raise NormalizeError(f"标准化后的 {kind} 素材超过预算")
    return {"status": "completed", "kind": kind, "path": str(output), "width": spec["size"][0], "height": spec["size"][1], "size": size, "format": "jpeg" if kind == "background" else "png"}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--kind", choices=sorted(SPECS), required=True)
    args = parser.parse_args(argv)
    try:
        result = normalize(args.source, args.output, args.kind)
        code = 0
    except (NormalizeError, FileNotFoundError, OSError) as error:
        result = {"status": "failed", "code": "normalize_error", "error": str(error)[:500]}
        code = 1
    sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
