"""Bounded archive inspection and disposable offline ingestion verification."""
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import uuid
from contextlib import contextmanager, nullcontext
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2] / "corpus_raw/crm/ifangzhou/jyq"
PRISM = Path("D:/Dev/Prism")


def rows():
    return [json.loads(line) for line in (ROOT / "manifest.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]


def media(row):
    path = (ROOT / row["path"]).resolve()
    if not path.is_relative_to(ROOT.resolve()):
        raise ValueError("outside_archive")
    if path.stat().st_size > 20 * 1024 * 1024:
        raise ValueError("media_too_large")
    raw = path.read_bytes()
    from PIL import Image
    with Image.open(io.BytesIO(raw)) as image:
        image.verify()
    with Image.open(io.BytesIO(raw)) as image:
        image.load()
    return raw


def isolated(raw=None, directory=None):
    sys.path.insert(0, str(PRISM))
    sys.path.insert(0, str(PRISM / "services/ingestion/src"))
    from prism_ingestion.server import IngestionStore, validate_event
    class DisposableStore(IngestionStore):
        @contextmanager
        def _connect(self):
            connection = super()._connect()
            try:
                with connection:
                    yield connection
            finally:
                connection.close()
    from services.read_api.production import ProductionReadRepository
    from services.read_api.app import ReadApp
    from services.read_api.acl import Principal
    from PIL import Image
    if raw is None:
        buffer = io.BytesIO()
        Image.new("RGB", (8, 8), "red").save(buffer, format="PNG")
        raw = buffer.getvalue()
    shared = directory is not None
    with (nullcontext(directory) if shared else tempfile.TemporaryDirectory(prefix="prism-batch-")) as directory:
        root = Path(directory)
        store = DisposableStore(root / "db", root / "media")
        digest = hashlib.sha256(raw).hexdigest()
        asset = store.put_asset(data=raw, checksum="sha256:" + digest, metadata={}, file_name="sample.png")
        asset["assetId"] = asset.get("assetId") or asset.get("asset_id")
        now = datetime.now(timezone.utc).isoformat()
        event = dict(schemaVersion="1.0", eventId=str(uuid.uuid4()), runId=str(uuid.uuid4()),
                     idempotencyKey=digest, eventType="content.upserted", occurredAt=now,
                     source="archive", tenantKey="isolated", payload=dict(
                         contentType="teaching_asset", visibility="school", spaceId="archive",
                         nodeToken=digest, documentId=digest, documentType="image", parentNodeToken=None,
                         revisionId=digest, title="Isolated sample", sourceUrl="archive:" + digest,
                         sourceCreatedAt=None, sourceUpdatedAt=None, directoryPath=[],
                         body={"format": "feishu_blocks", "blocks": []}, assets=[{"assetId": asset["assetId"]}],
                         sourceAudit=dict(creatorOpenId=None, ownerOpenId=None, lastEditorOpenId=None),
                         sync=dict(workflowId="archive", jobId="isolated", runId="isolated", extractedAt=now)))
        errors = validate_event(event)
        if errors:
            raise ValueError(str(errors))
        status, _, resource = store.accept_event(event)
        duplicate = store.accept_event(event)[0]
        app = ReadApp(ProductionReadRepository(root / "db", root / "media"), lambda env: env.get("principal"))
        def get(path, principal):
            result = []
            body = b"".join(app({"REQUEST_METHOD": "GET", "PATH_INFO": path, "principal": principal}, lambda s, h: result.append(s)))
            return result[0], body
        teacher = Principal("offline-teacher", "teacher", frozenset())
        path = "/api/v1/teaching-assets/" + resource
        assert get(path, teacher)[0] == "200 OK"
        assert get("/api/v1/teaching-assets", teacher)[0] == "200 OK"
        assert get(path, None)[0].startswith("401")
        assert get(path, Principal("invalid", "invalid", frozenset()))[0].startswith("404")
        assert get("/api/v1/media/" + asset["assetId"], teacher)[1] == raw
        assert get("/api/v1/media/" + asset["assetId"], None)[0].startswith("401")
        assert status in ("accepted", "duplicate") and duplicate == "duplicate"
        if not shared:
            event["idempotencyKey"] += ":private"
            event["eventId"] = str(uuid.uuid4())
            event["payload"]["visibility"] = "private"
            store.accept_event(event)
            assert get(path, teacher)[0].startswith("404")
            assert get("/api/v1/media/" + asset["assetId"], teacher)[0].startswith("404")
        return dict(accepted=True, duplicate=True, authorizedRead=True, unauthorizedDenied=True, mediaMatched=True)


def dispatch(request):
    if not isinstance(request, dict) or set(request) - {"action", "batchId"}:
        raise ValueError("invalid_request")
    action = request.get("action")
    if action == "batch-isolated-verify":
        import time
        selected = [r for r in rows() if r.get("run_id") == request.get("batchId") and r.get("asset_type") == "image"]
        if not selected or len(selected) > 100:
            raise ValueError("batch_requires_1_to_100_images")
        started = time.monotonic()
        items = []
        total_bytes = 0
        with tempfile.TemporaryDirectory(prefix="prism-full-batch-") as directory:
            for index, row in enumerate(selected):
                try:
                    if time.monotonic() - started > 90:
                        raise TimeoutError("batch_time_limit")
                    raw = media(row)
                    total_bytes += len(raw)
                    if total_bytes > 100 * 1024 * 1024:
                        raise ValueError("batch_byte_limit")
                    first = isolated(raw, directory)
                    replay = isolated(raw, directory)
                    items.append(dict(index=index, ok=True, sha256=hashlib.sha256(raw).hexdigest(), **first, replayVerified=replay["duplicate"]))
                except Exception as exc:
                    items.append(dict(index=index, ok=False, error=type(exc).__name__))
        passed = sum(item["ok"] for item in items)
        return dict(batchId=request["batchId"], total=len(selected), completed=len(items), passed=passed,
                    failed=len(items)-passed, items=items, temporaryDatabaseDeleted=True), "real_batch_isolated"
    if action == "isolated-verify":
        if request.get("batchId"):
            selected = [r for r in rows() if r.get("run_id") == request["batchId"] and r.get("asset_type") == "image"]
            if not selected:
                raise ValueError("batch_not_found")
            return isolated(media(selected[0])), "real_sample_isolated"
        return isolated(), "synthetic_isolated"
    if action not in {"archive-inspect", "archive-verify"}:
        raise ValueError("unsupported_action")
    records = rows()
    batches = {}
    for row in records:
        key = row.get("run_id")
        if not key:
            continue
        batch = batches.setdefault(key, dict(batchId=key, images=0, records=0, lastFetchedAt=""))
        batch["records"] += 1
        batch["images"] += row.get("asset_type") == "image"
        batch["lastFetchedAt"] = max(batch["lastFetchedAt"], row.get("fetched_at", ""))
    ordered = sorted(batches.values(), key=lambda b: b["lastFetchedAt"], reverse=True)
    if action == "archive-inspect":
        return dict(batches=ordered, latestBatchId=ordered[0]["batchId"] if ordered else None), "real_metadata"
    batch_id = request.get("batchId") or (ordered[0]["batchId"] if ordered else None)
    if batch_id not in batches:
        raise ValueError("batch_not_found")
    results = []
    for row in records:
        if row.get("run_id") != batch_id or row.get("asset_type") != "image":
            continue
        try:
            raw = media(row)
            results.append(dict(ok=True, sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw)))
        except Exception as exc:
            results.append(dict(ok=False, error=type(exc).__name__))
    return dict(batchId=batch_id, checked=len(results), valid=sum(r["ok"] for r in results), items=results), "real_media_decode"


def main():
    result = dict(schemaVersion="1.0", ok=False, action=None, evidence=None,
                  observedAt=datetime.now(timezone.utc).isoformat(),
                  productionTarget=dict(status="unverified", writeEnabled=False), data=None, error=None)
    try:
        request = json.loads(sys.stdin.read(65537))
        result["action"] = request.get("action") if isinstance(request, dict) else None
        result["data"], result["evidence"] = dispatch(request)
        result["ok"] = True
    except Exception as exc:
        result["error"] = dict(code=type(exc).__name__, message="Request failed; no production write attempted")
    print(json.dumps(result, ensure_ascii=True))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
