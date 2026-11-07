"""Record installed dependency metadata and supplied notices without GPU access."""
import argparse
import hashlib
import json
from importlib.metadata import distribution
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def collect(requirements):
    packages = []
    notices = []
    for line in requirements.read_text().splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        name, version = line.split('==')
        installed = distribution(name)
        if installed.version != version:
            raise ValueError(f'{name}: expected {version}, found {installed.version}')
        files = []
        for relative in sorted(installed.files or [], key=str):
            if not relative.name.upper().startswith(('LICENSE', 'LICENCE', 'COPYING', 'NOTICE')):
                continue
            data = installed.locate_file(relative).read_bytes()
            files.append({'path': str(relative), 'bytes': len(data), 'sha256': digest(data)})
            notices.append(f'===== {name} {version}: {relative} =====\n' + data.decode('utf-8') + '\n')
        metadata = installed.read_text('METADATA')
        if metadata is None:
            raise ValueError(f'{name}: missing installed metadata')
        packages.append({
            'name': name, 'version': version,
            'metadataSha256': digest(metadata.encode()),
            'licenseExpression': installed.metadata.get('License-Expression'),
            'licenseLabel': installed.metadata.get('License'),
            'declaredLicenseFiles': installed.metadata.get_all('License-File') or [],
            'suppliedNotices': files,
        })
    bundle = '\n'.join(notices).encode()
    return {
        'requirementsSha256': digest(requirements.read_bytes()),
        'packages': packages,
        'missingSuppliedNotices': [p['name'] for p in packages if not p['suppliedNotices']],
        'noticesSha256': digest(bundle),
        'scope': 'Installed package evidence only; not a license compatibility or redistribution decision.',
    }, bundle


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('requirements', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    inventory, bundle = collect(args.requirements)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + '\n')
    (args.output / 'SUPPLIED_NOTICES.txt').write_bytes(bundle)
    print(json.dumps({'packages': len(inventory['packages']), 'missing': inventory['missingSuppliedNotices']}))
