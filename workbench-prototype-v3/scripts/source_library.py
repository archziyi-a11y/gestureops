"""Content-addressed original files, explicit purpose and knowledge lineage."""
import base64
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

PURPOSES=['业务规则原件','知识原料','提示词参考','内部参考','实现与历史记录']
EXTENSIONS={'.txt','.md','.docx','.json','.py','.pdf','.xlsx','.csv'}

class SourceLibrary:
    def __init__(self, folder):
        self.folder=Path(folder); self.folder.mkdir(parents=True,exist_ok=True)
        self.db=sqlite3.connect(self.folder/'sources.sqlite3',timeout=20)
        self.db.row_factory=sqlite3.Row
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, filename TEXT, purpose TEXT, created TEXT, size INTEGER, revision INTEGER DEFAULT 1, note TEXT DEFAULT '', parent TEXT);
        CREATE TABLE IF NOT EXISTS origins(id TEXT, location TEXT, UNIQUE(id,location));
        CREATE TABLE IF NOT EXISTS links(id TEXT, document TEXT, UNIQUE(id,document));
        CREATE TABLE IF NOT EXISTS events(id TEXT, at TEXT, detail TEXT);
        ''')
    def get(self,id):
        row=self.db.execute('SELECT * FROM sources WHERE id=?',(id,)).fetchone()
        if not row: raise ValueError('源文件不存在')
        return dict(row)
    def snapshot(self,knowledge):
        docs={d['id']:d for d in knowledge.snapshot()['documents']}
        rows=[]
        for source in self.db.execute('SELECT * FROM sources ORDER BY created DESC,id'):
            row=dict(source)
            row['origins']=[r[0] for r in self.db.execute('SELECT location FROM origins WHERE id=?',(row['id'],))]
            row['uses']=[{'id':r[0],'state':docs.get(r[0],{}).get('state','unknown')} for r in self.db.execute('SELECT document FROM links WHERE id=?',(row['id'],))]
            row['status']='已送整理' if row['uses'] else '待整理' if row['purpose'] in PURPOSES[:2] else '仅归档'
            rows.append(row)
        return {'sources':rows,'purposes':PURPOSES,'total':len(rows),'pending':sum(r['status']=='待整理' for r in rows),'updatedAt':self.db.execute('SELECT MAX(at) FROM events').fetchone()[0]}
    def add(self, filename, content, purpose, origin='页面上传', parent=None, note=''):
        if not isinstance(filename,str) or Path(filename).name!=filename or any(c in filename for c in '/\\:\x00') or Path(filename).suffix.lower() not in EXTENSIONS: raise ValueError('不支持的源文件名称或格式')
        if purpose not in PURPOSES or not content or len(content)>8*1024*1024: raise ValueError('请选择用途，文件须为 1 字节至 8 MB')
        if parent: self.get(parent)
        id=hashlib.sha256(content).hexdigest()
        if parent==id: raise ValueError('不能关联自身')
        path=self.folder/'originals'/id/filename
        existing=self.db.execute('SELECT id FROM sources WHERE id=?',(id,)).fetchone()
        if not existing:
            path.parent.mkdir(parents=True,exist_ok=True)
            if path.exists():
                if hashlib.sha256(path.read_bytes()).hexdigest()!=id: raise ValueError('原件哈希不一致')
            else:
                with path.open('xb') as file: file.write(content)
        now=datetime.now(timezone.utc).isoformat()
        with self.db:
            self.db.execute('INSERT OR IGNORE INTO sources(id,filename,purpose,created,size,parent,note) VALUES(?,?,?,?,?,?,?)',(id,filename,purpose,now,len(content),parent,note))
            self.db.execute('INSERT OR IGNORE INTO origins VALUES(?,?)',(id,origin))
            self.db.execute('INSERT INTO events VALUES(?,?,?)',(id,now,'重复来源登记' if existing else '原件归档'))
        return {'id':id,'duplicate':bool(existing)}
    def read(self,id):
        row=self.get(id)
        data=(self.folder/'originals'/id/row['filename']).read_bytes()
        if hashlib.sha256(data).hexdigest()!=id: raise ValueError('原件哈希不一致')
        return row,data
    def update(self,body):
        row=self.get(body['id'])
        if body.get('purpose') not in PURPOSES or not isinstance(body.get('note',''),str) or len(body.get('note',''))>2000: raise ValueError('用途或备注无效')
        with self.db:
            result=self.db.execute('UPDATE sources SET purpose=?,note=?,revision=revision+1 WHERE id=? AND revision=?',(body['purpose'],body.get('note',''),row['id'],body.get('revision')))
            if result.rowcount!=1: raise ValueError('源文件信息已变化，请刷新')
            self.db.execute('INSERT INTO events VALUES(?,?,?)',(row['id'],datetime.now(timezone.utc).isoformat(),'用途/备注更新：'+body['purpose']))
    def prepare(self,id,knowledge):
        row,data=self.read(id)
        if row['purpose'] not in PURPOSES[:2]: raise ValueError('该用途仅供归档；若确需入库，请先审阅并修改用途')
        if Path(row['filename']).suffix.lower() not in {'.txt','.md','.docx'}: raise ValueError('整理入口目前支持 TXT、MD、DOCX；原件仍完整保留')
        link=self.db.execute('SELECT document FROM links WHERE id=?',(id,)).fetchone()
        if link: return {'documentId':link[0],'existing':True}
        doc=knowledge.ingest(row['filename'],data)
        with self.db:
            self.db.execute('INSERT OR IGNORE INTO links VALUES(?,?)',(id,doc['id']))
            self.db.execute('INSERT INTO events VALUES(?,?,?)',(id,datetime.now(timezone.utc).isoformat(),'送去整理：'+doc['id']))
        return {'documentId':doc['id'],'existing':False}
    def close(self): self.db.close()

def dispatch(folder,action,body,knowledge):
    library=SourceLibrary(folder/'source-library')
    try:
        if action=='source-upload':
            encoded=body.get('base64','')
            if not isinstance(encoded,str) or len(encoded)>12*1024*1024: raise ValueError('文件过大')
            return library.add(body.get('filename'),base64.b64decode(encoded,validate=True),body.get('purpose'),parent=body.get('parent'))
        if action=='source-update': library.update(body)
        if action=='source-prepare': return library.prepare(body['id'],knowledge)
        if action in ('source-download','source-detail'):
            row,data=library.read(body['id'])
            if action=='source-download': return {'filename':row['filename'],'base64':base64.b64encode(data).decode()}
            text=None
            if Path(row['filename']).suffix.lower() in {'.txt','.md','.json','.py','.csv'}: text=data[:100000].decode('utf-8',errors='replace')
            return {'text':text,'truncated':len(data)>100000,'events':[dict(r) for r in library.db.execute('SELECT at,detail FROM events WHERE id=? ORDER BY at DESC',(row['id'],))]}
        return library.snapshot(knowledge)
    finally: library.close()
