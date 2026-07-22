import importlib.util
import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "upload-reference.py"
SPEC = importlib.util.spec_from_file_location("upload_reference", SCRIPT)
upload_reference = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(upload_reference)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, _limit):
        return self.payload


class UploadReferenceTests(unittest.TestCase):
    def make_image(self, suffix=".png", data=b"\x89PNG\r\n\x1a\nmock"):
        handle = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        handle.write(data)
        handle.close()
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        return Path(handle.name)

    def test_api_key_priority_and_strict_base(self):
        self.assertEqual(upload_reference.resolve_api_key({"NONELINEAR_API_KEY": "first", "Nonelinear_API_KEY": "second"}), "first")
        self.assertEqual(upload_reference.resolve_api_key({"OPENAI_API_KEY": "ok", "OPENAI_BASE_URL": "https://api.nonelinear.com/v1"}), "ok")
        self.assertIsNone(upload_reference.resolve_api_key({"OPENAI_API_KEY": "no", "OPENAI_BASE_URL": "https://api.nonelinear.com.evil.test"}))
        self.assertIsNone(upload_reference.resolve_api_key({"ANTHROPIC_API_KEY": "no", "ANTHROPIC_BASE_URL": "https://user@api.nonelinear.com"}))

    def test_signature_and_extension_are_both_required(self):
        valid = self.make_image()
        self.assertEqual(upload_reference.inspect_image(valid)[1], "image/png")
        forged = self.make_image(".jpg", b"\x89PNG\r\n\x1a\nmock")
        with self.assertRaises(upload_reference.UploadError):
            upload_reference.inspect_image(forged)
        oversized = self.make_image()
        with oversized.open("r+b") as stream:
            stream.truncate(upload_reference.MAX_FILE_SIZE + 1)
        with self.assertRaises(upload_reference.UploadError):
            upload_reference.inspect_image(oversized)

    def test_upload_endpoint_is_fixed_and_only_top_level_url_is_used(self):
        image = self.make_image()
        seen = {}

        def opener(request, timeout):
            seen["url"] = request.full_url
            seen["timeout"] = timeout
            return FakeResponse(json.dumps({"url": "https://cdn.example.com/reference.png", "data": {"url": "https://wrong.example/a.png"}}).encode())

        result = upload_reference.upload_image(image, "nl-secret", opener=opener)
        self.assertEqual(seen["url"], upload_reference.UPLOAD_URL)
        self.assertEqual(result["url"], "https://cdn.example.com/reference.png")

        def nested_only(_request, timeout):
            return FakeResponse(json.dumps({"data": {"url": "https://wrong.example/a.png"}}).encode())

        with self.assertRaises(upload_reference.UploadError):
            upload_reference.upload_image(image, "nl-secret", opener=nested_only)

    def test_private_and_authenticated_result_urls_are_rejected(self):
        for url in ["http://cdn.example.com/a.png", "https://localhost/a.png", "https://192.168.1.2/a.png", "https://user:pass@cdn.example.com/a.png"]:
            with self.assertRaises(upload_reference.UploadError):
                upload_reference._public_https_url(url)

    def test_missing_consent_never_calls_upload_and_output_redacts_key(self):
        image = self.make_image()
        previous = os.environ.get("NONELINEAR_API_KEY")
        os.environ["NONELINEAR_API_KEY"] = "nl-never-print-me"
        try:
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(upload_reference.main([str(image)]), 1)
            self.assertNotIn("nl-never-print-me", output.getvalue())
            failed = upload_reference.failure(upload_reference.UploadError("upload_error", "bad nl-never-print-me Authorization"), "nl-never-print-me")
            self.assertNotIn("nl-never-print-me", json.dumps(failed))
        finally:
            if previous is None:
                os.environ.pop("NONELINEAR_API_KEY", None)
            else:
                os.environ["NONELINEAR_API_KEY"] = previous


if __name__ == "__main__":
    unittest.main()
