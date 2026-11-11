import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

spec=importlib.util.spec_from_file_location('knowledge_bridge',Path(__file__).parents[1]/'scripts/knowledge.py')
bridge=importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


def test_business_compare_uses_shared_input_and_production_contract(monkeypatch):
    calls=[]
    monkeypatch.setattr(bridge,'query_result',lambda *args:{'matches':[],'version':1})
    def complete(settings,messages,**kwargs):
        calls.append(messages)
        return '{"draft":"请稍等，我来核实。","scene":"polish"}'
    monkeypatch.setattr(bridge,'chat_completion',complete)
    result=bridge.compare_business(None,{'kind':'polish','query':'等等','systemPrompt':'original','candidatePrompt':'candidate'},SimpleNamespace(llm_api_key='test',llm_model='fake'))
    assert len(calls)==2
    assert calls[0][1]==calls[1][1]
    assert json.loads(calls[0][1]['content'])['original_text']=='等等'
    assert result['baseline']['businessOutput']['scene']=='polish'
    monkeypatch.setattr(bridge,'chat_completion',lambda *a,**k:'{"answer":"wrong contract"}')
    failed=bridge.compare_business(None,{'kind':'reply','query':'hi','systemPrompt':'a','candidatePrompt':'b'},SimpleNamespace(llm_api_key='test'))
    assert 'generationError' in failed['baseline']


def test_prompt_versions_persist_and_conflict(tmp_path):
    library=bridge.PromptLibrary(tmp_path)
    assert library.snapshot()['version']==1
    saved=library.save('New prompt',1)
    assert saved['version']==2
    with pytest.raises(ValueError,match='prompt_conflict'):
        library.save('Stale write',1)
    with pytest.raises(ValueError,match='prompt_invalid'):
        library.save(' ',2)
    library.close()
    library=bridge.PromptLibrary(tmp_path)
    assert [p['text'] for p in library.snapshot()['versions']]==['New prompt',bridge.DEFAULT_PROMPT]
    library.close()


def test_prompt_comparison_reuses_retrieval_and_keeps_input_snapshot(monkeypatch):
    calls=[]
    searches=[]
    class Store:
        def search(self,*args,**kwargs):
            searches.append(args)
            return {'version':3,'matches':[{'id':'a','text':'Evidence','title':'Source'}]}
    def completion(settings,messages,**kwargs):
        calls.append(messages)
        return json.dumps({'answer':'ok','citations':['a']})
    monkeypatch.setattr(bridge,'chat_completion',completion)
    result=bridge.compare_answers(Store(),{'query':'q','comparisonMode':'prompt','systemPrompt':'Original','candidatePrompt':'Candidate'},SimpleNamespace(llm_api_key='fake',llm_model='test'))
    assert len(searches)==1
    assert len(calls)==2
    assert calls[0][1]==calls[1][1]
    assert {c[0]['content'].split('\n')[0] for c in calls}=={'Original','Candidate'}
    assert result['promptSnapshot']=={'baseline':'Original','candidate':'Candidate'}
    assert result['baseline']['matches']==result['augmented']['matches']


def test_knowledge_uses_official_deepseek_without_mutating_shared_settings(monkeypatch):
    original=SimpleNamespace(llm_api_key='old',llm_model='kimi',llm_base_url='old-url')
    monkeypatch.delenv('KNOWLEDGE_OFFLINE',raising=False)
    monkeypatch.setattr(bridge,'load_settings',lambda:original)
    monkeypatch.setenv('AFTB_LLM_MODEL','deepseek-ai/DeepSeek-V4-Flash')
    monkeypatch.setenv('AFTB_LLM_BASE_URL','https://api.siliconflow.cn/v1/')
    monkeypatch.setenv('AFTB_LLM_API_KEY','test-only')
    monkeypatch.setenv('DEEPSEEK_API_KEY','official-test-only')
    current=bridge.knowledge_settings()
    assert current.llm_model=='deepseek-flash'
    assert current.llm_base_url=='https://api.deepseek.com'
    assert current.llm_api_key=='official-test-only'
    assert original.llm_model=='kimi'
    monkeypatch.delenv('DEEPSEEK_API_KEY')
    assert bridge.knowledge_settings().llm_api_key==''


def test_answer_summary_is_optional_user_facing_output():
    result=bridge.answer_from_matches(None,'q',[],lambda *a,**kw:json.dumps({'answer':'answer','answerSummary':'brief basis','citations':[]}),use_knowledge=False)
    assert result['answerSummary']=='brief basis'


def test_answer_rejects_unknown_sources():
    matches=[dict(id='a',text='sample',title='source')]
    for output in [{'answer':'claim','citations':['other']},{'answer':'claim','citations':[]}]:
        with pytest.raises(ValueError):
            bridge.answer_from_matches(None,'q',matches,lambda *a,**kw:json.dumps(output))
    assert bridge.answer_from_matches(None,'q',matches,lambda *a,**kw:'{"answer":"supported","citations":["a"]}')['citations']==['a']


