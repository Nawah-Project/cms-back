#!/usr/bin/env python3
"""Disposable Docker integration tests. Never selects an existing Compose project."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import tarfile
import time
import unittest
import uuid

SCRIPT = Path(__file__).with_name('backup.py')
IMAGE = 'postgres:17-alpine'


def command(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True)
    if result.returncode:
        raise RuntimeError(f'Test operation failed: {args[0]} (exit {result.returncode})')
    return result.stdout


class BackupRecoveryIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='nawah-backup-regression-')
        cls.root = Path(cls.temp.name)
        suffix = uuid.uuid4().hex[:10]
        cls.source = 'nawah-backup-test-' + suffix
        cls.target = 'nawah-recovery-test-' + suffix
        cls.stacks = []
        cls.addClassCleanup(cls.cleanup)
        cls.configs = {}
        cls.envs = {}
        for project, recovery in ((cls.source, False), (cls.target, True)):
            labels = {'io.nawah.disposable-test': 'true'}
            if recovery:
                labels['io.nawah.recovery'] = 'true'
            config = {
                'services': {
                    'postgres': {'image': IMAGE, 'labels': labels,
                                 'environment': {'POSTGRES_USER': 'synthetic', 'POSTGRES_DB': 'cms_test',
                                                 'POSTGRES_PASSWORD': uuid.uuid4().hex},
                                 'volumes': ['db:/var/lib/postgresql/data']},
                    'api': {'image': IMAGE, 'labels': labels,
                            'entrypoint': ['sh', '-c', 'sleep infinity'],
                            'environment': {'CV_STORAGE_DIR': '/recovery/cvs'},
                            'volumes': ['cvs:/recovery/cvs']},
                },
                'volumes': {'db': {}, 'cvs': {}},
                'networks': {'default': {'internal': True}},
            }
            path = cls.root / (project + '.json')
            path.write_text(json.dumps(config))
            path.chmod(0o600)
            if recovery:
                # Exercise the recovery template shipped to operators, not a copy.
                path = SCRIPT.with_name('recovery.compose.yml')
                env = cls.root / 'recovery.env'
                env.write_text('RECOVERY_POSTGRES_IMAGE=' + IMAGE + '\n'
                               'RECOVERY_POSTGRES_USER=synthetic\n'
                               'RECOVERY_POSTGRES_DB=cms_test\n'
                               'RECOVERY_POSTGRES_PASSWORD=' + uuid.uuid4().hex + '\n')
                env.chmod(0o600)
                cls.envs[project] = env
            cls.configs[project] = path
            cls.stacks.append(project)
            cls.compose(project, 'up', '-d', '--pull', 'never', 'postgres')
            cls.compose(project, 'create', '--pull', 'never', 'api')
            for _ in range(100):
                ready = subprocess.run(['docker', 'exec', cls.cid(project, 'postgres'),
                                        'pg_isready', '-U', 'synthetic', '-d', 'cms_test'],
                                       capture_output=True)
                if ready.returncode == 0:
                    break
                time.sleep(0.2)
            else:
                raise RuntimeError('Disposable PostgreSQL did not become ready')
        user = str(uuid.uuid4())
        cls.keys = [str(uuid.uuid4()) + '.pdf' for _ in range(2)]
        cls.payloads = [b'%PDF-1.7\nsynthetic historical CV\n', b'%PDF-1.7\nsynthetic current CV\n']
        cls.sql(cls.source, '''
CREATE TABLE users (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE user_cvs (id uuid PRIMARY KEY, "userId" uuid REFERENCES users(id), "storageKey" text UNIQUE, size integer);
CREATE TABLE user_cv_history (id uuid PRIMARY KEY, "userId" uuid REFERENCES users(id), "versionNumber" integer, "storageKey" text, size integer);
CREATE TABLE applications (id uuid PRIMARY KEY, "userId" uuid REFERENCES users(id), "companyName" text);
CREATE TABLE side_task_submissions (id uuid PRIMARY KEY, "userId" uuid REFERENCES users(id), "reviewSummary" text);
CREATE TABLE user_journey_states ("userId" uuid PRIMARY KEY REFERENCES users(id), "currentNodeCode" text, "cvVersionNumber" integer);
CREATE TABLE journey_nodes (code text PRIMARY KEY, "requiredAppsCount" integer);
''')
        cls.sql(cls.source, f'''INSERT INTO users VALUES ('{user}', 'Synthetic participant');
INSERT INTO applications VALUES ('{uuid.uuid4()}', '{user}', 'Synthetic employer');
INSERT INTO side_task_submissions VALUES ('{uuid.uuid4()}', '{user}', 'صلحت غلط في السيرة الذاتية — spam/error');
INSERT INTO user_journey_states VALUES ('{user}', 'W2_M1', 9);
INSERT INTO journey_nodes VALUES ('W1_M1', 11);''')
        for index, (key, payload) in enumerate(zip(cls.keys, cls.payloads)):
            cls.sql(cls.source, f'''INSERT INTO user_cv_history VALUES ('{uuid.uuid4()}', '{user}', {4 if index == 0 else 9}, '{key}', {len(payload)});''')
            cls.write_cv(cls.source, key, payload)
        cls.sql(cls.source, f'''INSERT INTO user_cvs VALUES ('{uuid.uuid4()}', '{user}', '{cls.keys[1]}', {len(cls.payloads[1])});''')
        cls.before = cls.snapshot(cls.source)
        result = cls.cli('backup', *cls.options(cls.source), '--output-dir', str(cls.root / 'backups'), '--confirm-quiesced')
        if result.returncode:
            raise RuntimeError(result.stderr.decode())
        cls.backup = next((cls.root / 'backups').glob('nawah-*'))

    @classmethod
    def compose(cls, project, *args):
        options = ['--env-file', str(cls.envs[project])] if project in cls.envs else []
        return command(['docker', 'compose', '-f', str(cls.configs[project]), '-p', project, *options, *args])

    @classmethod
    def cid(cls, project, service):
        return cls.compose(project, 'ps', '--all', '--quiet', service).decode().strip()

    @classmethod
    def sql(cls, project, query):
        return command(['docker', 'exec', '-i', cls.cid(project, 'postgres'),
                        'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'synthetic', '-d', 'cms_test'], query.encode())

    @classmethod
    def volume(cls, project):
        container = json.loads(command(['docker', 'inspect', cls.cid(project, 'api')]))[0]
        return next(m['Name'] for m in container['Mounts'] if m['Destination'] == '/recovery/cvs')

    @classmethod
    def write_cv(cls, project, key, payload):
        command(['docker', 'run', '--rm', '-i', '--pull', 'never', '--network', 'none',
                 '--mount', f'type=volume,src={cls.volume(project)},dst=/cv',
                 '--entrypoint', 'sh', IMAGE, '-ceu',
                 'cat > "/cv/$1"; chown 1000:1000 "/cv/$1"; chmod 600 "/cv/$1"', '--', key], payload)

    @classmethod
    def snapshot(cls, project):
        tables = ['users', 'applications', 'user_cvs', 'user_cv_history',
                  'side_task_submissions', 'user_journey_states', 'journey_nodes']
        rows = {t: json.loads(cls.sql(project, f'SELECT coalesce(json_agg(t),\'[]\') FROM "{t}" t;')) for t in tables}
        hashes = command(['docker', 'run', '--rm', '--pull', 'never', '--network', 'none',
                          '--mount', f'type=volume,src={cls.volume(project)},dst=/cv,readonly',
                          '--entrypoint', 'sh', IMAGE, '-ceu', 'sha256sum /cv/*.pdf']).decode()
        return rows, hashes

    @classmethod
    def options(cls, project):
        result = ['--compose-file', str(cls.configs[project]), '--project', project]
        if project in cls.envs:
            result += ['--env-file', str(cls.envs[project])]
        return result

    @classmethod
    def cli(cls, *args):
        return subprocess.run(['python3', str(SCRIPT), *args], capture_output=True)

    @classmethod
    def cleanup(cls):
        # Only projects created by this test invocation; never discover/delete other stacks.
        for project in reversed(cls.stacks):
            cls.compose(project, 'down', '--volumes', '--remove-orphans')
        cls.temp.cleanup()

    def test_archive_checks_and_private_permissions(self):
        result = self.cli('verify', str(self.backup))
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(self.backup.stat().st_mode & 0o777, 0o700)
        for name in ('database.dump', 'cv-files.tar', 'manifest.json', 'COMPLETE'):
            self.assertEqual((self.backup / name).stat().st_mode & 0o777, 0o600)
        manifest = json.loads((self.backup / 'manifest.json').read_text())
        for key, payload in zip(self.keys, self.payloads):
            self.assertEqual(manifest['cv_files'][key]['sha256'], hashlib.sha256(payload).hexdigest())

    def test_checksum_corruption_is_rejected(self):
        damaged = self.root / 'damaged'
        shutil.copytree(self.backup, damaged)
        with (damaged / 'database.dump').open('ab') as stream:
            stream.write(b'corruption')
        result = self.cli('verify', str(damaged))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b'Checksum', result.stderr)

    def test_database_cv_reference_mismatch_is_rejected(self):
        damaged = self.root / 'missing-cv'
        shutil.copytree(self.backup, damaged)
        path = damaged / 'manifest.json'
        manifest = json.loads(path.read_text())
        manifest['database']['cv_references'][str(uuid.uuid4()) + '.pdf'] = 15
        path.write_text(json.dumps(manifest))
        result = self.cli('verify', str(damaged))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b'referenced CV', result.stderr)

    def test_unsafe_archive_members_are_rejected(self):
        damaged = self.root / 'unsafe-archive'
        shutil.copytree(self.backup, damaged)
        with tarfile.open(damaged / 'cv-files.tar', 'w') as archive:
            member = tarfile.TarInfo('link.pdf')
            member.type = tarfile.SYMTYPE
            member.linkname = '/etc/passwd'
            archive.addfile(member)
        path = damaged / 'manifest.json'
        manifest = json.loads(path.read_text())
        manifest['sha256']['cv-files.tar'] = hashlib.sha256((damaged / 'cv-files.tar').read_bytes()).hexdigest()
        path.write_text(json.dumps(manifest))
        result = self.cli('verify', str(damaged))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b'ordinary files', result.stderr)

    def test_recovery_cv_directory_must_be_empty(self):
        key = str(uuid.uuid4()) + '.pdf'
        self.write_cv(self.target, key, b'%PDF-synthetic-existing-target')
        try:
            result = self.cli('restore', str(self.backup), *self.options(self.target), '--confirm-isolated-recovery')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b'CV directory must exist and be empty', result.stderr)
            self.assertEqual(self.sql(self.target, "SELECT count(*) FROM pg_tables WHERE schemaname='public';").strip(), b'0')
        finally:
            command(['docker', 'run', '--rm', '--pull', 'never', '--network', 'none',
                     '--mount', f'type=volume,src={self.volume(self.target)},dst=/cv',
                     '--entrypoint', 'sh', IMAGE, '-ceu', 'rm -- "/cv/$1"', '--', key])

    def test_running_api_refuses_backup(self):
        self.compose(self.source, 'start', 'api')
        try:
            result = self.cli('backup', *self.options(self.source), '--output-dir', str(self.root / 'blocked'), '--confirm-quiesced')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b'writers are running', result.stderr)
        finally:
            self.compose(self.source, 'stop', 'api')

    def test_same_source_environment_is_refused(self):
        result = self.cli('restore', str(self.backup), *self.options(self.source), '--confirm-isolated-recovery')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.snapshot(self.source), self.before)

    def test_z_roundtrip_and_no_overwrite(self):
        result = self.cli('backup', *self.options(self.source), '--output-dir', str(self.root / 'backups'), '--confirm-quiesced')
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(len(list((self.root / 'backups').glob('nawah-*'))), 2)
        result = self.cli('restore', str(self.backup), *self.options(self.target), '--confirm-isolated-recovery')
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(self.snapshot(self.target), self.before)
        self.assertEqual(self.snapshot(self.source), self.before)
        again = self.cli('restore', str(self.backup), *self.options(self.target), '--confirm-isolated-recovery')
        self.assertNotEqual(again.returncode, 0)
        self.assertIn(b'database must be empty', again.stderr)
        self.assertEqual(self.snapshot(self.target), self.before)
        api = json.loads(command(['docker', 'inspect', self.cid(self.target, 'api')]))[0]
        self.assertFalse(api['State']['Running'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
