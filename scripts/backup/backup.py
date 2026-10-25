#!/usr/bin/env python3
"""Quiesced Compose backups and explicitly isolated, empty-target recovery.

Requires Python 3 stdlib and Docker/Compose. Never stops an application, pulls an
image, deletes backups, cleans a database, or starts the recovered application.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tarfile
import tempfile
import uuid


class BackupError(Exception):
    pass


def run(args, *, data=None, output=None, operation='Docker/Compose'):
    result = subprocess.run(args, input=data, stdout=output or subprocess.PIPE,
                            stderr=subprocess.PIPE, check=False)
    if result.returncode:
        # Docker/Compose diagnostics can contain interpolated environment values.
        raise BackupError(f'{operation} failed (exit {result.returncode}); no credentials logged')
    return result.stdout


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_private(path, content):
    with path.open('x', encoding='utf-8') as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def environment(container):
    return dict(item.split('=', 1) for item in container['Config'].get('Env', []) if '=' in item)


def mount_for(container, directory):
    path = PurePosixPath(directory)
    if not path.is_absolute() or '..' in path.parts:
        raise BackupError('Storage directory must be an absolute path without traversal')
    candidates = [m for m in container['Mounts']
                  if path == PurePosixPath(m['Destination']) or PurePosixPath(m['Destination']) in path.parents]
    if not candidates:
        raise BackupError('Storage directory must be backed by an explicit persistent mount')
    mount = max(candidates, key=lambda m: len(m['Destination']))
    if mount['Type'] not in ('volume', 'bind'):
        raise BackupError('Only named volumes and bind mounts are supported for persistent storage')
    source = mount.get('Name') if mount['Type'] == 'volume' else mount['Source']
    if not source or ',' in source:
        raise BackupError('Unsupported storage mount source')
    return {'type': mount['Type'], 'source': source,
            'host_source': mount['Source'],
            'relative': str(path.relative_to(PurePosixPath(mount['Destination'])))}


def mount_arg(mount, destination, readonly=True):
    return f"type={mount['type']},src={mount['source']},dst={destination}" + (',readonly' if readonly else '')


class Stack:
    def __init__(self, args):
        self.project = args.project
        self.compose = ['docker', 'compose', '-f', str(Path(args.compose_file).resolve()), '-p', args.project]
        if args.env_file:
            self.compose += ['--env-file', str(Path(args.env_file).resolve())]
        self.pg = self.containers(args.pg_service)
        self.apis = self.containers(args.api_service)
        if len(self.pg) != 1 or not self.pg[0]['State']['Running'] or not self.apis:
            raise BackupError('Expected one running PostgreSQL service and at least one existing API container')
        self.pg = self.pg[0]
        self.assert_quiesced()
        cv_dirs = [environment(c).get('CV_STORAGE_DIR') for c in self.apis]
        if not all(cv_dirs):
            raise BackupError('CV_STORAGE_DIR must be configured on every API container')
        cv_mounts = [mount_for(c, d) for c, d in zip(self.apis, cv_dirs)]
        if any(m != cv_mounts[0] for m in cv_mounts):
            raise BackupError('API replicas do not share a single CV storage location')
        self.cv_mount = cv_mounts[0]
        pg_directory = environment(self.pg).get('PGDATA')
        if not pg_directory:
            raise BackupError('PGDATA must be configured on the PostgreSQL container')
        self.pg_mount = mount_for(self.pg, pg_directory)
        self.engine = run(['docker', 'info', '--format', '{{.ID}}']).decode().strip()

    def containers(self, service):
        ids = run(self.compose + ['ps', '--all', '--quiet', service]).decode().split()
        if not ids:
            return []
        containers = json.loads(run(['docker', 'inspect', *ids]))
        for container in containers:
            labels = container['Config'].get('Labels') or {}
            if labels.get('com.docker.compose.project') != self.project or labels.get('com.docker.compose.service') != service:
                raise BackupError('Compose container identity did not match explicit configuration')
        return containers

    def assert_quiesced(self):
        ids = [c['Id'] for c in self.apis]
        current = json.loads(run(['docker', 'inspect', *ids]))
        if any(c['State']['Running'] or c['State'].get('Restarting') for c in current):
            raise BackupError('API writers are running; stop them manually in an approved maintenance window')

    def sql(self, query):
        command = ('export PGPASSWORD="${POSTGRES_PASSWORD:-}"; '
                   'exec psql -X -qAt --set ON_ERROR_STOP=1 '
                   '--username "${POSTGRES_USER:?}" --dbname "${POSTGRES_DB:?}"')
        return run(['docker', 'exec', '-i', self.pg['Id'], 'sh', '-ceu', command],
                   data=query.encode(), operation='PostgreSQL inventory query').decode().strip()

    def helper(self, image, command, *, readonly=True, backup=None, output=None):
        args = ['docker', 'run', '--rm', '--pull', 'never', '--network', 'none',
                '--read-only', '--security-opt', 'no-new-privileges',
                '--mount', mount_arg(self.cv_mount, '/cv', readonly)]
        if backup:
            args += ['--mount', f'type=bind,src={backup.resolve()},dst=/backup,readonly']
        return run(args + ['--entrypoint', 'sh', image, '-ceu', command, '--',
                           '/cv/' + self.cv_mount['relative']], output=output)

    def identity(self):
        identity = json.loads(self.sql("SELECT json_build_object('database',current_database(),"
                                       "'cluster',(SELECT system_identifier::text FROM pg_control_system()));"))
        return {**identity, 'project': self.project, 'engine': self.engine,
                'pg_container': self.pg['Id'], 'pg_mount': self.pg_mount,
                'cv_mount': self.cv_mount, 'helper_image': self.pg['Config']['Image']}


def inventory(stack):
    tables = json.loads(stack.sql("SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]') "
                                  "FROM pg_tables WHERE schemaname='public';"))
    counts = {}
    for table in tables:
        quoted = '"' + table.replace('"', '""') + '"'
        counts[table] = int(stack.sql(f'SELECT count(*) FROM public.{quoted};'))
    references = {}
    for table in ('user_cvs', 'user_cv_history'):
        if table not in counts:
            continue
        rows = json.loads(stack.sql(f'SELECT coalesce(json_agg(json_build_object(\'key\',"storageKey",\'size\',size)),\'[]\') FROM "{table}";'))
        for row in rows:
            key = row['key']
            if not re.fullmatch(r'[0-9a-fA-F-]{36}\.pdf', key):
                raise BackupError('Unsupported CV storage key; explicit manual review is required')
            if key in references and references[key] != row['size']:
                raise BackupError('Current/history CV size metadata disagrees')
            references[key] = row['size']
    relationships = {}
    for table in ('user_cvs', 'user_cv_history', 'applications', 'side_task_submissions', 'user_journey_states'):
        if table in counts and 'users' in counts:
            relationships[table] = int(stack.sql(f'SELECT count(*) FROM "{table}" t JOIN users u ON u.id=t."userId";'))
    return {'table_counts': counts, 'cv_references': references, 'user_relationship_counts': relationships}


def archive_inventory(path):
    files = {}
    with tarfile.open(path, 'r:') as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts:
                raise BackupError('Unsafe path in CV archive')
            if member.isdir():
                continue
            if not member.isfile() or member.linkname or member.sparse is not None:
                raise BackupError('CV archives must contain ordinary files, not links or special files')
            key = str(name)
            if key in files:
                raise BackupError('Duplicate CV archive path')
            stream = archive.extractfile(member)
            files[key] = {'size': member.size, 'sha256': hashlib.file_digest(stream, 'sha256').hexdigest(),
                          'uid': member.uid, 'gid': member.gid, 'mode': member.mode}
    return files


def check_references(metadata, files):
    for key, size in metadata['cv_references'].items():
        if key not in files or files[key]['size'] != size:
            raise BackupError('A database-referenced CV file is missing or has the wrong size')


def verify(directory, image=None, *, complete=True):
    if complete and not (directory / 'COMPLETE').is_file():
        raise BackupError('Backup is incomplete (no COMPLETE marker)')
    manifest = json.loads((directory / 'manifest.json').read_text())
    if manifest.get('format') != 1 or manifest.get('consistency') != 'all-writers-stopped':
        raise BackupError('Unsupported backup format or consistency mode')
    for name in ('database.dump', 'cv-files.tar'):
        path = directory / name
        if not path.is_file() or path.is_symlink() or digest(path) != manifest['sha256'][name]:
            raise BackupError(f'Checksum verification failed: {name}')
    files = archive_inventory(directory / 'cv-files.tar')
    if files != manifest['cv_files']:
        raise BackupError('CV file inventory/checksum mismatch')
    check_references(manifest['database'], files)
    helper_image = image or manifest['source']['helper_image']
    run(['docker', 'run', '--rm', '--pull', 'never', '--network', 'none', '--read-only',
         '--security-opt', 'no-new-privileges', '--mount',
         f'type=bind,src={directory.resolve()},dst=/backup,readonly',
         '--entrypoint', 'pg_restore', helper_image, '--list', '/backup/database.dump'],
        operation='PostgreSQL archive validation')
    return manifest


def backup(args):
    if not args.confirm_quiesced:
        raise BackupError('Confirm all application, worker and external database writers are stopped')
    stack = Stack(args)
    root = Path(args.output_dir).resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.stat().st_mode & 0o077:
        raise BackupError('Backup output directory must have permissions 0700')
    ident = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex
    pending = root / ('.incomplete-' + ident)
    pending.mkdir(mode=0o700)
    source = stack.identity()
    before = inventory(stack)
    dump_command = ('export PGPASSWORD="${POSTGRES_PASSWORD:-}"; exec pg_dump --format=custom '
                    '--no-owner --no-acl --username "${POSTGRES_USER:?}" --dbname "${POSTGRES_DB:?}"')
    with (pending / 'database.dump').open('xb') as stream:
        run(['docker', 'exec', stack.pg['Id'], 'sh', '-ceu', dump_command], output=stream,
            operation='PostgreSQL logical backup')
        stream.flush()
        os.fsync(stream.fileno())
    with (pending / 'cv-files.tar').open('xb') as stream:
        stack.helper(source['helper_image'], 'tar -cf - -C "$1" .', output=stream)
        stream.flush()
        os.fsync(stream.fileno())
    stack.assert_quiesced()
    if inventory(stack) != before:
        raise BackupError('Database inventory changed during backup; backup remains incomplete')
    manifest = {'format': 1, 'created_at_utc': datetime.now(timezone.utc).isoformat(),
                'consistency': 'all-writers-stopped', 'source': source, 'database': before,
                'sha256': {name: digest(pending / name) for name in ('database.dump', 'cv-files.tar')},
                'cv_files': archive_inventory(pending / 'cv-files.tar')}
    check_references(before, manifest['cv_files'])
    write_private(pending / 'manifest.json', json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    verify(pending, complete=False)
    write_private(pending / 'COMPLETE', 'Archive and CV-reference checks passed; isolated restore still required.\n')
    destination = root / ('nawah-' + ident)
    if destination.exists():
        raise BackupError('Backup destination already exists; refusing to replace it')
    sync_directory(pending)
    pending.rename(destination)
    sync_directory(root)
    print(f'Backup created: {destination}')
    print('Archive checks passed. Schedule an isolated restore drill; command success alone is not recovery proof.')


def restore(args):
    if not args.confirm_isolated_recovery or not args.project.startswith('nawah-recovery-'):
        raise BackupError('Restore requires --confirm-isolated-recovery and a nawah-recovery-* project')
    directory = Path(args.backup).resolve()
    manifest = verify(directory, args.helper_image)
    stack = Stack(args)
    target = stack.identity()
    source = manifest['source']
    if target['project'] == source['project'] or target['cluster'] == source['cluster']:
        raise BackupError('Recovery target matches the source environment')
    if target['engine'] == source['engine']:
        if target['pg_container'] == source['pg_container']:
            raise BackupError('Recovery database container is the source')
        for key in ('pg_mount', 'cv_mount'):
            if (target[key]['type'], target[key]['source']) == (source[key]['type'], source[key]['source']):
                raise BackupError('Recovery storage overlaps source storage')
        for target_mount in (target['pg_mount'], target['cv_mount']):
            for source_mount in (source['pg_mount'], source['cv_mount']):
                target_path = PurePosixPath(target_mount['host_source'])
                source_path = PurePosixPath(source_mount['host_source'])
                if target_path == source_path or target_path in source_path.parents or source_path in target_path.parents:
                    raise BackupError('Recovery mount paths overlap source storage')
    for container in [stack.pg, *stack.apis]:
        if (container['Config'].get('Labels') or {}).get('io.nawah.recovery') != 'true':
            raise BackupError('Every recovery service requires io.nawah.recovery=true')
        if container['HostConfig'].get('PortBindings'):
            raise BackupError('Recovery containers must not publish host ports')
        networks = list(container['NetworkSettings']['Networks'])
        if not networks:
            raise BackupError('Recovery containers need an explicitly isolated internal network')
        for network in json.loads(run(['docker', 'network', 'inspect', *networks])):
            if not network['Internal']:
                raise BackupError('Recovery network must be internal')
    objects = stack.sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                        "WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema';")
    if int(objects):
        raise BackupError('Recovery database must be empty; no clean/drop/overwrite is performed')
    image = args.helper_image or target['helper_image']
    try:
        stack.helper(image, 'test -d "$1" && test -z "$(ls -A "$1")"')
    except BackupError as error:
        raise BackupError('Recovery CV directory must exist and be empty') from error
    command = ('export PGPASSWORD="${POSTGRES_PASSWORD:-}"; exec pg_restore --exit-on-error '
               '--single-transaction --no-owner --no-acl '
               '--username "${POSTGRES_USER:?}" --dbname "${POSTGRES_DB:?}"')
    with (directory / 'database.dump').open('rb') as stream:
        result = subprocess.run(['docker', 'exec', '-i', stack.pg['Id'], 'sh', '-ceu', command],
                                stdin=stream, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if result.returncode:
        raise BackupError(f'pg_restore failed (exit {result.returncode}); recovery is not approved')
    stack.helper(image, 'tar -xf /backup/cv-files.tar -C "$1"', readonly=False, backup=directory)
    if inventory(stack) != manifest['database']:
        raise BackupError('Restored database counts, relationships or CV references do not match')
    with tempfile.TemporaryDirectory(prefix='nawah-recovery-verify-') as temp:
        check = Path(temp) / 'cv-files.tar'
        with check.open('xb') as stream:
            stack.helper(image, 'tar -cf - -C "$1" .', output=stream)
        if archive_inventory(check) != manifest['cv_files']:
            raise BackupError('Restored CV file names, sizes or checksums do not match')
    stack.assert_quiesced()
    print('Isolated restore verified: table counts, user relationships, CV references and all CV checksums match.')
    print('Recovered API remains stopped. Do not expose it or run application startup until deployment review.')


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest='action', required=True)
    for name in ('backup', 'restore'):
        cmd = sub.add_parser(name)
        cmd.add_argument('--compose-file', required=True)
        cmd.add_argument('--project', required=True)
        cmd.add_argument('--env-file')
        cmd.add_argument('--pg-service', default='postgres')
        cmd.add_argument('--api-service', default='api')
        if name == 'backup':
            cmd.add_argument('--output-dir', required=True)
            cmd.add_argument('--confirm-quiesced', action='store_true')
        else:
            cmd.add_argument('backup')
            cmd.add_argument('--helper-image')
            cmd.add_argument('--confirm-isolated-recovery', action='store_true')
    cmd = sub.add_parser('verify')
    cmd.add_argument('backup')
    cmd.add_argument('--helper-image')
    return p


def main():
    os.umask(0o077)
    args = parser().parse_args()
    try:
        if args.action == 'backup':
            backup(args)
        elif args.action == 'restore':
            restore(args)
        else:
            verify(Path(args.backup).resolve(), args.helper_image)
            print('Archive/checksum/CV-reference checks passed. A successful isolated restore is still required.')
        return 0
    except (BackupError, OSError, ValueError, KeyError, tarfile.TarError) as error:
        print(f'Backup/recovery refused or failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
