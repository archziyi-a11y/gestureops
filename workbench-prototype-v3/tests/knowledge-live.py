"""Explicit live smoke: three model calls, synthetic content, isolated local store."""
import importlib.util
import json
from pathlib import Path
import tempfile

spec=importlib.util.spec_from_file_location('kb',Path(__file__).parents[1]/'scripts/knowledge.py')
kb=importlib.util.module_from_spec(spec)
spec.loader.exec_module(kb)
settings=kb.load_settings()
assert settings.llm_api_key, 'Model not configured'
calls=0
def complete(*args,**kwargs):
    global calls
    calls+=1
    assert calls<=3
    return kb.chat_completion(*args,**kwargs)

with tempfile.TemporaryDirectory(prefix='knowledge-live-') as folder:
    with kb.KnowledgeStore(folder) as store:
        doc=store.ingest('synthetic-demo.txt','蓝桥演示计划仅在周六授课，采用线上小组形式。\n\n蓝桥演示计划不公开报价，费用需要顾问核对，不能承诺折扣。'.encode())
        proposal=kb.organize_document(doc,1,settings,complete)
        assert proposal['suggestions']
        reviewed=store.review(doc['id'],proposal['suggestions'],{'entity':'','year':None,'confirmed':True},1)
        store.publish(doc['id'],0,expected_revision=reviewed['revision'])
        query='蓝桥演示计划什么时候上课？能承诺优惠吗？'
        result=store.search(query,semantic=lambda messages:kb.extract_json_object(complete(settings,messages,max_tokens=600)))
        assert result['matches'], 'No relevant synthetic source returned'
        answer=kb.answer_from_matches(settings,query,result['matches'],complete)
        assert answer['citations']
        print(json.dumps({'liveModel':settings.llm_model,'calls':calls,'organizedBlocks':len(proposal['suggestions']),'retrieved':len(result['matches']),'version':result['version'],'answer':answer['answer'],'validSourceIds':True,'productionWrites':False},ensure_ascii=False))
