"""Offline retrieval audit with an explicitly supplied local document and cases."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--cases', type=Path, required=True)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('bridge', root/'workbench-prototype-v3/scripts/knowledge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
source = args.source
raw = source.read_bytes()
cases = json.loads(args.cases.read_text(encoding='utf-8'))
if not isinstance(cases, list) or not cases:
    raise ValueError('Cases must be a non-empty JSON list')
for case in cases:
    if not all(isinstance(case.get(key), str) and case[key].strip()
               for key in ('question', 'expected', 'kind')):
        raise ValueError('Each case requires question, expected and kind strings')
results = []
with tempfile.TemporaryDirectory(prefix='rag-qa-audit-') as folder:
    with bridge.KnowledgeStore(folder) as store:
        doc = store.ingest(source.name, raw)
        doc = store.review(doc['id'], doc['blocks'], dict(entity='',year=None,confirmed=True), 1)
        store.publish(doc['id'], 0, expected_revision=doc['revision'])
        for case in cases:
            found = store.search(case['question'])
            selected, budget = bridge.answer_context(found['matches'])
            results.append(dict(question=case['question'],kind=case['kind'],
                                before_hit=any(case['expected'] in m['text'] for m in found['matches']),
                                after_hit=any(case['expected'] in m['text'] for m in selected),
                                before_count=len(found['matches']),after_count=len(selected),
                                source_blocks=[m['source'] for m in selected], budget=budget))
report = dict(scope='One archived training document; FTS-only fallback; no model calls; before/after answer budget only',
              source=source.name, source_sha256=hashlib.sha256(raw).hexdigest(),
              cases=results, before_hits=sum(r['before_hit'] for r in results),
              after_hits=sum(r['after_hit'] for r in results))
if args.output:
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