def test_organization_requires_complete_provenance():
    doc={'revision':1,'blocks':[{'id':'a','text':'one'},{'id':'b','text':'two'}]}
    for ids in [['a'],['a','unknown']]:
        with pytest.raises(ValueError):
            bridge.organize_document(doc,1,None,lambda *a,**kw:json.dumps({'suggestions':[{'text':'combined','sourceBlockIds':ids}]}))
    proposal=bridge.organize_document(doc,1,None,lambda *a,**kw:'{"suggestions":[{"text":"combined","sourceBlockIds":["a","b"]}]}')
    assert proposal['revision']==1
    assert doc['blocks'][0]['text']=='one'


def test_query_failure_fallback_and_year(tmp_path,monkeypatch):
    store=bridge.KnowledgeStore(tmp_path)
    doc=store.ingest('test.txt',b'apple information')
    bridge.dispatch(store,'review',{'id':doc['id'],'blocks':['apple information'],'scope':{'entity':'','year':'2026','confirmed':True},'revision':1},SimpleNamespace(llm_api_key=''))
    store.publish(doc['id'],0)
    def unavailable(*a,**kw):raise RuntimeError('secret-provider-body')
    monkeypatch.setattr(bridge,'chat_completion',unavailable)
    result=bridge.dispatch(store,'query',{'query':'apple','year':'2026','generate':False},SimpleNamespace(llm_api_key='present'))
    assert len(result['matches'])==1
    assert 'retrievalWarning' in result
    assert 'secret-provider-body' not in json.dumps(result)
    assert bridge.dispatch(store,'query',{'query':'apple','year':''},SimpleNamespace(llm_api_key=''))['matches']==[]
    store.close()


def test_answer_budget_keeps_whole_blocks():
    matches=[dict(id=str(i),text='a'*4000) for i in range(10)]
    selected, budget=bridge.answer_context(matches)
    assert len(selected)==4
    assert budget['omitted']==6
    assert selected==matches[:4]
    assert len(json.dumps(selected,ensure_ascii=False))<=bridge.ANSWER_SOURCE_CHARS


@pytest.mark.parametrize('failure', ['none','baseline','augmented'])
def test_compare_isolation_partial_failure_and_scope(tmp_path,monkeypatch,failure):
    store=bridge.KnowledgeStore(tmp_path)
    doc=store.ingest('test.txt',b'apple PRIVATE_SOURCE')
    doc=store.review(doc['id'],doc['blocks'],dict(entity='school',year=2026,confirmed=True),1)
    store.publish(doc['id'],0)
    calls=[]
    def complete(settings,messages,**kwargs):
        data=json.loads(messages[1]['content'])
        calls.append(data)
        if 'candidates' in data:
            return json.dumps({'ids':[data['candidates'][0]['id']]})
        kind='augmented' if data['sources'] else 'baseline'
        if kind==failure:raise RuntimeError('SECRET_HTTP_BODY')
        assert data['scope']==dict(entity='school',year=2026)
        return json.dumps({'answer':kind,'citations':[data['sources'][0]['id']] if data['sources'] else []})
    monkeypatch.setattr(bridge,'chat_completion',complete)
    result=bridge.dispatch(store,'query',dict(query='apple?',entity='school',year='2026',compare=True),SimpleNamespace(llm_api_key='key',llm_model='test-model'))
    assert result['model']=='test-model'
    assert result['question']=='apple?'
    assert result['augmented']['version']==1
    assert len(calls)==3
    baseline=next(c for c in calls if c.get('sources')==[])
    assert 'PRIVATE_SOURCE' not in json.dumps(baseline)
    for kind in ['baseline','augmented']:
        assert ('generationError' in result[kind])==(kind==failure)
        if kind!=failure: assert result[kind]['answer']==kind
    assert 'SECRET_HTTP_BODY' not in json.dumps(result)
    store.close()


def test_compare_no_model_or_no_sources(tmp_path,monkeypatch):
    with bridge.KnowledgeStore(tmp_path) as store:
        result=bridge.dispatch(store,'query',dict(query='question',compare=True),SimpleNamespace(llm_api_key=''))
        assert result['baseline']['generationError']
        assert result['augmented']['generationError']
        calls=[]
        def complete(*args,**kwargs):
            calls.append(args)
            return '{"answer":"no library","citations":[]}'
        monkeypatch.setattr(bridge,'chat_completion',complete)
        result=bridge.dispatch(store,'query',dict(query='question',compare=True),SimpleNamespace(llm_api_key='key'))
        assert len(calls)==1
        assert result['baseline']['answer']=='no library'
        assert result['augmented']['matches']==[]
        assert result['augmented']['generationError']
