# Prism batch implementation

Scope: additive teaching_asset ingestion/read support, unchanged ACL and existing
note gates. No production writes, credentials, external models or UI/server edits.
Acceptance: real image or synthetic PNG -> temporary SQLite/media -> authorized
detail/media -> anonymous/invalid-role denial; private revision revokes access.

## Node wrapper contract

Run Python 3 with Pillow, absolute script path
`D:/Dev/smart-customer-service/workbench-prototype-v3/scripts/prism-batch.py`.
Send one UTF-8 JSON object on stdin. Parse stdout as one JSON object even on exit 1.
Exit 0 means the action ran, not that every checked image passed.
Only action and optional batchId are allowed. Never accept caller paths or env
overrides. Archive root is the repository's corpus_raw/crm/ifangzhou/jyq.

- `{"action":"archive-inspect"}`: data.batches contains batchId, images,
  records, lastFetchedAt; data.latestBatchId selects latest manifest fetched_at.
- `{"action":"archive-verify","batchId":"existing run_id"}`: omitted batchId
  selects latest; data has batchId, checked, valid, items (ok/hash/bytes or error).
- `{"action":"isolated-verify"}`: synthetic PNG; optional existing batchId uses
  only its first image, never claims whole-batch ingestion.

Fixed envelope: schemaVersion="1.0", ok, action, observedAt (host UTC clock,
action start, not ingestion time), evidence, productionTarget, data, error.
error is null or {code,message}. productionTarget always
{status:"unverified",writeEnabled:false}. No import action is exposed.
Evidence values: real_metadata, real_media_decode, synthetic_isolated,
real_sample_isolated. Errors expose no file contents or filesystem paths.

## Product contract

Existing assets/events endpoints remain the ingestion entry points. teaching_asset
requires explicit visibility private/school and nonempty linked assetId list;
source archive is accepted only for this type. Existing common event envelope is
retained. No real target URL, deployment or authorized service identity verified.
New GET /api/v1/teaching-assets supports cursor/limit; detail suffix is resourceId.
Media uses existing ACL endpoint. school visibility applies to valid existing
roles, not anonymous callers; private remains unreadable under existing ACL.
No keyword search added. Caller wrapper MUST authenticate/authorize operators;
the local CLI is not an identity service.

## Evidence and gaps

2026-11-10 local execution: read API suite 76 tests passed; batch suite 3 passed.
Latest manifest batch c24967dd-8d0c-4441-8fcf-1f005e06e693 has 48 images;
48 decoded. Its manifest lastFetchedAt is 2026-11-09T21:00:25+08:00, a source
metadata timestamp, not a measured database insertion time. First real image and
synthetic PNG passed isolated ingestion/idempotency/read/media/denial checks.
All writes stayed in disposable temporary directories. No production deployment.

Remaining: target service discovery/auth, actual HTTP ingestion deployment test,
whole-batch resumable import and mappings, original-vs-thumbnail/quality and rights
review, subject metadata confirmation, real teacher session and classroom use.
Offline Principals are not teacher trials. Existing unrelated dirty files untouched.
