# Preservation Supplements

## Round 1: workbench documentation

This supplement extends the 104-document experience archive. Historical results describe their original evaluation, not current production health.

| Document | Preservation | Value |
| --- | --- | --- |
| [Operations](../workbench-prototype-v3/docs/OPERATIONS.md) | Original text restored | Retains the original local deployment context. |
| [GEO maintenance](../workbench-prototype-v3/docs/maintenance/GEO.md) | Original text restored | Retains the original maintenance path. |
| [Source library](../workbench-prototype-v3/docs/SOURCE-LIBRARY.md) | Historical inventory restored; current export API note retained | Explains source tracing, duplicate verification, and why archived material is not automatically published knowledge. Source documents themselves are not included. |
| [RAG audit](../workbench-prototype-v3/docs/RAG-AUDIT-20261109.md) | Methods and per-question results restored | Preserves retrieval evaluation and its limits. Eight internal-training question texts remain replaced by identifiers; two synthetic questions remain intact. |
| [RAG result data](../workbench-prototype-v3/docs/RAG-RETRIEVAL-AUDIT-20261109.json) | Missing result file added with the same eight question-text replacements | Preserves the machine-readable evaluation results without distributing the underlying internal-training question text. |

No operational source files, local knowledge originals, or runtime databases were changed. Question-text redaction limits exact reproduction of those eight inputs; it does not remove their recorded results or evaluation method.
