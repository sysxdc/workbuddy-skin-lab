"""Loads Python tests whose descriptive filenames are not importable module names."""

import importlib.util
import unittest
from pathlib import Path


def _load(path: Path):
    name = "wb_" + path.name.replace("-", "_").replace(".", "_")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_tests(loader, _tests, _pattern):
    root = Path(__file__).resolve().parent
    suite = unittest.TestSuite()
    for name in ["upload-reference.test.py", "normalize-image.test.py"]:
        suite.addTests(loader.loadTestsFromModule(_load(root / name)))
    return suite

