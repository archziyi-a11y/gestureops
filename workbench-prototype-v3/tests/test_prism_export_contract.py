"""Contracts for the existing Prism exporter used by the workbench."""
import json
import sys
from pathlib import Path
from unittest.mock import patch

PRISM = Path(__file__).resolve().parents[3] / "Prism"
sys.path.insert(0, str(PRISM / "scripts"))
import export_feishu_wiki as exporter
import normalize_feishu_export as normalizer


def test_monthly_quota_is_not_retried():
    calls = []

    def denied():
        calls.append(1)
        raise exporter.FeishuApiError("quota", "quota", feishu_code=99991403)

    with patch.object(exporter.time, "sleep") as sleep:
        try:
            exporter.retry(denied)
        except exporter.FeishuApiError as exc:
            assert exc.feishu_code == 99991403
        else:
            raise AssertionError("quota failure must propagate")
        assert len(calls) == 1
        sleep.assert_not_called()


def test_failed_download_is_not_normalized_as_empty_note(tmp_path):
    manifest = {"roots": [], "items": [{"nodeToken": "failed", "status": "failed"}]}
    (tmp_path / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    with patch.object(sys, "argv", ["normalize", "--snapshot", str(tmp_path)]):
        assert normalizer.main() == 0
    report = json.loads((tmp_path / "derived/normalization-report.json").read_text(encoding="utf-8"))
    assert report["records"] == 0
    assert report["teachingNoteCandidates"] == 0
