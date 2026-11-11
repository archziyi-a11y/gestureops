"""Import explicitly listed local materials; never discover private folders."""
import argparse
import json
from pathlib import Path

from source_library import SourceLibrary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--library', type=Path, required=True)
    args = parser.parse_args()
    entries = json.loads(args.manifest.read_text(encoding='utf-8'))
    if not isinstance(entries, list):
        raise ValueError('Manifest must be a JSON list')
    prepared = []
    for entry in entries:
        path = Path(entry['path'])
        if not path.is_absolute():
            path = args.manifest.resolve().parent / path
        if not path.is_file():
            raise FileNotFoundError(path)
        prepared.append((path, entry))
    library = SourceLibrary(args.library)
    receipt = []
    try:
        for path, entry in prepared:
            row = library.add(path.name, path.read_bytes(), entry['purpose'],
                              str(path), entry.get('parent'), entry.get('note', ''))
            receipt.append({'file': path.name, 'sha256': row['id'],
                            'status': 'duplicate' if row['duplicate'] else 'archived'})
        (library.folder / 'IMPORT-RECEIPT.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'processed': len(receipt), 'items': receipt}, ensure_ascii=False))
    finally:
        library.close()


if __name__ == '__main__':
    main()
