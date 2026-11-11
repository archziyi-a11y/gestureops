import runpy
import unittest
from pathlib import Path

MODULE = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/prism-batch.py"))


class BatchTests(unittest.TestCase):
    def test_isolated(self):
        self.assertTrue(MODULE["isolated"]()["mediaMatched"])

    def test_reject_paths(self):
        with self.assertRaises(ValueError):
            MODULE["dispatch"]({"action": "archive-inspect", "path": "C:/"})
        with self.assertRaises(ValueError):
            MODULE["media"]({"path": "../../outside"})

    def test_reject_production(self):
        with self.assertRaises(ValueError):
            MODULE["dispatch"]({"action": "import"})


if __name__ == "__main__":
    unittest.main()
