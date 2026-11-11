"""Restore an existing source archive into an empty library, preserving history."""
import argparse
import hashlib
import json
import shutil
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

TABLES = ('sources', 'origins', 'links', 'events')


def reconnect(source, target):
    source, target = Path(source).resolve(), Path(target).resolve()
    if source == target:
        raise ValueError('Source and target must differ')
    dbfile = target / 'sources.sqlite3'
    if not dbfile.is_file():
        raise ValueError('Target database must already exist')
    with closing(sqlite3.connect((source / 'sources.sqlite3').as_uri() + '?mode=ro', uri=True)) as original:
        rows = original.execute('SELECT id, filename, size FROM sources').fetchall()
        if not rows:
            raise ValueError('Source library is empty')
        if original.execute('SELECT count(*) FROM links').fetchone()[0]:
            raise ValueError('Linked knowledge documents require a separate migration')
        for digest, name, size in rows:
            path = source / 'originals' / digest / name
            if path.resolve().is_relative_to(source / 'originals') is False:
                raise ValueError('Invalid original path')
            if path.stat().st_size != size or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                raise ValueError('Source original integrity failed')
        snapshot = {t: original.execute('SELECT * FROM ' + t).fetchall() for t in TABLES}
    with closing(sqlite3.connect(dbfile, timeout=20)) as db, db:
        backup = target / ('sources.before-reconnect-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.sqlite3')
        with closing(sqlite3.connect(backup)) as copy:
            db.backup(copy)
        db.execute('BEGIN IMMEDIATE')
        existing = {t: db.execute('SELECT * FROM ' + t).fetchall() for t in TABLES}
        same = all(sorted(existing[t]) == sorted(snapshot[t]) for t in TABLES)
        if not same and any(existing.values()):
            raise ValueError('Target is not empty; no records overwritten')
        for digest, name, _ in rows:
            dest = target / 'originals' / digest / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists():
                if hashlib.sha256(dest.read_bytes()).hexdigest() != digest:
                    raise ValueError('Existing target original differs')
            else:
                with (source / 'originals' / digest / name).open('rb') as reader, dest.open('xb') as writer:
                    shutil.copyfileobj(reader, writer)
            if hashlib.sha256(dest.read_bytes()).hexdigest() != digest:
                raise ValueError('Copied original integrity failed')
        receipt = source / 'IMPORT-RECEIPT.json'
        if receipt.exists():
            dest = target / receipt.name
            if dest.exists() and dest.read_bytes() != receipt.read_bytes():
                raise ValueError('Target import receipt differs')
            if not dest.exists():
                with dest.open('xb') as writer:
                    writer.write(receipt.read_bytes())
        if not same:
            for table, records in snapshot.items():
                if records:
                    db.executemany('INSERT INTO ' + table + ' VALUES(' + ','.join('?' for _ in records[0]) + ')', records)
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Database integrity failed')
        db.commit()
    return {'sources': len(rows), 'hashMismatch': 0, 'alreadyPresent': same, 'backup': str(backup)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('target')
    args = parser.parse_args()
    print(json.dumps(reconnect(args.source, args.target), ensure_ascii=False))
