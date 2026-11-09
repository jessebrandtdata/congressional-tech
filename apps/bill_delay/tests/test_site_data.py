"""site_data.py: the site's copy of the built data, from the bundled fixture."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent


class SiteData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(tempfile.mkdtemp())
        cls.data = cls.root / "data"
        (cls.data / "119").mkdir(parents=True)
        for name in ("versions.csv", "summaries.csv"):
            shutil.copy(HERE / "fixture" / "119" / name, cls.data / "119" / name)
        subprocess.run([sys.executable, "-m", "bill_delay.delays", "--data-dir", str(cls.data), "--as-of", "2026-10-14"],
                       check=True, capture_output=True, cwd=APP)
        cls.out = cls.root / "site"

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.root)

    def run_copy(self, data):
        return subprocess.run([sys.executable, "-m", "bill_delay.site_data", "--data-dir", str(data), "--out", str(self.out)],
                              capture_output=True, text=True, cwd=APP)

    def test_copies_the_index_and_each_congress(self):
        (self.out / "leftover").mkdir(parents=True, exist_ok=True)  # an earlier copy's file the new one must remove
        done = self.run_copy(self.data)
        self.assertEqual(done.returncode, 0, done.stderr)
        index = json.loads((self.out / "congresses.json").read_text())["congresses"]
        self.assertEqual([e["file"] for e in index], ["119/delays.json"])
        self.assertEqual(sorted(p.name for p in (self.out / "119").iterdir()),
                         ["awaiting.csv", "delays.csv", "delays.json", "stats.json"])
        self.assertFalse((self.out / "leftover").exists())
        self.assertFalse((self.out / "119" / "versions.csv").exists())  # inputs stay out of the site

    def test_a_listed_congress_without_its_files_fails(self):
        broken = self.root / "broken"
        shutil.copytree(self.data, broken)
        (broken / "119" / "delays.json").unlink()
        done = self.run_copy(broken)
        self.assertNotEqual(done.returncode, 0)
        self.assertIn("delays.json not found", done.stderr)


if __name__ == "__main__":
    unittest.main()
