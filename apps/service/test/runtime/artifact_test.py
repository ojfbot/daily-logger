"""Behavioral tests for the authenticated, non-executing artifact receiver."""
import base64
import copy
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import struct
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile


MODULE = Path(__file__).resolve().parents[2] / 'runtime/artifact.py'
SPEC = importlib.util.spec_from_file_location('dailylogger_artifact_under_test', MODULE)
artifact = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(artifact)
REAL_SUBPROCESS_RUN = subprocess.run
BUILT, HEAD, BASE = '3' * 40, '1' * 40, '2' * 40
REPOSITORY = 'ojfbot/daily-logger'
WORKFLOW = '.github/workflows/service-runtime.yml'
RELEASE_WORKFLOW = '.github/workflows/service-release-candidate.yml'
RELEASE_VERSION = 'v0.1.0-rc.1'
UPLOAD = 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'


def encoded(value):
    return json.dumps(value, separators=(',', ':')).encode()


def hashed(value):
    return hashlib.sha256(value).hexdigest()


def tar_bytes(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name, data in entries:
            member = tarfile.TarInfo(name)
            member.size = len(data)
            member.mode = 0o644
            archive.addfile(member, io.BytesIO(data))
    return output.getvalue()


def pax_header_bytes(attributes, kind=tarfile.XHDTYPE):
    records = []
    for key, value in attributes.items():
        content = f'{key}={value}\n'.encode()
        length = len(content) + 2
        while len(str(length)) + 1 + len(content) != length:
            length = len(str(length)) + 1 + len(content)
        records.append(str(length).encode() + b' ' + content)
    payload = b''.join(records)
    header = tarfile.TarInfo('././@PaxHeader')
    header.type = kind
    header.size = len(payload)
    return header.tobuf(format=tarfile.USTAR_FORMAT) + payload + b'\0' * (-len(payload) % 512)


def image_tar(*, user='1000:1000', architecture='amd64', system='linux',
              missing_layer=False, corrupt_layer=False, missing_diff=False):
    layer = tar_bytes([('etc/fixture-proof.txt', b'An actual disposable image layer\n')])
    config = encoded({'architecture': architecture, 'os': system,
                      'config': {'User': user},
                      'rootfs': {'type': 'layers', 'diff_ids': [] if missing_diff else ['sha256:' + hashed(layer)]}})
    image_id = 'sha256:' + hashed(config)
    config_name = hashed(config) + '.json'
    entries = [('manifest.json', encoded([{'Config': config_name,
                'RepoTags': ['dailylogger-runtime:proof'], 'Layers': ['fixture/layer.tar']}])),
               (config_name, config)]
    if not missing_layer:
        entries.append(('fixture/layer.tar', layer + b'corruption' if corrupt_layer else layer))
    return tar_bytes(entries), image_id


def oci_image_tar(*, compressed=False, attestation=False, wrong_diff=False, crossed_config=False,
                  root_first=False, descriptor_platform=None, cached_reference=None, invalid_field_at=None):
    """Docker/containerd save layout with independently hashed OCI graph nodes."""
    blobs = {}
    index_type = 'application/vnd.oci.image.index.v1+json'
    manifest_type = 'application/vnd.oci.image.manifest.v1+json'
    config_type = 'application/vnd.oci.image.config.v1+json'

    def blob(data, media_type, **extra):
        identity = 'sha256:' + hashed(data)
        blobs['blobs/sha256/' + identity[7:]] = data
        return {'mediaType': media_type, 'digest': identity, 'size': len(data), **extra}

    layer = tar_bytes([('etc/oci-fixture.txt', b'An actual OCI runtime layer\n')])
    stored_layer = gzip.compress(layer, mtime=0) if compressed else layer
    layer_type = 'application/vnd.oci.image.layer.v1.tar' + ('+gzip' if compressed else '')
    layer_descriptor = blob(stored_layer, layer_type)
    if invalid_field_at == 'layer':
        layer_descriptor['Digest'] = layer_descriptor['digest']
    config = {'architecture': 'amd64', 'os': 'linux', 'config': {'User': '1000:1000'},
              'rootfs': {'type': 'layers', 'diff_ids': ['sha256:' + hashed(stored_layer if wrong_diff else layer)]}}
    if invalid_field_at == 'config-document':
        config['Os'] = config['os']
    if invalid_field_at == 'runtime-config':
        config['config']['eNv'] = []
    if invalid_field_at == 'rootfs':
        config['rootfs']['Type'] = config['rootfs'].pop('type')
    if invalid_field_at == 'history':
        config['history'] = [{'Created_By': 'fixture'}]
    if invalid_field_at == 'healthcheck':
        config['config']['Healthcheck'] = {'test': ['NONE']}
    config_descriptor = blob(encoded(config), config_type)
    if invalid_field_at == 'config':
        config_descriptor['Size'] = config_descriptor['size']
    manifest = {'schemaVersion': 2, 'mediaType': manifest_type,
                'config': config_descriptor, 'layers': [layer_descriptor]}
    if invalid_field_at == 'manifest':
        manifest['Layers'] = manifest['layers']
    runtime = blob(encoded(manifest), manifest_type,
                   platform=descriptor_platform or {'architecture': 'amd64', 'os': 'linux'})
    descriptors = [runtime]
    identities = {'configId': config_descriptor['digest'], 'manifestId': runtime['digest'],
                  'layerId': layer_descriptor['digest']}
    if root_first:
        root_config = blob(encoded({**config, 'config': {'User': '0:0'}}), config_type)
        root_runtime = blob(encoded({'schemaVersion': 2, 'mediaType': manifest_type,
            'config': root_config, 'layers': [layer_descriptor]}), manifest_type,
            platform={'architecture': 'amd64', 'os': 'linux'})
        descriptors.insert(0, root_runtime)
        identities['rootRuntimeId'] = root_runtime['digest']
    if attestation:
        statement = blob(encoded({'_type': 'https://in-toto.io/Statement/v0.1', 'subject': []}),
                         'application/vnd.in-toto+json')
        attestation_config = blob(encoded({'architecture': 'unknown', 'os': 'unknown', 'config': {},
            'rootfs': {'type': 'layers', 'diff_ids': [statement['digest']]}}), config_type)
        attestation_manifest = blob(encoded({'schemaVersion': 2, 'mediaType': manifest_type,
            'config': attestation_config, 'layers': [statement]}), manifest_type,
            platform={'architecture': 'unknown', 'os': 'unknown'}, annotations={
                'vnd.docker.reference.type': 'attestation-manifest',
                'vnd.docker.reference.digest': runtime['digest']})
        descriptors.append(attestation_manifest)
        identities['attestationId'] = attestation_manifest['digest']
    warm_reference = None
    if cached_reference and cached_reference.startswith('runtime-'):
        warm_reference = copy.deepcopy(runtime)
        if cached_reference == 'runtime-platform':
            descriptors[0] = {**runtime, 'platform': {'architecture': 'arm64', 'os': 'linux'}}
    elif cached_reference:
        warm_reference = copy.deepcopy(attestation_manifest)
        descriptors[-1] = copy.deepcopy(attestation_manifest)
        if cached_reference == 'attestation-marker':
            del descriptors[-1]['annotations']
        elif cached_reference == 'attestation-platform':
            descriptors[-1]['platform'] = {'architecture': 'amd64', 'os': 'linux'}
    image_index = blob(encoded({'schemaVersion': 2, 'mediaType': index_type,
                               'manifests': descriptors}), index_type)
    identities['indexId'] = image_index['digest']
    compatibility_config = config_descriptor
    if crossed_config:
        compatibility_config = blob(encoded({**config, 'created': '2026-01-01T00:00:00Z'}), config_type)
        identities['configId'] = compatibility_config['digest']
    root_index = {'schemaVersion': 2, 'mediaType': index_type,
                  'manifests': [warm_reference, image_index] if warm_reference else [image_index]}
    compatibility = [{'Config': 'blobs/sha256/' + compatibility_config['digest'][7:],
                      'RepoTags': ['dailylogger-runtime:proof'],
                      'Layers': ['blobs/sha256/' + layer_descriptor['digest'][7:]]}]
    entries = [('oci-layout', encoded({'imageLayoutVersion': '1.0.0'})),
               ('index.json', encoded(root_index)), ('manifest.json', encoded(compatibility)), *blobs.items()]
    return tar_bytes(entries), identities


class GithubFixture:
    """Trusted API records and downloaded bytes are independently mutable."""
    def __init__(self):
        self.expected = {'schemaVersion': 1, 'artifactId': 700, 'runId': 100,
                         'attempt': 2, 'source': {'builtRevision': BUILT,
                         'event': 'pull_request', 'ref': 'refs/pull/55/merge',
                         'pullRequest': {'number': 55, 'head': HEAD, 'base': BASE}}}
        self.source_files = {
            'pnpm-lock.yaml': b'lockfileVersion: 9.0\n',
            'apps/service/runtime/Dockerfile': b'FROM synthetic-fixture-only\n',
            'apps/service/runtime/compose.yaml': b'image: postgres:18.7-trixie@sha256:' + b'a' * 64 + b'\n',
            'apps/service/runtime/prepare-ingress.ts': b"export const PROXY_IMAGE = 'caddy:2.11.9-alpine@sha256:" + b'b' * 64 + b"'\n",
            WORKFLOW: ('name: Synthetic fixture producer\njobs:\n  runtime-image:\n'
                       '    steps:\n      - uses: ' + UPLOAD + '\n').encode(),
        }
        self.image, image_id = image_tar()
        self.manifest = {
            'schemaVersion': 1, 'purpose': 'disposable-fixture-candidate', 'repository': REPOSITORY,
            'source': copy.deepcopy(self.expected['source']),
            'ci': {'workflowPath': WORKFLOW, 'workflowId': 50, 'runId': 100,
                   'attempt': 2, 'jobId': 110, 'jobKey': 'runtime-image'},
            'image': {'identityKind': 'docker-config-sha256', 'configId': image_id,
                      'engineId': image_id, 'engineIdentityKind': 'config-sha256',
                      'platform': 'linux/amd64', 'uid': 1000, 'gid': 1000},
            'archive': {'name': 'runtime-image.tar', 'size': len(self.image), 'sha256': hashed(self.image)},
            'context': {'schemaVersion': 1, 'sourceRevision': BUILT, 'fixtureCommit': '4' * 40,
                        'articleSha256': '5' * 64, 'actionsSha256': '6' * 64,
                        'configuredRemotes': 0, 'alternateObjectStores': 0},
            'sourceFileDigests': {name: hashed(data) for name, data in self.source_files.items()},
            'upstreamImages': {'postgres': 'postgres:18.7-trixie@sha256:' + 'a' * 64,
                               'caddy': 'caddy:2.11.9-alpine@sha256:' + 'b' * 64},
            'qualifications': {
                'preparation': {'tests': 8, 'passed': 8, 'failed': 0, 'skipped': 0},
                'offline': {'proof': 'offline-final-image', 'node': 'v24.22.3', 'git': 'git version 2.47.3',
                            'uid': 1000, 'fixtureCommit': '4' * 40, 'nativeSqlite': 'passed'},
                'entrypoints': {'proof': 'production-entrypoints-and-cross-container-storage',
                                'migration': 'explicit-and-repeatable', 'fixture': 'complete',
                                'shutdown': 'clean', 'publishedPorts': 0},
                'http': {'proof': 'production-runtime-with-external-http-tests', 'result': 'passed',
                         'realGithubLogin': 'not-qualified',
                         'counts': {'tests': 17, 'passed': 17, 'failed': 0, 'skipped': 0}},
                'ingress': {'proof': 'private-tls-proxy', 'strictTls': True, 'defaultLoopback': True,
                            'peerAcl': 'passed', 'hostPort': 'preserved', 'independentContainerRecreation': 'passed',
                            'leafReplacement': 'passed', 'sessionsAndCommands': 'preserved', 'logout': 'revoked',
                            'mutationForwardCount': 1, 'logCanaries': 'absent', 'realGithubLogin': 'not-qualified'},
                'exportReload': {'status': 'passed', 'imageRecordRemoved': True,
                                 'archiveClosure': 'passed', 'emptyLayerStore': False},
            },
        }
        root = f'repos/{REPOSITORY}/'
        self.artifact_route = root + 'actions/artifacts/700'
        self.run_route = root + 'actions/runs/100/attempts/2'
        self.jobs_route = self.run_route + '/jobs?per_page=100&page=1'
        self.commit_route = root + f'commits/{BUILT}'
        self.records = {
            root.rstrip('/'): {'id': 42, 'full_name': REPOSITORY},
            self.artifact_route: {'id': 700, 'name': 'dailylogger-fixture-100-2', 'expired': False,
                'expires_at': (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
                'workflow_run': {'id': 100, 'repository_id': 42, 'head_repository_id': 42, 'head_sha': HEAD}},
            self.run_route: {'id': 100, 'run_attempt': 2, 'workflow_id': 50, 'status': 'completed',
                'conclusion': 'success', 'path': WORKFLOW, 'event': 'pull_request',
                'repository': {'full_name': REPOSITORY}, 'head_sha': HEAD,
                'pull_requests': [{'number': 55}]},
            self.jobs_route: {'jobs': [{'id': 110, 'name': 'runtime-image', 'run_id': 100,
                'status': 'completed', 'conclusion': 'success', 'head_sha': HEAD}]},
            self.commit_route: {'sha': BUILT, 'parents': [{'sha': BASE}, {'sha': HEAD}]},
        }
        self.calls = []
        self.downloads = []
        self.download_error = None
        self.on_download = None
        self.repack()

    def as_release_candidate(self):
        self.expected = {'schemaVersion': 1, 'artifactId': 700, 'runId': 100,
                         'attempt': 2, 'source': {'builtRevision': BUILT,
                         'event': 'workflow_dispatch', 'ref': 'refs/heads/main', 'pullRequest': None},
                         'release': {'version': RELEASE_VERSION, 'candidate': True}}
        self.source_files.pop(WORKFLOW)
        self.source_files[RELEASE_WORKFLOW] = ('name: Synthetic release producer\n'
            'on:\n  workflow_dispatch:\n    inputs:\n      release_version:\n'
            "jobs:\n  release-candidate:\n    if: github.ref == 'refs/heads/main'\n    steps:\n"
            '      - uses: ' + UPLOAD + '\n').encode()
        self.manifest['purpose'] = 'release-candidate'
        self.manifest['source'] = copy.deepcopy(self.expected['source'])
        self.manifest['release'] = copy.deepcopy(self.expected['release'])
        self.manifest['ci'].update(workflowPath=RELEASE_WORKFLOW, jobKey='release-candidate')
        self.manifest['sourceFileDigests'] = {name: hashed(data) for name, data in self.source_files.items()}
        self.records[self.artifact_route]['name'] = artifact.artifact_name(
            artifact.RELEASE_PROFILE, 100, 2, self.expected['release'])
        self.records[self.artifact_route]['workflow_run']['head_sha'] = BUILT
        self.records[self.run_route].update(path=RELEASE_WORKFLOW, event='workflow_dispatch',
                                            head_sha=BUILT, head_branch='main')
        self.records[self.jobs_route]['jobs'][0].update(name='release-candidate', head_sha=BUILT)
        self.repack()
        return self

    def get(self, route):
        self.calls.append(route)
        prefix = f'repos/{REPOSITORY}/contents/'
        if route.startswith(prefix):
            path, revision = route[len(prefix):].split('?ref=')
            if revision != BUILT or path not in self.source_files:
                raise AssertionError('Unexpected committed-source request: ' + route)
            return {'type': 'file', 'encoding': 'base64',
                    'content': base64.b64encode(self.source_files[path]).decode()}
        if route not in self.records:
            raise AssertionError('Unexpected API request: ' + route)
        return copy.deepcopy(self.records[route])

    def download(self, artifact_id, destination, maximum=artifact.MAX_ARCHIVE):
        self.downloads.append(artifact_id)
        if len(self.zip_bytes) > maximum:
            raise ValueError('Synthetic download exceeds its authenticated byte allowance')
        if hasattr(destination, 'write'):
            destination.write(self.zip_bytes)
            destination.flush()
        else:
            Path(destination).write_bytes(self.zip_bytes)
        if self.on_download:
            self.on_download(destination)
        if self.download_error:
            raise self.download_error

    def repack(self, *, manifest_bytes=None, image_bytes=None, entries=None,
               compression=zipfile.ZIP_STORED):
        output = io.BytesIO()
        with warnings.catch_warnings(), zipfile.ZipFile(output, 'w', compression=compression) as archive:
            warnings.simplefilter('ignore', UserWarning)
            if entries is None:
                entries = [('manifest.json', manifest_bytes if manifest_bytes is not None else encoded(self.manifest)),
                           ('runtime-image.tar', image_bytes if image_bytes is not None else self.image)]
            for name, data in entries:
                archive.writestr(name, data)
        self.authenticate_outer(output.getvalue())

    def authenticate_outer(self, data):
        self.zip_bytes = data
        self.records[self.artifact_route]['digest'] = 'sha256:' + hashed(data)
        self.records[self.artifact_route]['size_in_bytes'] = len(data)

    def replace_image(self, **options):
        self.image, image_id = image_tar(**options)
        self.manifest['image']['configId'] = image_id
        self.manifest['image']['engineId'] = image_id
        self.manifest['image']['engineIdentityKind'] = 'config-sha256'
        self.manifest['archive'].update(size=len(self.image), sha256=hashed(self.image))
        self.repack()

    def replace_oci_image(self, engine_kind='index-sha256', **options):
        self.image, identities = oci_image_tar(**options)
        self.manifest['image'].update(configId=identities['configId'], engineIdentityKind=engine_kind,
            engineId=identities['indexId'] if engine_kind == 'index-sha256' else identities['manifestId'])
        self.manifest['archive'].update(size=len(self.image), sha256=hashed(self.image))
        self.repack()
        return identities

    def rewrite_image_members(self, transform):
        with tarfile.open(fileobj=io.BytesIO(self.image), mode='r:') as source:
            entries = [(member.name, source.extractfile(member).read()) for member in source]
        self.image = tar_bytes(transform(entries))
        self.manifest['archive'].update(size=len(self.image), sha256=hashed(self.image))
        self.repack()


class ArtifactBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='dailylogger-artifact-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.sentinel = self.root / 'unrelated.txt'
        self.sentinel.write_bytes(b'Unrelated data must survive failures')
        self.fixture = GithubFixture()
        self.processes = []
        self.rejections = 0

    def verify(self, fixture=None, output=None, git_probe=None):
        fixture = fixture or self.fixture
        output = output or self.root / 'verified'

        def boundary(args, *positional, **options):
            self.processes.append(args)
            if args[:1] != ['git']:
                raise AssertionError('Verifier attempted execution outside its Git output-location check: ' + repr(args))
            if git_probe is not None and 'rev-parse' in args:
                return git_probe
            return REAL_SUBPROCESS_RUN(args, *positional, **options)

        with patch.object(artifact.subprocess, 'run', side_effect=boundary), \
                patch.object(artifact, 'run', side_effect=AssertionError('Verifier must never execute Docker, SSH or a runtime command')):
            return artifact.verify_fixture(copy.deepcopy(fixture.expected), output, fixture)

    def rejected(self, fixture=None):
        fixture = fixture or self.fixture
        self.rejections += 1
        output = self.root / f'rejected-{self.rejections:03}'
        with self.assertRaises((ValueError, OSError, zipfile.BadZipFile, tarfile.TarError)):
            self.verify(fixture, output)
        if output.exists():
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o700)
            self.assertTrue((output / 'UNQUALIFIED').is_file(), 'Retained stage must carry a fixed rejection marker')
            self.assertFalse((output / 'verification.json').exists(), 'Failed stage cannot carry a success receipt')
        elif fixture.downloads:
            self.fail('A failed owned download stage must be retained for reconciliation')
        self.assertEqual(self.sentinel.read_bytes(), b'Unrelated data must survive failures')

    def test_authenticated_candidate_stages_exact_bytes_without_loading_or_production_eligibility(self):
        receipt = self.verify()
        self.assertEqual(receipt['artifactId'], 700)
        self.assertEqual(receipt['runId'], 100)
        self.assertEqual(receipt['attempt'], 2)
        self.assertEqual(receipt['jobId'], 110)
        self.assertEqual(receipt['source']['builtRevision'], BUILT)
        self.assertNotEqual(BUILT, HEAD)
        self.assertNotEqual(BUILT, BASE)
        self.assertEqual(receipt['outerSha256'], hashed(self.fixture.zip_bytes))
        self.assertEqual(receipt['archiveSha256'], hashed(self.fixture.image))
        self.assertEqual(receipt['imageEngineId'], self.fixture.manifest['image']['configId'])
        self.assertEqual(receipt['engineIdentityKind'], 'config-sha256')
        self.assertFalse(receipt['productionEligible'])
        self.assertFalse(receipt['imageLoaded'])
        output = self.root / 'verified'
        self.assertEqual({path.name for path in output.iterdir()}, {'manifest.json', 'runtime-image.tar', 'verification.json'})
        self.assertEqual((output / 'runtime-image.tar').read_bytes(), self.fixture.image)
        self.assertEqual(json.loads((output / 'manifest.json').read_bytes()), self.fixture.manifest)
        self.assertEqual(json.loads((output / 'verification.json').read_bytes()), receipt)
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o700)
        self.assertEqual(self.fixture.downloads, [700])

    def test_release_candidate_round_trip_binds_manual_main_source_and_version(self):
        fixture = GithubFixture().as_release_candidate()
        output = self.root / 'verified-release'
        receipt = self.verify(fixture, output)
        self.assertEqual(receipt['purpose'], 'verified-release-candidate')
        self.assertEqual(receipt['release'], {'version': RELEASE_VERSION, 'candidate': True})
        self.assertEqual(receipt['source']['event'], 'workflow_dispatch')
        self.assertEqual(receipt['source']['ref'], 'refs/heads/main')
        self.assertFalse(receipt['productionEligible'])
        self.assertFalse(receipt['imageLoaded'])
        self.assertEqual(json.loads((output / 'manifest.json').read_bytes())['release'], receipt['release'])

    def test_release_candidate_rejects_wrong_version_source_workflow_and_inner_bytes(self):
        for target in ('version', 'source', 'workflow', 'workflow-shape', 'inner-bytes'):
            with self.subTest(target=target):
                fixture = GithubFixture().as_release_candidate()
                if target == 'version':
                    fixture.records[fixture.artifact_route]['name'] = 'dailylogger-release-candidate-v0.1.0-rc.2-100-2'
                elif target == 'source':
                    fixture.expected['source']['ref'] = 'refs/heads/release'
                elif target == 'workflow':
                    fixture.records[fixture.run_route]['path'] = WORKFLOW
                elif target == 'workflow-shape':
                    fixture.source_files[RELEASE_WORKFLOW] += b'  pull_request:\n'
                else:
                    fixture.repack(image_bytes=fixture.image + b'changed release payload')
                self.rejected(fixture)

    def test_release_workflow_is_main_only_and_uses_the_reviewed_release_profile(self):
        workflow = (MODULE.parents[3] / RELEASE_WORKFLOW).read_text()
        self.assertIn('workflow_dispatch:', workflow)
        self.assertNotIn('pull_request:', workflow)
        self.assertIn("if: github.ref == 'refs/heads/main'", workflow)
        self.assertIn('DAILYLOGGER_RELEASE_VERSION: ${{ inputs.release_version }}', workflow)
        self.assertIn('--release-version "$DAILYLOGGER_RELEASE_VERSION"', workflow)
        self.assertIn('retention-days: 90', workflow)
        hashes, _ = artifact.input_files(artifact.RELEASE_PROFILE,
                                         lambda path: (MODULE.parents[3] / path).read_bytes())
        self.assertEqual(set(hashes), set(artifact.RELEASE_SOURCE_FILES))

    def test_release_export_requires_owned_release_job_and_matching_version_environment(self):
        environment = {'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': REPOSITORY,
                       'GITHUB_JOB': 'runtime-image', 'DAILYLOGGER_RELEASE_VERSION': RELEASE_VERSION}
        with patch.dict(os.environ, environment, clear=True), \
             patch.object(artifact, 'run', side_effect=AssertionError('Guard must precede command execution')):
            with self.assertRaises(ValueError):
                artifact.export_release_candidate(artifact.OWNED_IMAGE, self.root / 'context',
                                                  self.root / 'exported', RELEASE_VERSION)
        environment['GITHUB_JOB'] = 'release-candidate'
        environment['DAILYLOGGER_RELEASE_VERSION'] = 'v0.1.0-rc.2'
        with patch.dict(os.environ, environment, clear=True), \
             patch.object(artifact, 'run', side_effect=AssertionError('Guard must precede command execution')):
            with self.assertRaises(ValueError):
                artifact.export_release_candidate(artifact.OWNED_IMAGE, self.root / 'context',
                                                  self.root / 'exported', RELEASE_VERSION)

    def test_output_ownership_git_metadata_and_overrides_are_not_authorization(self):
        directory = self.root / 'existing'
        directory.mkdir()
        marker = directory / 'keep'
        marker.write_text('existing data')
        symlink = self.root / 'link'
        symlink.symlink_to(directory, target_is_directory=True)
        for output in (self.sentinel, directory, symlink):
            with self.subTest(output=output.name), self.assertRaises(ValueError):
                self.verify(output=output)
        self.assertEqual(marker.read_text(), 'existing data')
        self.assertTrue(symlink.is_symlink())
        self.assertEqual(self.fixture.calls, [])
        self.assertEqual(self.fixture.downloads, [])
        checkout, bare = self.root / 'checkout', self.root / 'bare'
        git_env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
        for args in (['init', '--quiet', str(checkout)], ['init', '--quiet', '--bare', str(bare)]):
            REAL_SUBPROCESS_RUN(['git', '-c', 'init.templateDir=', *args], check=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=git_env)
        metadata = self.root / 'ordinary-parent' / '.git'
        metadata.mkdir(parents=True)
        overrides = {'GIT_DIR': str(self.root / 'not-a-repository'),
                     'GIT_WORK_TREE': str(self.root), 'GIT_CEILING_DIRECTORIES': str(checkout)}
        for parent in (checkout, checkout / '.git', bare, metadata):
            output = parent / 'candidate'
            with self.subTest(parent=parent), patch.dict(os.environ, overrides):
                with self.assertRaises(ValueError):
                    self.verify(output=output)
            self.assertFalse(output.exists())
        self.assertTrue((checkout / '.git').is_dir())
        self.assertTrue((bare / 'HEAD').is_file())
        self.assertEqual(self.sentinel.read_bytes(), b'Unrelated data must survive failures')

    def test_substituted_outer_bytes_reject_even_when_inner_bundle_is_self_consistent(self):
        authenticated = copy.deepcopy(self.fixture.records[self.fixture.artifact_route])
        self.fixture.manifest['qualifications']['offline']['node'] = 'v24.22.4'
        self.fixture.repack()
        self.assertEqual(len(self.fixture.zip_bytes), authenticated['size_in_bytes'])
        self.fixture.records[self.fixture.artifact_route] = authenticated
        self.rejected()

    def test_ambiguous_git_probe_failure_does_not_authorize_output_creation(self):
        for stderr in (b'fatal: detected dubious ownership in repository\n',
                       b'fatal: bad config line 1 in file /invalid/config\n'):
            with self.subTest(stderr=stderr):
                fixture = GithubFixture()
                probe = subprocess.CompletedProcess(['git'], 128, stdout=b'', stderr=stderr)
                with self.assertRaises(ValueError):
                    self.verify(fixture, git_probe=probe)
                self.assertFalse((self.root / 'verified').exists())
                self.assertEqual(fixture.downloads, [])

    def test_output_path_replacement_during_download_preserves_unowned_directory_and_symlink(self):
        for replacement_kind in ('directory', 'symlink'):
            for download_raises in (False, True):
                with self.subTest(replacement_kind=replacement_kind, download_raises=download_raises):
                    location = self.root / f'{replacement_kind}-{download_raises}'
                    location.mkdir()
                    output = location / 'verified'
                    moved = location / 'moved-owned-stage'
                    target = location / 'replacement-target' if replacement_kind == 'symlink' else output
                    fixture = GithubFixture()
                    def replace_path(_destination):
                        output.rename(moved)
                        target.mkdir()
                        (target / 'keep').write_bytes(b'Unowned replacement sentinel')
                        if replacement_kind == 'symlink':
                            output.symlink_to(target, target_is_directory=True)
                    fixture.on_download = replace_path
                    if download_raises:
                        fixture.download_error = OSError('Synthetic failure after directory substitution')
                    with patch.object(artifact.shutil, 'rmtree', side_effect=AssertionError('Failure must never recursively remove a pathname')) as recursive:
                        with self.assertRaises((ValueError, OSError)):
                            self.verify(fixture, output)
                        recursive.assert_not_called()
                    self.assertEqual((target / 'keep').read_bytes(), b'Unowned replacement sentinel')
                    self.assertEqual({path.name for path in target.iterdir()}, {'keep'})
                    self.assertEqual(output.is_symlink(), replacement_kind == 'symlink')
                    self.assertFalse((target / 'verification.json').exists())
                    self.assertTrue((moved / 'UNQUALIFIED').is_file(), 'Held directory must be marked without following replacement')
                    self.assertEqual(self.sentinel.read_bytes(), b'Unrelated data must survive failures')

    def test_failed_owned_stage_is_retained_and_marked_without_recursive_cleanup(self):
        self.fixture.manifest['unexpected'] = 'closed-schema rejection'
        self.fixture.repack()
        with patch.object(artifact.shutil, 'rmtree', side_effect=AssertionError('Failure must not delete a directory tree')) as recursive:
            self.rejected()
            recursive.assert_not_called()
        output = self.root / 'rejected-001'
        self.assertTrue((output / 'download.zip').is_file())
        self.assertTrue((output / 'UNQUALIFIED').is_file())
        self.assertFalse((output / 'verification.json').exists())

    def test_huge_raw_pax_or_gnu_metadata_rejects_before_tarfile_parser_allocation(self):
        content = b'comment=' + b'x' * (2 * 1024 * 1024) + b'\n'
        record_length = len(content) + 2
        while len(str(record_length)) + 1 + len(content) != record_length:
            record_length = len(str(record_length)) + 1 + len(content)
        pax = str(record_length).encode() + b' ' + content
        for kind, body, include_body in ((tarfile.XHDTYPE, pax, True),
                                         (tarfile.GNUTYPE_LONGNAME, b'x' * (2 * 1024 * 1024) + b'\0', True),
                                         (tarfile.XHDTYPE, pax, False)):
            with self.subTest(kind=kind, include_body=include_body):
                fixture = GithubFixture()
                header = tarfile.TarInfo('././@PaxHeader' if kind == tarfile.XHDTYPE else '././@LongLink')
                header.type = kind
                header.size = len(body)
                raw = header.tobuf(format=tarfile.USTAR_FORMAT)
                if include_body:
                    raw += body + b'\0' * (-len(body) % 512)
                fixture.image = raw + b'\0' * 1024
                fixture.manifest['archive'].update(size=len(fixture.image), sha256=hashed(fixture.image))
                fixture.repack()
                with patch.object(artifact.tarfile, 'open', side_effect=AssertionError('Oversized metadata reached allocating tarfile parser')):
                    self.rejected(fixture)

    def test_pax_framing_overrides_and_all_gnu_extensions_fail_before_allocating_parser(self):
        gnu = tarfile.TarInfo('././@LongLink')
        gnu.type = tarfile.GNUTYPE_LONGNAME
        gnu.size = 2 * 1024 * 1024
        hidden_extension = pax_header_bytes({'size': '0'}) + gnu.tobuf(format=tarfile.USTAR_FORMAT) \
            + b'x' * gnu.size + b'\0' * 1024
        cases = [('pax-size-hides-gnu', hidden_extension)]
        for key in ('size', 'path', 'linkpath', 'GNU.sparse.size', 'GNU.sparse.map'):
            cases.append((key, pax_header_bytes({key: '0'}) + self.fixture.image))
        for kind in (tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_LONGLINK, tarfile.GNUTYPE_SPARSE):
            header = tarfile.TarInfo('././@GnuExtension')
            header.type = kind
            cases.append((kind, header.tobuf(format=tarfile.USTAR_FORMAT) + self.fixture.image))
        for case, raw in cases:
            with self.subTest(case=case):
                fixture = GithubFixture()
                fixture.image = raw
                fixture.manifest['archive'].update(size=len(raw), sha256=hashed(raw))
                fixture.repack()
                with patch.object(artifact.tarfile, 'open', side_effect=AssertionError('Unsafe semantic header reached tarfile parser')):
                    self.rejected(fixture)
        positive = GithubFixture()
        positive.image = pax_header_bytes({'mtime': '0', 'atime': '0', 'ctime': '0', 'comment': 'framing-neutral'}) + positive.image
        positive.manifest['archive'].update(size=len(positive.image), sha256=hashed(positive.image))
        positive.repack()
        receipt = self.verify(positive)
        self.assertFalse(receipt['imageLoaded'])

    def test_solaris_pax_override_and_nonempty_directory_reject_before_tarfile_parser(self):
        gnu = tarfile.TarInfo('././@LongLink')
        gnu.type = tarfile.GNUTYPE_LONGNAME
        gnu.size = 2 * 1024 * 1024
        hidden = gnu.tobuf(format=tarfile.USTAR_FORMAT) + b'x' * (gnu.size - 1) + b'\0'
        carrier = tarfile.TarInfo('carrier')
        carrier.size = len(hidden)
        # A raw scanner sees ordinary carrier data, while tarfile's Solaris PAX
        # size override makes the embedded GNU extension the next parsed header.
        solaris = pax_header_bytes({'size': '0'}, kind=b'X') \
            + carrier.tobuf(format=tarfile.USTAR_FORMAT) + hidden + b'\0' * 1024
        directory = tarfile.TarInfo('directory/')
        directory.type = tarfile.DIRTYPE
        directory.size = 512
        nonempty_directory = directory.tobuf(format=tarfile.USTAR_FORMAT) + b'\0' * 512 + self.fixture.image
        directory.type = tarfile.AREGTYPE
        legacy_directory = directory.tobuf(format=tarfile.USTAR_FORMAT) + b'\0' * 512 + self.fixture.image
        for case, raw in (('solaris-hidden-gnu', solaris), ('nonempty-directory', nonempty_directory),
                          ('legacy-directory-framing', legacy_directory)):
            with self.subTest(case=case):
                fixture = GithubFixture()
                fixture.image = raw
                fixture.manifest['archive'].update(size=len(raw), sha256=hashed(raw))
                fixture.repack()
                with patch.object(artifact.tarfile, 'open', side_effect=AssertionError('Unsafe raw framing reached tarfile parser')):
                    self.rejected(fixture)

    def test_missing_or_malformed_authenticated_digest_rejects_before_download(self):
        for digest in (None, 'f' * 64, 'sha256:not-a-digest'):
            with self.subTest(digest=digest):
                fixture = GithubFixture()
                fixture.records[fixture.artifact_route]['digest'] = digest
                self.rejected(fixture)
                self.assertEqual(fixture.downloads, [])

    def test_expired_artifact_flag_and_expired_timestamp_both_reject(self):
        for changes in ({'expired': True}, {'expires_at': '2000-01-01T00:00:00Z'}):
            with self.subTest(changes=changes):
                fixture = GithubFixture()
                fixture.records[fixture.artifact_route].update(changes)
                self.rejected(fixture)
                self.assertEqual(fixture.downloads, [])

    def test_wrong_repository_artifact_or_run_association_rejects(self):
        for field, value in (('id', 101), ('repository_id', 99), ('head_repository_id', 99)):
            with self.subTest(field=field):
                fixture = GithubFixture()
                fixture.records[fixture.artifact_route]['workflow_run'][field] = value
                self.rejected(fixture)
        self.fixture.records[f'repos/{REPOSITORY}']['full_name'] = 'other/repository'
        self.rejected()

    def test_wrong_or_unsuccessful_workflow_attempt_rejects(self):
        for field, value in (('id', 101), ('run_attempt', 1), ('path', '.github/workflows/other.yml'),
                             ('event', 'push'), ('status', 'in_progress'), ('conclusion', 'failure')):
            with self.subTest(field=field):
                fixture = GithubFixture()
                fixture.records[fixture.run_route][field] = value
                self.rejected(fixture)
                self.assertEqual(fixture.downloads, [])

    def test_ambiguous_or_additional_jobs_do_not_establish_unique_producer(self):
        for duplicate in (True, False):
            with self.subTest(duplicate=duplicate):
                fixture = GithubFixture()
                job = copy.deepcopy(fixture.records[fixture.jobs_route]['jobs'][0])
                job['id'] = 111
                if not duplicate:
                    job['name'] = 'unreviewed-uploader'
                fixture.records[fixture.jobs_route]['jobs'].append(job)
                self.rejected(fixture)

    def test_missing_failed_wrong_source_or_manifest_named_job_rejects(self):
        for field, value in (('name', 'other-job'), ('run_id', 101), ('head_sha', BASE),
                             ('status', 'queued'), ('conclusion', 'cancelled'), ('id', 111)):
            with self.subTest(field=field):
                fixture = GithubFixture()
                fixture.records[fixture.jobs_route]['jobs'][0][field] = value
                self.rejected(fixture)
        self.fixture.records[self.fixture.jobs_route]['jobs'] = []
        self.rejected()

    def test_authenticated_head_and_synthetic_merge_parents_are_checked_independently(self):
        for target in ('run-head', 'artifact-head', 'parents', 'commit-sha', 'pr-number'):
            with self.subTest(target=target):
                fixture = GithubFixture()
                if target == 'run-head':
                    fixture.records[fixture.run_route]['head_sha'] = BASE
                elif target == 'artifact-head':
                    fixture.records[fixture.artifact_route]['workflow_run']['head_sha'] = BASE
                elif target == 'parents':
                    fixture.records[fixture.commit_route]['parents'].reverse()
                elif target == 'commit-sha':
                    fixture.records[fixture.commit_route]['sha'] = HEAD
                else:
                    fixture.records[fixture.run_route]['pull_requests'] = [{'number': 56}]
                self.rejected(fixture)

    def test_manifest_cannot_choose_another_built_revision_or_ci_identity(self):
        for target in ('builtRevision', 'runId', 'attempt', 'workflowId', 'jobId'):
            with self.subTest(target=target):
                fixture = GithubFixture()
                if target == 'builtRevision':
                    fixture.manifest['source']['builtRevision'] = HEAD
                    fixture.manifest['context']['sourceRevision'] = HEAD
                else:
                    fixture.manifest['ci'][target] += 1
                fixture.repack()
                self.rejected(fixture)

    def test_authenticated_committed_source_hash_mismatch_rejects(self):
        self.fixture.source_files['pnpm-lock.yaml'] = b'changed authenticated lockfile\n'
        self.rejected()

    def test_unreviewed_workflow_uploader_or_job_shape_rejects(self):
        for suffix in (f'      - uses: {UPLOAD}\n', '  unreviewed-job:\n    steps: []\n'):
            with self.subTest(suffix=suffix):
                fixture = GithubFixture()
                fixture.source_files[WORKFLOW] += suffix.encode()
                self.rejected(fixture)

    def test_duplicate_manifest_json_keys_are_rejected_after_authenticating_outer_bytes(self):
        raw = encoded(self.fixture.manifest)
        self.fixture.repack(manifest_bytes=b'{"schemaVersion":1,' + raw[1:])
        self.rejected()

    def test_extra_duplicate_traversal_and_backslash_zip_members_reject_without_extraction(self):
        valid = [('manifest.json', encoded(self.fixture.manifest)), ('runtime-image.tar', self.fixture.image)]
        cases = [valid + [('unexpected.txt', b'no')], valid + [('manifest.json', b'{}')],
                 [('../escape.json', valid[0][1]), valid[1]],
                 [('..\\escape.json', valid[0][1]), valid[1]],
                 [('/absolute.json', valid[0][1]), valid[1]]]
        for index, entries in enumerate(cases):
            with self.subTest(index=index):
                fixture = GithubFixture()
                fixture.repack(entries=entries)
                self.rejected(fixture)
        self.assertFalse((self.root / 'escape.json').exists())

    def test_zip_symlink_and_directory_payload_members_reject(self):
        for mode in (stat.S_IFLNK | 0o777, stat.S_IFDIR | 0o700):
            with self.subTest(mode=mode):
                fixture = GithubFixture()
                link = zipfile.ZipInfo('runtime-image.tar')
                link.create_system = 3
                link.external_attr = mode << 16
                fixture.repack(entries=[('manifest.json', encoded(fixture.manifest)), (link, b'../unrelated.txt')])
                self.rejected(fixture)

    def test_oversized_metadata_declared_payload_and_compression_bomb_reject(self):
        fixture = GithubFixture()
        fixture.repack(manifest_bytes=b'x' * (artifact.MAX_MANIFEST + 1))
        self.rejected(fixture)
        fixture = GithubFixture()
        data = bytearray(fixture.zip_bytes)
        start = data.index(b'PK\x01\x02')
        second = data.index(b'PK\x01\x02', start + 4)
        struct.pack_into('<I', data, second + 24, artifact.MAX_ARCHIVE + 1)
        fixture.authenticate_outer(bytes(data))
        self.rejected(fixture)
        fixture = GithubFixture()
        fixture.repack(image_bytes=b'\0' * (2 * 1024 * 1024), compression=zipfile.ZIP_DEFLATED)
        self.rejected(fixture)

    def test_inner_archive_tamper_rejects_with_correct_authenticated_outer_digest(self):
        self.fixture.repack(image_bytes=self.fixture.image + b'changed inner payload')
        self.rejected()

    def test_config_digest_and_image_platform_or_user_are_not_manifest_assertions(self):
        fixture = GithubFixture()
        fixture.manifest['image']['configId'] = 'sha256:' + 'f' * 64
        fixture.repack()
        self.rejected(fixture)
        for options in ({'user': '0:0'}, {'user': '1000:0'}, {'architecture': 'arm64'}, {'system': 'windows'}):
            with self.subTest(options=options):
                fixture = GithubFixture()
                fixture.replace_image(**options)
                self.rejected(fixture)

    def test_layer_absence_digest_corruption_and_incomplete_closure_reject(self):
        for option in ('missing_layer', 'corrupt_layer', 'missing_diff'):
            with self.subTest(option=option):
                fixture = GithubFixture()
                fixture.replace_image(**{option: True})
                self.rejected(fixture)

    def test_oci_index_engine_identity_accepts_attestation_and_gzip_without_conflating_config(self):
        for compressed in (False, True):
            with self.subTest(compressed=compressed):
                fixture = GithubFixture()
                identities = fixture.replace_oci_image(attestation=True, compressed=compressed)
                self.assertNotEqual(identities['indexId'], identities['configId'])
                self.assertNotEqual(identities['manifestId'], identities['configId'])
                output = self.root / ('oci-gzip' if compressed else 'oci-plain')
                receipt = self.verify(fixture, output)
                self.assertEqual(receipt['imageConfigId'], identities['configId'])
                self.assertEqual(receipt['imageEngineId'], identities['indexId'])
                self.assertEqual(receipt['engineIdentityKind'], 'index-sha256')
                staged = json.loads((output / 'manifest.json').read_bytes())
                self.assertEqual(staged['image']['engineId'], identities['indexId'])
                self.assertEqual(staged['image']['engineIdentityKind'], 'index-sha256')
                self.assertEqual((output / 'runtime-image.tar').read_bytes(), fixture.image)

    def test_oci_platform_manifest_engine_identity_is_bound_to_its_actual_config(self):
        identities = self.fixture.replace_oci_image(engine_kind='manifest-sha256')
        receipt = self.verify()
        self.assertNotEqual(identities['manifestId'], identities['configId'])
        self.assertEqual(receipt['imageConfigId'], identities['configId'])
        self.assertEqual(receipt['imageEngineId'], identities['manifestId'])
        self.assertEqual(receipt['engineIdentityKind'], 'manifest-sha256')
        staged = json.loads((self.root / 'verified/manifest.json').read_bytes())
        self.assertEqual(staged['image']['engineId'], identities['manifestId'])
        self.assertEqual(staged['image']['engineIdentityKind'], 'manifest-sha256')

    def test_oci_manifest_and_image_descriptors_refuse_case_variants(self):
        for field_at in ('manifest', 'config', 'layer', 'config-document',
                         'runtime-config', 'rootfs', 'history', 'healthcheck'):
            with self.subTest(field_at=field_at):
                fixture = GithubFixture()
                fixture.replace_oci_image(invalid_field_at=field_at)
                self.rejected(fixture)

    def test_oci_index_with_root_runtime_before_good_runtime_is_ambiguous_and_rejected(self):
        identities = self.fixture.replace_oci_image(root_first=True)
        self.assertNotEqual(identities['rootRuntimeId'], identities['manifestId'])
        self.rejected()

    def test_oci_descriptor_platform_must_agree_with_runnable_config(self):
        for platform in ({'architecture': 'arm64', 'os': 'linux'},
                         {'architecture': 'amd64', 'os': 'windows'},
                         {'architecture': 'unknown', 'os': 'unknown'}):
            with self.subTest(platform=platform):
                fixture = GithubFixture()
                fixture.replace_oci_image(descriptor_platform=platform)
                self.rejected(fixture)

    def test_cached_runtime_descriptor_revalidates_each_reference_platform(self):
        positive = GithubFixture()
        positive.replace_oci_image(cached_reference='runtime-valid')
        self.assertFalse(self.verify(positive)['imageLoaded'])
        invalid = GithubFixture()
        invalid.replace_oci_image(cached_reference='runtime-platform')
        self.rejected(invalid)

    def test_cached_attestation_descriptor_revalidates_marker_and_platform(self):
        positive = GithubFixture()
        positive.replace_oci_image(attestation=True, cached_reference='attestation-valid')
        self.assertFalse(self.verify(positive)['imageLoaded'])
        for case in ('attestation-marker', 'attestation-platform'):
            with self.subTest(case=case):
                fixture = GithubFixture()
                fixture.replace_oci_image(attestation=True, cached_reference=case)
                self.rejected(fixture)

    def test_oci_wrong_engine_kind_unrelated_digest_attestation_or_crossed_config_reject(self):
        for target in ('kind', 'absent-engine', 'attestation', 'crossed-config'):
            with self.subTest(target=target):
                fixture = GithubFixture()
                identities = fixture.replace_oci_image(attestation=True, crossed_config=target == 'crossed-config')
                if target == 'kind':
                    fixture.manifest['image']['engineIdentityKind'] = 'manifest-sha256'
                elif target == 'absent-engine':
                    fixture.manifest['image']['engineId'] = 'sha256:' + 'f' * 64
                elif target == 'attestation':
                    fixture.manifest['image'].update(engineId=identities['attestationId'], engineIdentityKind='manifest-sha256')
                fixture.repack()
                self.rejected(fixture)

    def test_oci_missing_or_corrupt_referenced_graph_nodes_reject(self):
        for key, corruption in (('indexId', False), ('manifestId', False), ('configId', False),
                                ('layerId', False), ('attestationId', False), ('manifestId', True), ('layerId', True)):
            with self.subTest(key=key, corruption=corruption):
                fixture = GithubFixture()
                identities = fixture.replace_oci_image(attestation=True)
                path = 'blobs/sha256/' + identities[key][7:]
                def damage(entries):
                    return [(name, data + b'corruption' if name == path else data) for name, data in entries
                            if corruption or name != path]
                fixture.rewrite_image_members(damage)
                self.rejected(fixture)

    def test_oci_compressed_layer_diff_id_must_hash_decompressed_content(self):
        self.fixture.replace_oci_image(compressed=True, wrong_diff=True)
        self.rejected()

    def test_missing_failed_skipped_or_false_qualification_receipts_reject(self):
        for target in ('missing', 'failed', 'skipped', 'zero-tests', 'http-failure', 'ingress-failure', 'reload-failure'):
            with self.subTest(target=target):
                fixture = GithubFixture()
                proof = fixture.manifest['qualifications']
                if target == 'missing':
                    del proof['offline']
                elif target == 'failed':
                    proof['http']['counts']['failed'] = 1
                elif target == 'skipped':
                    proof['preparation']['skipped'] = 1
                elif target == 'zero-tests':
                    proof['preparation'].update(tests=0, passed=0)
                elif target == 'http-failure':
                    proof['http']['result'] = 'failed'
                elif target == 'ingress-failure':
                    proof['ingress']['strictTls'] = False
                else:
                    proof['exportReload']['imageRecordRemoved'] = False
                fixture.repack()
                self.rejected(fixture)

    def test_closed_schema_and_integer_fields_reject_extra_keys_and_boolean_numbers(self):
        for target in ('extra', 'boolean-count', 'boolean-version', 'boolean-ports'):
            with self.subTest(target=target):
                fixture = GithubFixture()
                if target == 'extra':
                    fixture.manifest['privateOrigin'] = 'https://private.invalid'
                elif target == 'boolean-count':
                    fixture.manifest['qualifications']['preparation']['skipped'] = False
                elif target == 'boolean-version':
                    fixture.expected['schemaVersion'] = True
                else:
                    fixture.manifest['qualifications']['entrypoints']['publishedPorts'] = False
                fixture.repack()
                self.rejected(fixture)

    def test_download_failures_are_bounded_and_retain_owned_staging(self):
        self.fixture.download_error = OSError('synthetic interrupted download')
        self.rejected()
        binaries = self.root / 'bin'
        binaries.mkdir()
        gh = binaries / 'gh'
        payload = b'bounded synthetic GitHub download' * 4
        gh.write_text(f'#!{sys.executable}\nimport os\nos.write(1,{payload!r})\n')
        gh.chmod(0o755)
        with patch.dict(os.environ, {'PATH': str(binaries) + os.pathsep + os.environ.get('PATH', '')}):
            destination = self.root / 'small-download.zip'
            artifact.Github().download(700, destination, len(payload))
            self.assertEqual(destination.read_bytes(), payload)
            limited = self.root / 'limited-download.zip'
            with self.assertRaises((ValueError, OSError, subprocess.SubprocessError)):
                artifact.Github().download(700, limited, 16)
            self.assertLessEqual(limited.stat().st_size, 16, 'Excess subprocess bytes must not reach disk')
            with self.assertRaises(FileExistsError):
                artifact.Github().download(700, destination, len(payload))
            self.assertEqual(destination.read_bytes(), payload)
        self.assertEqual(self.sentinel.read_bytes(), b'Unrelated data must survive failures')

    def test_download_allows_slow_progress_but_kills_its_child_at_the_total_deadline(self):
        binaries = self.root / 'deadline-bin'
        binaries.mkdir()
        gh = binaries / 'gh'
        gh.write_text(f'#!{sys.executable}\nimport os\nos.write(1,b"bounded-progress")\n')
        gh.chmod(0o755)
        environment = {'PATH': str(binaries) + os.pathsep + os.environ.get('PATH', '')}
        clock = iter((0, 181))
        with patch.dict(os.environ, environment), patch.object(artifact.time, 'monotonic', side_effect=lambda: next(clock, 181)):
            destination = self.root / 'slow-progress.zip'
            artifact.Github().download(700, destination, 32)
            self.assertEqual(destination.read_bytes(), b'bounded-progress')
        gh.write_text(f'#!{sys.executable}\nimport time\ntime.sleep(30)\n')
        actual_popen = subprocess.Popen
        children = []
        def capture(*args, **kwargs):
            child = actual_popen(*args, **kwargs)
            children.append(child)
            return child
        clock = iter((0, 601))
        with patch.dict(os.environ, environment), patch.object(artifact.subprocess, 'Popen', side_effect=capture), \
                patch.object(artifact.time, 'monotonic', side_effect=lambda: next(clock, 601)):
            with self.assertRaisesRegex(ValueError, 'deadline'):
                artifact.Github().download(700, self.root / 'expired-download.zip', 32)
        self.assertEqual(len(children), 1)
        self.assertIsNotNone(children[0].poll(), 'The owned downloader must be stopped at the total deadline')

    def test_tap_proof_rejects_missing_duplicate_failed_skipped_and_cancelled_tests(self):
        valid = '# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'
        self.assertEqual(artifact.tap_counts(valid), {'tests': 3, 'passed': 3, 'failed': 0, 'skipped': 0})
        for bad in (valid.replace('# pass 3\n', ''), valid + '# pass 3\n',
                    valid.replace('# fail 0', '# fail 1'), valid.replace('# skipped 0', '# skipped 1'),
                    valid.replace('# cancelled 0', '# cancelled 1'), valid.replace('# todo 0', '# todo 1')):
            with self.subTest(summary=bad), self.assertRaises(ValueError):
                artifact.tap_counts(bad)

    def test_export_rejects_unowned_execution_before_any_docker_or_output_mutation(self):
        with patch.dict('os.environ', {}, clear=True), \
                patch.object(artifact, 'run', side_effect=AssertionError('Unowned export must not execute')):
            with self.assertRaises(ValueError):
                artifact.export_fixture('dailylogger-runtime:proof', self.root, self.root / 'export', self.fixture)
        self.assertFalse((self.root / 'export').exists())
        self.assertEqual(self.fixture.calls, [])


if __name__ == '__main__':
    unittest.main()
