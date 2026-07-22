#!/usr/bin/env python3
"""Upload one explicitly approved local reference image to NoneLinear.

The endpoint is intentionally fixed. The script emits exactly one JSON object and
never prints credentials, request headers, or a full upstream response.
"""

from __future__ import annotations

import argparse
import base64
import ipaddress
import json
import os
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Mapping

UPLOAD_URL = "https://nonelinear.com/api/upload-file"
MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_RESPONSE_SIZE = 1024 * 1024
DEFAULT_TIMEOUT = 60

SIGNATURES = {
    ".png": ("image/png", (b"\x89PNG\r\n\x1a\n",)),
    ".jpg": ("image/jpeg", (b"\xff\xd8\xff",)),
    ".jpeg": ("image/jpeg", (b"\xff\xd8\xff",)),
    ".webp": ("image/webp", (b"RIFF",)),
}


class UploadError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _none_linear_base(value: str | None) -> bool:
    if not value:
        return False
    try:
        parsed = urllib.parse.urlparse(value.strip())
        return (
            parsed.scheme == "https"
            and parsed.hostname == "api.nonelinear.com"
            and parsed.port in (None, 443)
            and not parsed.username
            and not parsed.password
        )
    except (ValueError, TypeError):
        return False


def resolve_api_key(env: Mapping[str, str]) -> str | None:
    direct = (env.get("NONELINEAR_API_KEY") or env.get("Nonelinear_API_KEY") or "").strip()
    if direct:
        return direct
    if _none_linear_base(env.get("OPENAI_BASE_URL")):
        key = (env.get("OPENAI_API_KEY") or "").strip()
        if key:
            return key
    if _none_linear_base(env.get("ANTHROPIC_BASE_URL")):
        key = (env.get("ANTHROPIC_AUTH_TOKEN") or env.get("ANTHROPIC_API_KEY") or "").strip()
        if key:
            return key
    return None


def inspect_image(path_value: str | Path) -> tuple[Path, str, int]:
    path = Path(path_value).expanduser().resolve(strict=True)
    if not path.is_file():
        raise UploadError("invalid_file", "参考图必须是普通文件")
    size = path.stat().st_size
    if size < 1 or size > MAX_FILE_SIZE:
        raise UploadError("invalid_file", "参考图必须是 1 B 到 20 MB")
    extension = path.suffix.lower()
    if extension not in SIGNATURES:
        raise UploadError("invalid_file", "参考图只支持 PNG、JPEG 或 WebP")
    mime, prefixes = SIGNATURES[extension]
    with path.open("rb") as stream:
        header = stream.read(16)
    if not any(header.startswith(prefix) for prefix in prefixes):
        raise UploadError("invalid_file", "参考图扩展名与真实文件签名不一致")
    if extension == ".webp" and (len(header) < 12 or header[8:12] != b"WEBP"):
        raise UploadError("invalid_file", "参考图扩展名与真实 WebP 签名不一致")
    return path, mime, size


def _public_https_url(value: Any) -> str:
    if not isinstance(value, str) or len(value) > 4096:
        raise UploadError("invalid_response", "上传服务未返回有效的顶层 url")
    parsed = urllib.parse.urlparse(value.strip())
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise UploadError("invalid_response", "上传服务返回的 url 不是公开 HTTPS 地址")
    host = parsed.hostname.lower().rstrip(".")
    if host in {"localhost", "::1"} or host.endswith((".localhost", ".local")):
        raise UploadError("invalid_response", "上传服务返回了本地地址")
    try:
        if ipaddress.ip_address(host).is_private or ipaddress.ip_address(host).is_loopback:
            raise UploadError("invalid_response", "上传服务返回了私网地址")
    except ValueError:
        pass
    return parsed.geturl()


def upload_image(
    image_path: str | Path,
    api_key: str,
    *,
    timeout: int = DEFAULT_TIMEOUT,
    opener: Any = urllib.request.urlopen,
) -> dict[str, Any]:
    path, mime, size = inspect_image(image_path)
    payload = json.dumps(
        {"image": base64.b64encode(path.read_bytes()).decode("ascii"), "type": ".jpg" if mime == "image/jpeg" else path.suffix.lower()},
        separators=(",", ":"),
    ).encode("utf-8")
    request = urllib.request.Request(
        UPLOAD_URL,
        data=payload,
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with opener(request, timeout=timeout) as response:
            content = response.read(MAX_RESPONSE_SIZE + 1)
    except urllib.error.HTTPError as error:
        raise UploadError("upload_error", f"上传失败，HTTP {error.code}") from error
    except (urllib.error.URLError, TimeoutError, socket.timeout) as error:
        raise UploadError("network_error", "无法连接 NoneLinear 上传服务或请求超时") from error
    if len(content) > MAX_RESPONSE_SIZE:
        raise UploadError("invalid_response", "上传服务响应超过 1 MB")
    try:
        result = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise UploadError("invalid_response", "上传服务没有返回有效 JSON") from error
    if not isinstance(result, dict):
        raise UploadError("invalid_response", "上传服务返回值不是 JSON 对象")
    return {"status": "completed", "url": _public_https_url(result.get("url")), "mime": mime, "size": size}


def failure(error: Exception, api_key: str | None = None) -> dict[str, str]:
    code = error.code if isinstance(error, UploadError) else "unknown_error"
    message = str(error) if isinstance(error, UploadError) else "本地上传脚本发生未知错误"
    if api_key:
        message = message.replace(api_key, "[REDACTED]")
    return {"status": "failed", "code": code, "error": message[:500]}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="上传一张已获用户授权的 NoneLinear 本地参考图")
    parser.add_argument("image", type=Path)
    parser.add_argument("--confirmed", action="store_true", help="确认用户已同意本作业上传参考图")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    api_key = resolve_api_key(os.environ)
    try:
        if not args.confirmed:
            raise UploadError("consent_required", "上传前必须取得用户对本作业的一次明确确认")
        if not api_key:
            raise UploadError("missing_api_key", "未配置可用的 NoneLinear API key")
        result = upload_image(args.image, api_key, timeout=args.timeout)
        exit_code = 0
    except (UploadError, FileNotFoundError, OSError) as error:
        result = failure(error, api_key)
        exit_code = 1
    sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
