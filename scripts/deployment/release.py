#!/usr/bin/env python3
"""Build-once candidate packaging and explicit GitHub production promotion."""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

REPOS = {'frontend': 'Nawah-Project/cms-front', 'api': 'Nawah-Project/cms-back'}
TAG = re.compile(r'build-([0-9a-f]{40})-([0-9]+)-([0-9]+)\Z')

def now(): return datetime.now(timezone.utc).isoformat()
def digest(path):
    with open(path, 'rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()
def write(path, value): path.write_text(json.dumps(value, indent=2) + '\n')

def api(repo, path, method='GET', data=None, binary=False):
    token = os.environ['GH_TOKEN']
    url = f'https://api.github.com/repos/{repo}{path}'
    headers = {'Authorization': f'Bearer {token}', 'User-Agent': 'nawah-release',
               'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
    if data is not None: headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, headers=headers, method=method,
        data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            body = response.read()
            return body if binary else json.loads(body or b'{}')
    except urllib.error.HTTPError as e:
        if e.code == 404 and method == 'GET': return None
        raise RuntimeError(f'GitHub API {method} failed ({e.code}); credentials omitted') from None

def upload(repo, release_id, path):
    url = f'https://uploads.github.com/repos/{repo}/releases/{release_id}/assets?name={urllib.parse.quote(path.name)}'
    req = urllib.request.Request(url, data=path.read_bytes(), method='POST', headers={
        'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'User-Agent': 'nawah-release',
        'Content-Type': 'application/octet-stream'})
    try:
        with urllib.request.urlopen(req, timeout=600) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'GitHub asset upload failed ({e.code}); credentials omitted') from None

def asset_json(repo, release, name):
    assets = [a for a in release['assets'] if a['name'] == name]
    if len(assets) != 1: raise ValueError(f'Expected exactly one {name}')
    # Public immutable release URLs do not need a server-side GitHub credential.
    url = assets[0]['browser_download_url']
    with urllib.request.urlopen(url, timeout=60) as r: return json.load(r)

def prepare(args):
    repo, sha = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA']
    assert repo == REPOS[args.component] and re.fullmatch('[0-9a-f]{40}', sha)
    assert os.environ['GITHUB_REF'] == 'refs/heads/main'
    run, attempt = os.environ['GITHUB_RUN_ID'], os.environ.get('GITHUB_RUN_ATTEMPT', '1')
    tag = f'build-{sha}-{run}-{attempt}'
    assert TAG.fullmatch(tag)
    image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', args.image]))[0]
    assert image['Architecture'] == 'amd64' and image['Os'] == 'linux'
    assert image['Config']['Labels']['org.opencontainers.image.revision'] == sha
    out = Path(args.directory); out.mkdir(parents=True, exist_ok=True)
    archive = out / 'image.tar.gz'
    process = subprocess.Popen(['docker', 'image', 'save', args.image], stdout=subprocess.PIPE)
    with archive.open('wb') as f, gzip.GzipFile(fileobj=f, mode='wb', compresslevel=6, mtime=0) as zipped:
        while chunk := process.stdout.read(1024 * 1024): zipped.write(chunk)
    if process.wait(): raise RuntimeError('docker save failed')
    migrations = {p.parent.name: digest(p) for p in sorted(Path('prisma/migrations').glob('*/migration.sql'))} if args.component == 'api' else {}
    manifest = {'schema': 1, 'repository': repo, 'component': args.component, 'commit': sha,
        'tag': tag, 'runId': int(run), 'runAttempt': int(attempt), 'createdAt': now(),
        'imageRef': args.image, 'imageId': image['Id'], 'architecture': 'amd64',
        'imageSize': image['Size'], 'archiveBytes': archive.stat().st_size,
        'archiveSha256': digest(archive), 'migrations': migrations}
    write(out / 'release.json', manifest)
    (out / 'SHA256SUMS').write_text(''.join(f'{digest(out/name)}  {name}\n' for name in ['image.tar.gz', 'release.json']))
    with open(os.environ.get('GITHUB_OUTPUT', os.devnull), 'a') as f: f.write(f'tag={tag}\n')
    print(f"Candidate prepared: {tag}; compressed bytes={manifest['archiveBytes']}")

def publish(args):
    out = Path(args.directory); m = json.loads((out / 'release.json').read_text())
    repo = os.environ['GITHUB_REPOSITORY']; assert repo == REPOS[m['component']]
    assert m['runId'] == int(os.environ['GITHUB_RUN_ID']) and m['commit'] == os.environ['GITHUB_SHA']
    assert digest(out/'image.tar.gz') == m['archiveSha256']
    if api(repo, '/releases/tags/' + m['tag']): raise ValueError('Candidate already exists; refusing to overwrite')
    release = api(repo, '/releases', 'POST', {'tag_name': m['tag'], 'target_commitish': m['commit'],
        'name': f"Candidate {m['component']} {m['commit'][:12]}", 'draft': True, 'prerelease': True,
        'body': 'Built and tested on GitHub. Not approved for production.\n\nUse the Approve production workflow with this tag.\n\n' + m['tag']})
    for name in ['image.tar.gz', 'release.json', 'SHA256SUMS']: upload(repo, release['id'], out/name)
    api(repo, f"/releases/{release['id']}", 'PATCH', {'draft': False, 'prerelease': True, 'make_latest': 'false'})
    with open(os.environ.get('GITHUB_STEP_SUMMARY', os.devnull), 'a') as f:
        f.write(f"## Candidate ready\n\n`{m['tag']}`\n\nCompressed download: {m['archiveBytes']/1048576:.1f} MiB.\n\nApprove this existing candidate with **Approve production**; no rebuild.\n")
    try:
        artifacts = api(repo, f"/actions/runs/{m['runId']}/artifacts")
        for a in artifacts.get('artifacts', []):
            if a['name'] == f"candidate-{m['commit']}": api(repo, f"/actions/artifacts/{a['id']}", 'DELETE')
    except RuntimeError:
        print('Temporary artifact cleanup deferred to one-day retention.')

def approve(args):
    if not TAG.fullmatch(args.tag): raise ValueError('Invalid candidate tag')
    repo = os.environ['GITHUB_REPOSITORY']; assert repo in REPOS.values()
    release = api(repo, '/releases/tags/' + args.tag)
    if not release or release['draft']: raise ValueError('Published candidate not found')
    m = asset_json(repo, release, 'release.json')
    assert m['repository'] == repo and m['tag'] == args.tag and m['schema'] == 1
    assert TAG.fullmatch(args.tag)[1] == m['commit'] and int(TAG.fullmatch(args.tag)[2]) == m['runId']
    run = api(repo, f"/actions/runs/{m['runId']}/attempts/{m['runAttempt']}")
    assert run['head_sha'] == m['commit'] and run['head_branch'] == 'main'
    assert run['event'] == 'push' and run['path'] == '.github/workflows/ci_cd.yaml'
    assert run['status'] == 'completed' and run['conclusion'] == 'success', 'Candidate build must have passed'
    previous = api(repo, '/releases/latest')
    old_migrations = asset_json(repo, previous, 'release.json')['migrations'] if previous and previous['id'] != release['id'] else {}
    changed = m['component'] == 'api' and m['migrations'] != old_migrations
    if changed and not args.compatible_migrations:
        raise ValueError('Confirm backward-compatible database migrations before approving this API candidate')
    if not release['prerelease']:
        existing = asset_json(repo, release, 'approval.json')
        assert existing['commit'] == m['commit']
    else:
        approval = {'schema': 1, 'repository': repo, 'tag': args.tag, 'commit': m['commit'],
            'archiveSha256': m['archiveSha256'], 'compatibleMigrations': bool(args.compatible_migrations),
            'actor': os.environ['GITHUB_ACTOR'], 'approvedAt': now()}
        out = Path(args.directory); out.mkdir(exist_ok=True, parents=True)
        write(out/'approval.json', approval); upload(repo, release['id'], out/'approval.json')
    api(repo, f"/releases/{release['id']}", 'PATCH', {'prerelease': False, 'make_latest': 'true',
        'name': f"Production {m['component']} {m['commit'][:12]}",
        'body': f"Approved by {os.environ['GITHUB_ACTOR']} at {now()}. Server checks every five minutes; download limited to 1 MiB/s.\n\n{args.tag}"})
    print('Existing candidate approved; no image rebuilt.')

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('operation', choices=['prepare', 'publish', 'approve'])
    p.add_argument('--component', choices=REPOS); p.add_argument('--image'); p.add_argument('--tag')
    p.add_argument('--directory', default='candidate'); p.add_argument('--compatible-migrations', action='store_true')
    a = p.parse_args(); globals()[a.operation](a)
