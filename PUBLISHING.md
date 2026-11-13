# Source-only publishing boundary

This repository is a sanitized export of the development workspace, not its
production data directory. Original materials and original Git history remain
in the local development workspace and a separate local Git bundle.

Excluded from this export: internal training questions and their detailed audit
JSON, original company documents, customer data, credentials, production backups,
personal chat-cache paths, and fixed cloud instance identifiers.

## Complete engineering experience archive

The owner-approved archive added on 2026-11-13 preserves 104 historical method,
design, retrospective and card-handoff documents in full. See
[`docs/EXPERIENCE-INDEX.md`](docs/EXPERIENCE-INDEX.md) and its per-file SHA-256
manifest. These historical documents retain operational references and observed
metadata for reproducibility; the exclusions above do not require abridging
their engineering narrative. Referenced databases, source business materials,
credentials and recovery archives are not included. Historical instructions
are not authorization to perform operations today.

The historical RAG methodology and aggregate observations are retained. UI sample
questions are newly authored examples, not the historical evaluation set.

## Local inputs

- Source import: `python scripts/import_sales_sources.py manifest.json --library PATH`.
  The manifest is a local JSON array with `path`, `purpose`, optional `note` and
  `parent` (an existing source ID). Keep manifests and source documents outside Git.
- Retrieval audit: `python tests/rag_retrieval_audit.py --source DOCUMENT.md --cases CASES.json`.
  Cases require `question`, `expected`, and `kind`. Output may contain private text;
  use `--output` only with a local destination outside Git.
- Legacy deployment scripts require `GESTUREOPS_DEPLOY_INSTANCE`,
  `GESTUREOPS_DEPLOY_DIRECTORY`, and, where a fixed baseline is used,
  `GESTUREOPS_DEPLOY_BASE_IMAGE`. They still depend on the business source tree,
  cloud CLI configuration and explicit deployment authorization. They are not
  standalone deployment packages. This cleanup did not run them remotely.
- GEO artifact observation uses `GESTUREOPS_GEO_ASSETS` for its local artifact path.

Continue development in the original workspace. Review future exports before
pushing; do not blindly recopy private import scripts or runtime data. Never push
the local pre-cleanup backup refs or bundle to this repository.
