import sys
from pathlib import Path
import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import business_prompts as bridge
from mktci.sales_prompt_library import BusinessPrompts


def test_bridge_deletes_both_libraries_and_retries(tmp_path,monkeypatch):
    local=BusinessPrompts(tmp_path/'business-prompts')
    row=local.save('reply','candidate')['versions'][0]
    remote=BusinessPrompts(tmp_path/'remote')
    remote.import_version('reply',row)
    def call(kind,payload):
        return {'state':remote.delete(kind,payload['target_id'],payload['expected_revision']),'loaded':remote.resolve(kind)}
    monkeypatch.setattr(bridge,'remote',call)
    body={'kind':'reply','versionId':row['id'],'revision':0}
    result=bridge.dispatch(tmp_path,'business-delete',body)
    assert result['local']['versions']==result['remote']['state']['versions']==[]
    assert bridge.dispatch(tmp_path,'business-delete',body)['local']['versions']==[]
    local.close();remote.close()


def test_remote_failure_keeps_local_version(tmp_path,monkeypatch):
    local=BusinessPrompts(tmp_path/'business-prompts')
    row=local.save('reply','candidate')['versions'][0]
    def failed(*args): raise ValueError('unavailable')
    monkeypatch.setattr(bridge,'remote',failed)
    with pytest.raises(ValueError):
        bridge.dispatch(tmp_path,'business-delete',{'kind':'reply','versionId':row['id'],'revision':0})
    assert local.snapshot('reply')['versions'][0]['id']==row['id']
    local.close()
