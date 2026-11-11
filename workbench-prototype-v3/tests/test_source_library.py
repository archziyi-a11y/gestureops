import sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
sys.path.insert(0,str(Path(__file__).parents[2]/'project/modules/marketing-chat-insight/src'))
from source_library import SourceLibrary
from mktci.sales_knowledge_store import KnowledgeStore

def test_original_dedup_lineage_and_no_publish(tmp_path):
    library=SourceLibrary(tmp_path/'sources'); knowledge=KnowledgeStore(tmp_path/'knowledge')
    try:
        raw='知识原文'.encode()
        first=library.add('a.md',raw,'知识原料','origin-one')
        duplicate=library.add('copy.md',raw,'内部参考','origin-two')
        assert duplicate['duplicate'] and first['id']==duplicate['id']
        new=library.add('a.md',b'new','知识原料',parent=first['id'])
        state=library.snapshot(knowledge)
        assert state['total']==2 and state['pending']==2
        row=next(s for s in state['sources'] if s['id']==first['id'])
        assert len(row['origins'])==2 and row['purpose']=='知识原料'
        assert library.get(new['id'])['parent']==first['id']
        assert library.read(first['id'])[1]==raw
        result=library.prepare(first['id'],knowledge)
        assert library.prepare(first['id'],knowledge)['documentId']==result['documentId']
        assert knowledge.snapshot()['documents'][0]['state']=='draft'
        assert knowledge.snapshot()['version']==0
        assert library.snapshot(knowledge)['pending']==1
    finally: library.close(); knowledge.close()

def test_scope_conflict_integrity_and_paths(tmp_path):
    library=SourceLibrary(tmp_path/'sources'); knowledge=KnowledgeStore(tmp_path/'knowledge')
    try:
        with pytest.raises(ValueError): library.add('../evil.md',b'a','知识原料')
        row=library.add('internal.md',b'private','内部参考')
        with pytest.raises(ValueError,match='仅供归档'): library.prepare(row['id'],knowledge)
        library.update({'id':row['id'],'purpose':'知识原料','revision':1,'note':'reviewed'})
        with pytest.raises(ValueError,match='已变化'): library.update({'id':row['id'],'purpose':'内部参考','revision':1})
        path=tmp_path/'sources'/'originals'/row['id']/'internal.md'
        path.write_bytes(b'tampered')
        with pytest.raises(ValueError,match='哈希'): library.read(row['id'])
        assert knowledge.snapshot()['documents']==[]
    finally: library.close(); knowledge.close()
