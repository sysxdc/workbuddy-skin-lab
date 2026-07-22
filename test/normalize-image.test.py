import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "normalize-generated-image.py"
SPEC = importlib.util.spec_from_file_location("normalize_generated_image", SCRIPT)
normalizer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(normalizer)


class NormalizeImageTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def test_background_is_fixed_jpeg_size(self):
        source = self.root / "source.png"
        output = self.root / "background.jpg"
        Image.new("RGB", (640, 640), (20, 30, 40)).save(source)
        result = normalizer.normalize(source, output, "background")
        self.assertEqual((result["width"], result["height"]), (2048, 1152))
        with Image.open(output) as image:
            self.assertEqual((image.format, image.size), ("JPEG", (2048, 1152)))

    def test_opaque_rgba_chroma_background_is_removed(self):
        source = self.root / "source.png"
        output = self.root / "icon.png"
        image = Image.new("RGBA", (128, 128), (0, 255, 0, 255))
        for x in range(40, 88):
            for y in range(32, 96):
                image.putpixel((x, y), (180, 60, 120, 255))
        image.save(source)
        result = normalizer.normalize(source, output, "icon")
        self.assertEqual((result["width"], result["height"]), (1024, 1024))
        with Image.open(output) as normalized:
            self.assertEqual(normalized.mode, "RGBA")
            self.assertEqual(normalized.getpixel((0, 0))[3], 0)
            self.assertLess(normalized.getchannel("A").getextrema()[0], 255)


if __name__ == "__main__":
    unittest.main()
