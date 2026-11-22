"""Fixture-only image delivery. Authentication policy and archive framing have one owner."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import gzip
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import stat
import subprocess
import sys
import tarfile
import time
import zipfile

REPOSITORY = 'ojfbot/daily-logger'
WORKFLOW = '.github/workflows/service-runtime.yml'
JOB = 'runtime-image'
RELEASE_WORKFLOW = '.github/workflows/service-release-candidate.yml'
RELEASE_JOB = 'release-candidate'
OWNED_IMAGE = 'dailylogger-runtime:proof'
UPLOAD_ACTION = 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'
SOURCE_ROOT = Path(__file__).resolve().parents[3]
SOURCE_FILES = ('pnpm-lock.yaml', 'apps/service/runtime/Dockerfile',
                'apps/service/runtime/compose.yaml', 'apps/service/runtime/prepare-ingress.ts', WORKFLOW)
RELEASE_SOURCE_FILES = SOURCE_FILES[:-1] + (RELEASE_WORKFLOW,)
MAX_ARCHIVE = 2 * 1024 ** 3
MAX_MANIFEST = 128 * 1024
DOWNLOAD_TIMEOUT_SECONDS = 600
SHA = re.compile(r'[0-9a-f]{40}\Z')
HASH = re.compile(r'[0-9a-f]{64}\Z')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def object_keys(value, keys):
    require(type(value) is dict and set(value) == set(keys), 'Unexpected JSON shape')
    return value


def positive(value, maximum=MAX_ARCHIVE):
    require(type(value) is int and 0 < value <= maximum, 'Invalid positive integer')
    return value


def digest(value, pattern=HASH):
    require(type(value) is str and pattern.fullmatch(value) is not None, 'Invalid digest')
    return value


def exact(value, expected):
    return json.dumps(value, sort_keys=True) == json.dumps(expected, sort_keys=True)


RELEASE_VERSION = re.compile(r'v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)-rc\.(?:0|[1-9][0-9]*)\Z')

FIXTURE_PROFILE = {
    'workflow': WORKFLOW,
    'job': JOB,
    'artifact_prefix': 'dailylogger-fixture',
    'manifest_purpose': 'disposable-fixture-candidate',
    'receipt_purpose': 'verified-disposable-fixture-candidate',
    'source_files': SOURCE_FILES,
}
RELEASE_PROFILE = {
    'workflow': RELEASE_WORKFLOW,
    'job': RELEASE_JOB,
    'artifact_prefix': 'dailylogger-release-candidate',
    'manifest_purpose': 'release-candidate',
    'receipt_purpose': 'verified-release-candidate',
    'source_files': RELEASE_SOURCE_FILES,
}


def release_version(value):
    require(type(value) is str and RELEASE_VERSION.fullmatch(value) is not None, 'Invalid release candidate version')
    return value


def release_claim(value):
    object_keys(value, ('version', 'candidate'))
    release_version(value['version'])
    require(value['candidate'] is True, 'Release artifact must remain a candidate')
    return value


def profile_for_expected(value):
    require(type(value) is dict, 'Unexpected expectation shape')
    return RELEASE_PROFILE if 'release' in value else FIXTURE_PROFILE


def validate_source(profile, source):
    if profile is RELEASE_PROFILE:
        require(source['event'] == 'workflow_dispatch' and source['ref'] == 'refs/heads/main'
                and source['pullRequest'] is None, 'Release candidates require a manual main checkout')
    return source


def json_bytes(data, *, case_insensitive_keys=False):
    def unique(pairs):
        result = {}
        spellings = set()
        for key, value in pairs:
            spelling = key.casefold() if case_insensitive_keys else key
            require(spelling not in spellings, 'Duplicate JSON key')
            spellings.add(spelling)
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=unique, parse_constant=lambda _: require(False, 'Invalid JSON number'))


def canonical_image_fields(value, required, optional=()):
    require(type(value) is dict and set(required) <= value.keys() <= set(required) | set(optional),
            'Unexpected image configuration fields')


def parse_image_config(data):
    value = json_bytes(data, case_insensitive_keys=True)
    canonical_image_fields(value, ('architecture', 'os', 'rootfs'), (
        'config', 'created', 'author', 'history', 'variant', 'os.version', 'os.features',
        'container', 'container_config', 'docker_version', 'comment', 'parent',
        'moby.buildkit.cache.v0', 'moby.buildkit.buildinfo.v1',
    ))
    object_keys(value['rootfs'], ('type', 'diff_ids'))
    for section in ('config', 'container_config'):
        if section not in value:
            continue
        config = value[section]
        canonical_image_fields(config, (), (
            'User', 'ExposedPorts', 'Env', 'Entrypoint', 'Cmd', 'Volumes', 'WorkingDir',
            'Labels', 'StopSignal', 'ArgsEscaped', 'Healthcheck', 'OnBuild', 'Shell',
            'Hostname', 'Domainname', 'AttachStdin', 'AttachStdout', 'AttachStderr',
            'Tty', 'OpenStdin', 'StdinOnce', 'Image', 'NetworkDisabled', 'MacAddress', 'StopTimeout',
        ))
        if config.get('Healthcheck') is not None:
            canonical_image_fields(config['Healthcheck'], (),
                                   ('Test', 'Interval', 'Timeout', 'StartPeriod', 'StartInterval', 'Retries'))
        for name in ('ExposedPorts', 'Volumes'):
            entries = config.get(name)
            if entries is not None:
                require(type(entries) is dict and all(type(entry) is dict and not entry for entry in entries.values()),
                        'Invalid image resource declarations')
    history = value.get('history', [])
    require(type(history) is list, 'Invalid image history')
    for entry in history:
        canonical_image_fields(entry, (), ('created', 'created_by', 'author', 'comment', 'empty_layer'))
    return value


def sha256_stream(stream):
    result = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        result.update(chunk)
    return result.hexdigest()


def parse_source(value):
    object_keys(value, ('builtRevision', 'event', 'ref', 'pullRequest'))
    digest(value['builtRevision'], SHA)
    require(value['event'] in ('pull_request', 'workflow_dispatch'), 'Unsupported fixture event')
    if value['event'] == 'pull_request':
        pr = object_keys(value['pullRequest'], ('number', 'head', 'base'))
        positive(pr['number']); digest(pr['head'], SHA); digest(pr['base'], SHA)
        require(value['ref'] == f"refs/pull/{pr['number']}/merge", 'Invalid PR merge ref')
    else:
        require(value['pullRequest'] is None and type(value['ref']) is str
                and re.fullmatch(r'refs/heads/[A-Za-z0-9._/-]{1,160}', value['ref']) is not None,
                'Manual fixture builds require a branch ref')
    return value


def parse_expected(value):
    profile = profile_for_expected(value)
    keys = ('schemaVersion', 'artifactId', 'runId', 'attempt', 'source')
    object_keys(value, keys + (('release',) if profile is RELEASE_PROFILE else ()))
    require(type(value['schemaVersion']) is int and value['schemaVersion'] == 1, 'Unsupported expectation schema')
    for key in ('artifactId', 'runId', 'attempt'):
        positive(value[key], 10 ** 16)
    validate_source(profile, parse_source(value['source']))
    if profile is RELEASE_PROFILE:
        release_claim(value['release'])
    return value


def parse_context(value):
    object_keys(value, ('schemaVersion', 'sourceRevision', 'fixtureCommit', 'articleSha256',
                        'actionsSha256', 'configuredRemotes', 'alternateObjectStores'))
    require(value['schemaVersion'] == 1 and type(value['schemaVersion']) is int, 'Invalid context version')
    digest(value['sourceRevision'], SHA); digest(value['fixtureCommit'], SHA)
    digest(value['articleSha256']); digest(value['actionsSha256'])
    require(type(value['configuredRemotes']) is int and value['configuredRemotes'] == 0
            and type(value['alternateObjectStores']) is int and value['alternateObjectStores'] == 0, 'Unsafe fixture context')
    return value


def parse_counts(value):
    object_keys(value, ('tests', 'passed', 'failed', 'skipped'))
    positive(value['tests'], 10000)
    require(type(value['passed']) is int and value['passed'] == value['tests']
            and type(value['failed']) is int and value['failed'] == 0
            and type(value['skipped']) is int and value['skipped'] == 0, 'Incomplete qualification tests')


def parse_proofs(value):
    object_keys(value, ('preparation', 'offline', 'entrypoints', 'http', 'ingress', 'exportReload'))
    parse_counts(value['preparation'])
    offline = object_keys(value['offline'], ('proof', 'node', 'git', 'uid', 'fixtureCommit', 'nativeSqlite'))
    require(offline['proof'] == 'offline-final-image' and type(offline['node']) is str
            and re.fullmatch(r'v24\.\d+\.\d+', offline['node']) is not None
            and type(offline['git']) is str and len(offline['git']) < 100
            and type(offline['uid']) is int and offline['uid'] == 1000
            and offline['nativeSqlite'] == 'passed', 'Invalid offline proof')
    digest(offline['fixtureCommit'], SHA)
    require(exact(value['entrypoints'], {'proof': 'production-entrypoints-and-cross-container-storage',
            'migration': 'explicit-and-repeatable', 'fixture': 'complete', 'shutdown': 'clean', 'publishedPorts': 0}),
            'Invalid production entrypoint proof')
    http = object_keys(value['http'], ('proof', 'result', 'realGithubLogin', 'counts'))
    require(http['proof'] == 'production-runtime-with-external-http-tests' and http['result'] == 'passed'
            and http['realGithubLogin'] == 'not-qualified', 'Invalid HTTP fixture proof')
    parse_counts(http['counts'])
    require(exact(value['ingress'], {'proof': 'private-tls-proxy', 'strictTls': True, 'defaultLoopback': True,
            'peerAcl': 'passed', 'hostPort': 'preserved', 'independentContainerRecreation': 'passed',
            'leafReplacement': 'passed', 'sessionsAndCommands': 'preserved', 'logout': 'revoked',
            'mutationForwardCount': 1, 'logCanaries': 'absent', 'realGithubLogin': 'not-qualified'}), 'Invalid TLS proof')
    require(exact(value['exportReload'], {'status': 'passed', 'imageRecordRemoved': True,
            'archiveClosure': 'passed', 'emptyLayerStore': False}), 'Invalid export/reload proof')


def parse_manifest(value, profile):
    keys = ('schemaVersion', 'purpose', 'repository', 'source', 'ci', 'image', 'archive',
            'context', 'sourceFileDigests', 'upstreamImages', 'qualifications')
    object_keys(value, keys + (('release',) if profile is RELEASE_PROFILE else ()))
    require(type(value['schemaVersion']) is int and value['schemaVersion'] == 1
            and value['purpose'] == profile['manifest_purpose'] and value['repository'] == REPOSITORY,
            'Unsupported artifact manifest')
    source = validate_source(profile, parse_source(value['source']))
    if profile is RELEASE_PROFILE:
        release_claim(value['release'])
    ci = object_keys(value['ci'], ('workflowPath', 'workflowId', 'runId', 'attempt', 'jobId', 'jobKey'))
    require(ci['workflowPath'] == profile['workflow'] and ci['jobKey'] == profile['job'], 'Wrong workflow policy')
    for key in ('workflowId', 'runId', 'attempt', 'jobId'):
        positive(ci[key], 10 ** 16)
    image = object_keys(value['image'], ('identityKind', 'configId', 'engineId', 'engineIdentityKind', 'platform', 'uid', 'gid'))
    require(image['identityKind'] == 'docker-config-sha256' and image['platform'] == 'linux/amd64'
            and type(image['uid']) is int and type(image['gid']) is int
            and image['uid'] == image['gid'] == 1000, 'Unsupported image identity')
    require(type(image['configId']) is str and image['configId'].startswith('sha256:'), 'Invalid image ID')
    digest(image['configId'][7:])
    require(type(image['engineId']) is str and image['engineId'].startswith('sha256:')
            and image['engineIdentityKind'] in ('config-sha256', 'manifest-sha256', 'index-sha256'), 'Invalid engine identity')
    digest(image['engineId'][7:])
    archive = object_keys(value['archive'], ('name', 'size', 'sha256'))
    require(archive['name'] == 'runtime-image.tar', 'Unexpected archive name')
    positive(archive['size']); digest(archive['sha256'])
    context = parse_context(value['context'])
    require(context['sourceRevision'] == source['builtRevision'], 'Context source mismatch')
    object_keys(value['sourceFileDigests'], profile['source_files'])
    for item in value['sourceFileDigests'].values():
        digest(item)
    object_keys(value['upstreamImages'], ('postgres', 'caddy'))
    for key, reference in value['upstreamImages'].items():
        require(type(reference) is str and re.fullmatch(key + r':[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}', reference) is not None,
                'Invalid upstream image pin')
    parse_proofs(value['qualifications'])
    require(value['qualifications']['offline']['fixtureCommit'] == context['fixtureCommit'], 'Fixture proof identity mismatch')
    return value


def run(args, *, binary=False, env=None, timeout=60, allow_failure=False, input_file=None, output_file=None):
    result = subprocess.run(args, cwd=SOURCE_ROOT, env=env, stdin=input_file,
                            stdout=output_file or subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode != 0 and not allow_failure and args[0] == 'pnpm':
        locations = sorted(set(re.findall(r'apps/service/(?:runtime|test)/[A-Za-z0-9_./-]+\.(?:mjs|ts|py):\d+(?::\d+)?',
                                           result.stderr.decode(errors='replace'))))
        print('Fixture proof source locations: ' + ', '.join(locations[:12]), file=sys.stderr)
        for line in result.stdout.decode(errors='replace').splitlines():
            if line.startswith('{"startupDiagnostic":'):
                print(line, file=sys.stderr)
    require(allow_failure or result.returncode == 0, 'Fixture command failed: ' + ' '.join(args[:2]))
    if output_file is not None:
        return None
    return result if allow_failure else result.stdout if binary else result.stdout.decode()


class Github:
    def get(self, route):
        require(route == f'repos/{REPOSITORY}' or route.startswith(f'repos/{REPOSITORY}/'), 'Unexpected GitHub route')
        data = run(['gh', 'api', '--hostname', 'github.com', '-H', 'Accept: application/vnd.github+json', route], binary=True)
        require(len(data) <= 4 * 1024 * 1024, 'GitHub response too large')
        return json_bytes(data)

    def download(self, artifact_id, destination, maximum=MAX_ARCHIVE):
        positive(maximum)
        if not hasattr(destination, 'write'):
            with Path(destination).open('xb') as output:
                return self.download(artifact_id, output, maximum)
        output = destination
        process = subprocess.Popen(['gh', 'api', '--hostname', 'github.com',
            f'repos/{REPOSITORY}/actions/artifacts/{artifact_id}/zip'],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            deadline = time.monotonic() + DOWNLOAD_TIMEOUT_SECONDS
            remaining = maximum
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while True:
                    budget = deadline - time.monotonic()
                    require(budget > 0, 'Artifact download deadline exceeded')
                    require(selector.select(budget), 'Artifact download deadline exceeded')
                    chunk = os.read(process.stdout.fileno(), min(1024 * 1024, remaining + 1))
                    if not chunk:
                        break
                    require(len(chunk) <= remaining, 'Artifact download exceeded authenticated size')
                    output.write(chunk)
                    remaining -= len(chunk)
            require(process.wait(timeout=max(deadline - time.monotonic(), 0.001)) == 0, 'Artifact download failed')
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()


def jobs_for(github, run_id, attempt):
    jobs = []
    for page in range(1, 11):
        response = github.get(f'repos/{REPOSITORY}/actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100&page={page}')
        require(type(response.get('jobs')) is list, 'Missing job evidence')
        jobs.extend(response['jobs'])
        if len(response['jobs']) < 100:
            return jobs
    raise ValueError('Too many workflow jobs')


def selected_job(github, run_id, attempt, completed, profile):
    jobs = jobs_for(github, run_id, attempt)
    matches = [job for job in jobs if job.get('name') == profile['job'] and job.get('run_id') == run_id]
    require(len(jobs) == len(matches) == 1, 'Artifact workflow must have one producer job')
    job = matches[0]
    positive(job.get('id'), 10 ** 16)
    if completed:
        require(job.get('status') == 'completed' and job.get('conclusion') == 'success', 'Producer job did not succeed')
    return job


def input_files(profile, read):
    values = {path: read(path) for path in profile['source_files']}
    workflow = values[profile['workflow']].decode()
    require(workflow.count('uses: ' + UPLOAD_ACTION) == 1
            and workflow.count('uses: actions/upload-artifact@') == 1, 'Single reviewed uploader required')
    jobs = workflow.split('\njobs:\n')
    require(len(jobs) == 2 and re.findall(r'^  ([a-z0-9-]+):$', jobs[1], re.M) == [profile['job']], 'Unexpected uploader workflow shape')
    if profile is RELEASE_PROFILE:
        require(workflow.count('workflow_dispatch:') == 1 and 'pull_request:' not in workflow and 'push:' not in workflow
                and '      release_version:' in workflow and "if: github.ref == 'refs/heads/main'" in workflow,
                'Release workflow must remain manual and main-only')
    postgres = re.findall(r'image: (postgres:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64})', values[SOURCE_FILES[2]].decode())
    caddy = re.findall(r"PROXY_IMAGE = '(caddy:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64})'", values[SOURCE_FILES[3]].decode())
    require(len(postgres) == len(caddy) == 1, 'Missing upstream pin')
    return {path: hashlib.sha256(data).hexdigest() for path, data in values.items()}, {'postgres': postgres[0], 'caddy': caddy[0]}


def github_evidence(expected, github):
    parse_expected(expected)
    profile = profile_for_expected(expected)
    source = expected['source']; run_id = expected['runId']; attempt = expected['attempt']
    repo = github.get(f'repos/{REPOSITORY}')
    require(repo.get('full_name') == REPOSITORY, 'Wrong repository evidence')
    record = github.get(f'repos/{REPOSITORY}/actions/artifacts/{expected["artifactId"]}')
    require(record.get('id') == expected['artifactId'] and record.get('expired') is False
            and record.get('name') == artifact_name(profile, run_id, attempt, expected.get('release')), 'Wrong or expired artifact')
    positive(record.get('size_in_bytes'))
    require(type(record.get('digest')) is str and record['digest'].startswith('sha256:'), 'Authenticated digest absent')
    digest(record['digest'][7:])
    try:
        expiry = datetime.fromisoformat(record['expires_at'].replace('Z', '+00:00'))
        require(expiry > datetime.now(timezone.utc), 'Artifact expired')
    except (KeyError, TypeError):
        raise ValueError('Invalid artifact expiry') from None
    association = record.get('workflow_run', {})
    require(association.get('id') == run_id and association.get('repository_id') == repo.get('id')
            and association.get('head_repository_id') == repo.get('id'), 'Wrong artifact repository/run association')
    workflow = github.get(f'repos/{REPOSITORY}/actions/runs/{run_id}/attempts/{attempt}')
    require(workflow.get('id') == run_id and workflow.get('run_attempt') == attempt
            and workflow.get('status') == 'completed' and workflow.get('conclusion') == 'success'
            and workflow.get('path') == profile['workflow'] and workflow.get('event') == source['event']
            and workflow.get('repository', {}).get('full_name') == REPOSITORY, 'Wrong or unsuccessful workflow attempt')
    if source['event'] == 'pull_request':
        pr = source['pullRequest']
        require(workflow.get('head_sha') == pr['head'] and association.get('head_sha') == pr['head'], 'Wrong PR head')
        require(any(item.get('number') == pr['number'] for item in workflow.get('pull_requests', [])), 'Wrong PR association')
        commit = github.get(f'repos/{REPOSITORY}/commits/{source["builtRevision"]}')
        require(commit.get('sha') == source['builtRevision'] and [item.get('sha') for item in commit.get('parents', [])]
                == [pr['base'], pr['head']], 'Synthetic merge parents mismatch')
    else:
        require(workflow.get('head_sha') == association.get('head_sha') == source['builtRevision']
                and source['ref'] == 'refs/heads/' + workflow.get('head_branch', ''), 'Wrong manual checkout/ref')
    job = selected_job(github, run_id, attempt, True, profile)
    require(job.get('head_sha') == workflow.get('head_sha'), 'Wrong producer job source')
    def read(path):
        item = github.get(f'repos/{REPOSITORY}/contents/{path}?ref={source["builtRevision"]}')
        require(item.get('type') == 'file' and item.get('encoding') == 'base64', 'Missing committed source input')
        return base64.b64decode(item['content'], validate=False)
    hashes, upstreams = input_files(profile, read)
    return {'artifact': record, 'workflow': workflow, 'job': job, 'sourceFileDigests': hashes, 'upstreamImages': upstreams}


def safe_name(name):
    return type(name) is str and name != '' and '\\' not in name and not name.startswith('/') \
        and all(part not in ('', '.', '..') for part in name.rstrip('/').split('/'))


def preflight_tar(stream):
    stream.seek(0, 2)
    length = stream.tell()
    require(0 < length <= MAX_ARCHIVE, 'Oversized image archive')
    offset = headers = extensions = 0
    while offset < length:
        stream.seek(offset)
        header = stream.read(512)
        require(len(header) == 512, 'Truncated tar header')
        if header == b'\0' * 512:
            break
        size = tarfile.nti(header[124:136])
        require(type(size) is int and 0 <= size <= MAX_ARCHIVE, 'Oversized tar member')
        headers += 1
        require(headers <= 20000, 'Too many tar headers')
        kind = header[156:157]
        require(kind in (b'0', b'5', b'x', b'g'), 'Unsupported outer tar record type')
        require(kind != b'5' or size == 0, 'Directory tar records must have no body')
        if kind in (b'x', b'g'):
            extensions += size
            require(size <= 64 * 1024 and extensions <= 1024 * 1024, 'Tar extension metadata exceeds budget')
            payload = stream.read(size)
            require(len(payload) == size, 'Truncated PAX metadata')
            position = 0
            while position < len(payload):
                separator = payload.find(b' ', position, position + 8)
                require(separator > position and payload[position:separator].isdigit(), 'Invalid PAX record length')
                record_size = int(payload[position:separator])
                end = position + record_size
                require(end <= len(payload) and end > separator + 3 and payload[end - 1:end] == b'\n', 'Invalid PAX record framing')
                key, equals, _value = payload[separator + 1:end - 1].partition(b'=')
                require(equals == b'=' and key in (b'mtime', b'atime', b'ctime', b'comment'), 'Layout-changing PAX metadata is unsupported')
                position = end
        offset += 512 + ((size + 511) // 512) * 512
        require(offset <= length, 'Truncated tar member')
    stream.seek(0)


def inspect_image_archive(stream):
    preflight_tar(stream)
    with tarfile.open(fileobj=stream, mode='r:') as archive:
        members = {}
        for member in archive:
            require(safe_name(member.name) and member.name not in members and (member.isfile() or member.isdir()), 'Unsafe image archive member')
            require(len(members) < 20000 and 0 <= member.size <= MAX_ARCHIVE, 'Oversized image archive')
            members[member.name] = member
        def read(name, maximum):
            require(safe_name(name) and name in members and members[name].isfile() and members[name].size <= maximum, 'Incomplete image archive')
            with archive.extractfile(members[name]) as stream:
                return stream.read(maximum + 1)
        records = json_bytes(read('manifest.json', MAX_MANIFEST), case_insensitive_keys=True)
        require(type(records) is list and len(records) == 1, 'Single-image Docker save required')
        record = object_keys(records[0], ('Config', 'RepoTags', 'Layers'))
        require(type(record['Layers']) is list and 0 < len(record['Layers']) < 200,
                'Unsupported Docker-save manifest')
        config = read(record.get('Config'), 4 * 1024 * 1024)
        config_id = 'sha256:' + hashlib.sha256(config).hexdigest()
        value = parse_image_config(config)
        require(value.get('os') == 'linux' and value.get('architecture') == 'amd64'
                and value.get('config', {}).get('User') == '1000:1000', 'Wrong image platform/user')
        layers = value.get('rootfs', {}).get('diff_ids')
        require(type(layers) is list and len(layers) == len(record['Layers']), 'Incomplete layer closure')
        decompressed = 0
        layer_hashes = {}
        def layer_diff(name):
            nonlocal decompressed
            require(safe_name(name) and name in members and members[name].isfile(), 'Missing image layer')
            if name in layer_hashes:
                return layer_hashes[name]
            result = hashlib.sha256()
            with archive.extractfile(members[name]) as raw:
                magic = raw.read(2)
                raw.seek(0)
                stream = gzip.GzipFile(fileobj=raw) if magic == b'\x1f\x8b' else raw
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    decompressed += len(chunk)
                    require(decompressed <= MAX_ARCHIVE * 2, 'Layer expansion exceeds verification budget')
                    result.update(chunk)
                if stream is not raw:
                    stream.close()
            layer_hashes[name] = 'sha256:' + result.hexdigest()
            return layer_hashes[name]
        for name, identity in zip(record['Layers'], layers):
            require(type(identity) is str and re.fullmatch(r'sha256:[0-9a-f]{64}', identity) is not None
                    and layer_diff(name) == identity, 'Image layer digest mismatch')
        engine_kinds = {config_id: 'config-sha256'}
        if 'index.json' in members:
            require(exact(json_bytes(read('oci-layout', MAX_MANIFEST)), {'imageLayoutVersion': '1.0.0'}), 'Unsupported OCI layout')
            verified = {}
            runtime_manifests = {}
            manifest_platforms = {}
            indexes = ('application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json')
            manifests = ('application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json')
            descriptor_keys = {'mediaType', 'digest', 'size'}

            def index_node(value):
                node = object_keys(value, ('schemaVersion', 'mediaType', 'manifests'))
                require(node['schemaVersion'] == 2 and node['mediaType'] in indexes and
                        type(node['manifests']) is list and 0 < len(node['manifests']) < 100, 'Unsupported image index')
                return node

            def reference_policy(item, media, runtime_members):
                annotations = item.get('annotations', {})
                require(type(annotations) is dict, 'Invalid descriptor annotations')
                marker = annotations.get('vnd.docker.reference.type')
                declared = item.get('platform')
                if declared is not None:
                    object_keys(declared, ('os', 'architecture'))
                if media in manifests:
                    platform = manifest_platforms[item['digest']]
                    require(declared is None or (type(declared) is dict
                            and (declared.get('os'), declared.get('architecture')) == platform), 'Descriptor platform disagrees with config')
                    require(marker == 'attestation-manifest' if platform == ('unknown', 'unknown') else marker is None,
                            'Attestation metadata disagrees with manifest content')
                else:
                    require(marker is None, 'Attestations must reference a manifest')
                    if declared is not None:
                        require(media in indexes and type(declared) is dict
                                and {runtime_manifests[member]['platform'] for member in runtime_members}
                                == {(declared.get('os'), declared.get('architecture'))}, 'Index reference platform disagrees with content')
            def descriptor(item, depth=0, *, leaf=False):
                optional = {'annotations'} if leaf else {'annotations', 'platform'}
                require(type(item) is dict and depth < 12 and
                        descriptor_keys <= item.keys() <= descriptor_keys | optional,
                        'Invalid image descriptor fields')
                identity = item.get('digest')
                require(type(identity) is str and re.fullmatch(r'sha256:[0-9a-f]{64}', identity) is not None,
                        'Unsupported image descriptor digest')
                name = 'blobs/sha256/' + identity[7:]
                require(name in members and members[name].isfile() and type(item.get('size')) is int
                        and members[name].size == item['size'], 'Incomplete descriptor closure')
                media = item.get('mediaType')
                if identity in verified:
                    previous_media, configs, runtime_members = verified[identity]
                    require(previous_media == media, 'Conflicting descriptor media type')
                    reference_policy(item, media, runtime_members)
                    return configs, runtime_members
                content_hash = hashlib.sha256()
                with archive.extractfile(members[name]) as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        content_hash.update(chunk)
                require('sha256:' + content_hash.hexdigest() == identity, 'Descriptor content digest mismatch')
                configs = set()
                runtime_members = set()
                if media in indexes:
                    node = index_node(json_bytes(read(name, MAX_MANIFEST), case_insensitive_keys=True))
                    for child in node['manifests']:
                        child_configs, child_members = descriptor(child, depth + 1)
                        configs.update(child_configs)
                        runtime_members.update(child_members)
                    if config_id in configs:
                        eligible = [runtime_manifests[member] for member in runtime_members
                                    if runtime_manifests[member]['platform'] == ('linux', 'amd64')]
                        require(len(eligible) == 1 and eligible[0]['config'] == config_id, 'Ambiguous runtime platform selection')
                        engine_kinds[identity] = 'index-sha256'
                elif media in manifests:
                    node = object_keys(json_bytes(read(name, MAX_MANIFEST), case_insensitive_keys=True),
                                       ('schemaVersion', 'mediaType', 'config', 'layers'))
                    require(node['schemaVersion'] == 2 and node['mediaType'] == media and
                            type(node['layers']) is list and len(node['layers']) < 200, 'Unsupported image manifest')
                    object_keys(node['config'], ('mediaType', 'digest', 'size'))
                    descriptor(node['config'], depth + 1, leaf=True)
                    for child in node['layers']:
                        descriptor(child, depth + 1, leaf=True)
                    configs.add(node['config']['digest'])
                    config_name = 'blobs/sha256/' + node['config']['digest'][7:]
                    config_value = parse_image_config(read(config_name, 4 * 1024 * 1024))
                    platform = (config_value.get('os'), config_value.get('architecture'))
                    manifest_platforms[identity] = platform
                    if platform != ('unknown', 'unknown'):
                        require(all(type(part) is str and part for part in platform), 'Missing runnable platform')
                        runtime_members.add(identity)
                        runtime_manifests[identity] = {'platform': platform, 'config': node['config']['digest']}
                    if config_id in configs:
                        require(len(node['layers']) == len(layers), 'Docker and OCI layer counts disagree')
                        for child, diff_id in zip(node['layers'], layers):
                            require(layer_diff('blobs/sha256/' + child['digest'][7:]) == diff_id,
                                    'Docker and OCI layer content disagree')
                        engine_kinds[identity] = 'manifest-sha256'
                reference_policy(item, media, runtime_members)
                verified[identity] = (media, configs, runtime_members)
                return configs, runtime_members
            root = index_node(json_bytes(read('index.json', MAX_MANIFEST), case_insensitive_keys=True))
            reachable = set()
            for item in root['manifests']:
                configs, _runtime_members = descriptor(item)
                reachable.update(configs)
            require(config_id in reachable, 'Config is absent from OCI descriptor graph')
        return {'configId': config_id, 'engineKinds': engine_kinds}


def private_output(path):
    require(path.is_absolute() and path.name not in ('', '.', '..') and path.parent.is_dir(), 'New absolute output required')
    parent = path.parent.resolve()
    require('.git' not in parent.parts and not any((ancestor / '.git').exists()
            for ancestor in (parent, *parent.parents)), 'Artifact output must be outside Git')
    environment = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    environment.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null', GIT_DISCOVERY_ACROSS_FILESYSTEM='1', LC_ALL='C')
    probe = subprocess.run(['git', '-C', str(parent), 'rev-parse', '--git-dir'], env=environment,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
    require(probe.returncode == 128 and probe.stderr == b'fatal: not a git repository (or any of the parent directories): .git\n',
            'Git exclusion could not establish an outside-repository destination')
    path.mkdir(mode=0o700)


class OwnedOutput:
    """Keep file operations on the created directory, even if its pathname moves."""
    def __init__(self, path):
        private_output(path)
        self.path = path
        self.fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.identity = os.fstat(self.fd)
        try:
            self.check()
        except BaseException:
            os.close(self.fd)
            raise

    def check(self):
        try:
            current = self.path.lstat()
        except OSError:
            raise ValueError('Output directory ownership changed; retained for reconciliation') from None
        require(stat.S_ISDIR(current.st_mode) and (current.st_dev, current.st_ino) ==
                (self.identity.st_dev, self.identity.st_ino), 'Output directory ownership changed; retained for reconciliation')

    def open(self, name, mode):
        self.check()
        require(name in ('download.zip', 'runtime-image.tar', 'manifest.json', 'verification.json'), 'Unexpected owned file')
        flags = os.O_RDONLY if mode == 'rb' else os.O_WRONLY | os.O_CREAT | os.O_EXCL
        descriptor = os.open(name, flags | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=self.fd)
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            os.close(descriptor)
            raise ValueError('Owned payload must be a regular file')
        return os.fdopen(descriptor, mode)

    def size(self, name):
        with self.open(name, 'rb') as stream:
            return os.fstat(stream.fileno()).st_size

    def hash(self, name):
        with self.open(name, 'rb') as stream:
            return sha256_stream(stream)

    def write_json(self, name, value):
        with self.open(name, 'xb') as stream:
            stream.write((json.dumps(value, indent=2) + '\n').encode())

    def retain_failure(self):
        try:
            descriptor = os.open('UNQUALIFIED', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                 0o600, dir_fd=self.fd)
        except FileExistsError:
            pass
        else:
            with os.fdopen(descriptor, 'wb') as stream:
                stream.write(b'Artifact operation failed; private stage retained for explicit reconciliation.\n')
        self.check()

    def close(self):
        os.close(self.fd)


def artifact_name(profile, run_id, attempt, release=None):
    if profile is RELEASE_PROFILE:
        release_claim(release)
        return f"{profile['artifact_prefix']}-{release['version']}-{run_id}-{attempt}"
    require(release is None, 'Fixture artifact cannot carry a release version')
    return f"{profile['artifact_prefix']}-{run_id}-{attempt}"


def verify_fixture(expected, output, github=None):
    """Authenticate and stage a candidate. This function never invokes Docker or SSH."""
    github = github or Github()
    parse_expected(expected)
    profile = profile_for_expected(expected)
    require(not output.exists() and not output.is_symlink(), 'Output must be new')
    evidence = github_evidence(expected, github)
    owned = OwnedOutput(output)
    try:
        metadata = evidence['artifact']
        with owned.open('download.zip', 'xb') as destination:
            github.download(expected['artifactId'], destination, metadata['size_in_bytes'])
        require(0 < owned.size('download.zip') <= MAX_ARCHIVE and owned.hash('download.zip') == metadata['digest'][7:]
                and owned.size('download.zip') == metadata['size_in_bytes'], 'Outer artifact bytes mismatch')
        with owned.open('download.zip', 'rb') as outer, zipfile.ZipFile(outer) as archive:
            members = archive.infolist()
            require(len(members) == 2 and {item.filename for item in members} == {'manifest.json', 'runtime-image.tar'}, 'Unexpected artifact members')
            for item in members:
                mode = item.external_attr >> 16
                require(safe_name(item.filename) and not item.is_dir() and not item.flag_bits & 1
                        and stat.S_IFMT(mode) in (0, stat.S_IFREG) and item.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                        and 0 < item.file_size <= (MAX_MANIFEST if item.filename == 'manifest.json' else MAX_ARCHIVE)
                        and item.file_size <= max(item.compress_size, 1) * 100, 'Unsafe artifact framing')
            manifest = parse_manifest(json_bytes(archive.read('manifest.json')), profile)
            require(manifest['source'] == expected['source'] and manifest['ci'] == {
                'workflowPath': profile['workflow'], 'workflowId': evidence['workflow']['workflow_id'], 'runId': expected['runId'],
                'attempt': expected['attempt'], 'jobId': evidence['job']['id'], 'jobKey': profile['job']}, 'Manifest producer identity mismatch')
            if profile is RELEASE_PROFILE:
                require(manifest['release'] == expected['release'], 'Release version mismatch')
            require(manifest['sourceFileDigests'] == evidence['sourceFileDigests']
                    and manifest['upstreamImages'] == evidence['upstreamImages'], 'Committed source digest mismatch')
            with archive.open('runtime-image.tar') as source, owned.open('runtime-image.tar', 'xb') as destination:
                shutil.copyfileobj(source, destination, 1024 * 1024)
            require(owned.size('runtime-image.tar') == manifest['archive']['size']
                    and owned.hash('runtime-image.tar') == manifest['archive']['sha256'], 'Inner archive bytes mismatch')
            with owned.open('runtime-image.tar', 'rb') as stream:
                identities = inspect_image_archive(stream)
            require(identities['configId'] == manifest['image']['configId']
                    and identities['engineKinds'].get(manifest['image']['engineId']) == manifest['image']['engineIdentityKind'],
                    'Image config/engine identity mismatch')
            owned.write_json('manifest.json', manifest)
        receipt = {'schemaVersion': 1, 'purpose': profile['receipt_purpose'], 'artifactId': expected['artifactId'],
            'outerSha256': metadata['digest'][7:], 'runId': expected['runId'], 'attempt': expected['attempt'],
            'jobId': evidence['job']['id'], 'source': expected['source'], 'archiveSha256': manifest['archive']['sha256'],
            'imageConfigId': manifest['image']['configId'], 'imageEngineId': manifest['image']['engineId'],
            'engineIdentityKind': manifest['image']['engineIdentityKind'], 'productionEligible': False, 'imageLoaded': False}
        if profile is RELEASE_PROFILE:
            receipt['release'] = expected['release']
        owned.write_json('verification.json', receipt)
        owned.check()
        os.unlink('download.zip', dir_fd=owned.fd)
        return receipt
    except BaseException:
        owned.retain_failure()
        raise
    finally:
        owned.close()


def export_release_candidate(image, context, output, version, github=None):
    return export_fixture(image, context, output, github, RELEASE_PROFILE,
                          {'version': release_version(version), 'candidate': True})


def tap_counts(text):
    values = {}
    for key, value in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$', text, re.M):
        require(key not in values, 'Duplicate test summary')
        values[key] = int(value)
    require(set(values) == {'tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'}
            and values['cancelled'] == values['todo'] == 0, 'Missing test summary')
    result = dict(zip(('tests', 'passed', 'failed', 'skipped'), (values['tests'], values['pass'], values['fail'], values['skipped'])))
    parse_counts(result)
    return result


def proof_records(text):
    result = {}
    for line in text.splitlines():
        if line.startswith('{"proof":'):
            value = json_bytes(line)
            require(value['proof'] not in result, 'Duplicate proof receipt')
            result[value['proof']] = value
    return result


def export_fixture(image, context, output, github=None, profile=FIXTURE_PROFILE, release=None):
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_REPOSITORY') == REPOSITORY
            and os.environ.get('GITHUB_JOB') == profile['job'] and image == OWNED_IMAGE, 'Export requires the owned CI image')
    if profile is RELEASE_PROFILE:
        release_claim(release)
        require(os.environ.get('DAILYLOGGER_RELEASE_VERSION') == release['version'], 'Release version environment mismatch')
    else:
        require(release is None, 'Fixture export cannot carry a release version')
    github = github or Github()
    revision = run(['git', 'rev-parse', 'HEAD']).strip(); digest(revision, SHA)
    require(revision == os.environ.get('GITHUB_SHA'), 'CI checkout mismatch')
    event = json_bytes(Path(os.environ['GITHUB_EVENT_PATH']).read_bytes())
    event_name = os.environ['GITHUB_EVENT_NAME']
    pr = event.get('pull_request') if event_name == 'pull_request' else None
    source = validate_source(profile, parse_source({'builtRevision': revision, 'event': event_name, 'ref': os.environ['GITHUB_REF'],
        'pullRequest': {'number': pr['number'], 'head': pr['head']['sha'], 'base': pr['base']['sha']} if pr else None}))
    receipt = parse_context(json_bytes((context / 'runtime-context.json').read_bytes()))
    require(receipt['sourceRevision'] == revision, 'Build context mismatch')
    run_id = int(os.environ['GITHUB_RUN_ID']); attempt = int(os.environ['GITHUB_RUN_ATTEMPT'])
    workflow = github.get(f'repos/{REPOSITORY}/actions/runs/{run_id}/attempts/{attempt}')
    require(workflow.get('path') == profile['workflow'] and workflow.get('run_attempt') == attempt, 'Wrong export workflow')
    job = selected_job(github, run_id, attempt, False, profile)
    source_hashes, upstreams = input_files(profile, lambda path: run(['git', 'show', revision + ':' + path], binary=True))
    inspected = json_bytes(run(['docker', 'image', 'inspect', image]))[0]
    require(inspected.get('RepoTags') == [OWNED_IMAGE] and inspected.get('Config', {}).get('User') == '1000:1000'
            and inspected.get('Os') == 'linux' and inspected.get('Architecture') == 'amd64', 'Unexpected owned image')
    image_id = inspected['Id']; require(re.fullmatch(r'sha256:[0-9a-f]{64}', image_id) is not None, 'Invalid config ID')
    require(json_bytes(run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'cat',
                image_id, '/app/runtime-context.json'])) == receipt, 'Image context mismatch')
    owned = OwnedOutput(output)
    try:
        with owned.open('runtime-image.tar', 'xb') as archive:
            run(['docker', 'image', 'save', image], output_file=archive, timeout=180)
        require(0 < owned.size('runtime-image.tar') <= MAX_ARCHIVE, 'Oversized image export')
        with owned.open('runtime-image.tar', 'rb') as archive:
            identities = inspect_image_archive(archive)
        require(image_id in identities['engineKinds'], 'Engine identity is absent from saved image graph')
        image_identity = {'identityKind': 'docker-config-sha256', 'configId': identities['configId'],
            'engineId': image_id, 'engineIdentityKind': identities['engineKinds'][image_id], 'platform': 'linux/amd64', 'uid': 1000, 'gid': 1000}
        run(['docker', 'image', 'rm', image])
        absent = run(['docker', 'image', 'inspect', image_id], allow_failure=True)
        require(absent.returncode != 0, 'Owned image record still exists; no force removal allowed')
        with owned.open('runtime-image.tar', 'rb') as archive:
            run(['docker', 'image', 'load'], input_file=archive, timeout=180)
        loaded = json_bytes(run(['docker', 'image', 'inspect', image_id]))[0]
        require(loaded['Id'] == image_id and loaded['Config']['User'] == '1000:1000'
                and loaded['Os'] == 'linux' and loaded['Architecture'] == 'amd64', 'Reloaded image mismatch')
        require(json_bytes(run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'cat',
                    image_id, '/app/runtime-context.json'])) == receipt, 'Reloaded context mismatch')
        proof_env = {key: value for key, value in os.environ.items() if key not in ('GH_TOKEN', 'GITHUB_TOKEN', 'DAILYLOGGER_ARTIFACT_CREDENTIAL_CANARY')}
        preparation = run(['pnpm', 'exec', 'node', '--import', 'tsx', '--test', '--test-reporter=tap',
            *[str(path.relative_to(SOURCE_ROOT)) for path in sorted((SOURCE_ROOT / 'apps/service/test/runtime').glob('*.test.ts'))]], env=proof_env)
        print(preparation, end='', flush=True)
        runtime = run(['pnpm', 'service:runtime:smoke', image_id], env=proof_env, timeout=300)
        print(runtime, end='', flush=True)
        ingress = run(['pnpm', 'service:ingress:smoke', image_id], env=proof_env, timeout=180)
        print(ingress, end='', flush=True)
        records = proof_records(runtime + '\n' + ingress)
        require(len(records) == 4, 'Missing runtime proof receipts')
        proofs = {'preparation': tap_counts(preparation), 'offline': records['offline-final-image'],
            'entrypoints': records['production-entrypoints-and-cross-container-storage'],
            'http': records['production-runtime-with-external-http-tests'], 'ingress': records['private-tls-proxy'],
            'exportReload': {'status': 'passed', 'imageRecordRemoved': True, 'archiveClosure': 'passed', 'emptyLayerStore': False}}
        manifest = {'schemaVersion': 1, 'purpose': profile['manifest_purpose'], 'repository': REPOSITORY,
            'source': source, 'ci': {'workflowPath': profile['workflow'], 'workflowId': workflow['workflow_id'], 'runId': run_id,
                'attempt': attempt, 'jobId': job['id'], 'jobKey': profile['job']}, 'image': image_identity,
            'archive': {'name': 'runtime-image.tar', 'size': owned.size('runtime-image.tar'), 'sha256': owned.hash('runtime-image.tar')},
            'context': receipt, 'sourceFileDigests': source_hashes, 'upstreamImages': upstreams, 'qualifications': proofs}
        if profile is RELEASE_PROFILE:
            manifest['release'] = release
        manifest = parse_manifest(manifest, profile)
        serialized = json.dumps(manifest, indent=2) + '\n'
        needles = [value.encode() for key in ('GH_TOKEN', 'GITHUB_TOKEN', 'DAILYLOGGER_ARTIFACT_CREDENTIAL_CANARY')
                   if (value := os.environ.get(key))]
        with owned.open('runtime-image.tar', 'rb') as stream:
            tail = b''
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                data = tail + chunk
                require(not any(needle in data for needle in needles), 'Credential canary found in archive')
                tail = data[-max([len(needle) for needle in needles] + [1]):]
        require(not any(needle in serialized.encode() for needle in needles), 'Credential canary found in manifest')
        owned.write_json('manifest.json', manifest)
        result = {'purpose': manifest['purpose'], 'imageConfigId': image_identity['configId'], 'imageEngineId': image_id,
                'engineIdentityKind': image_identity['engineIdentityKind'], 'artifactName': artifact_name(profile, run_id, attempt, release),
                'builtRevision': revision, 'productionEligible': False}
        if profile is RELEASE_PROFILE:
            result['release'] = release
        return result
    except BaseException:
        owned.retain_failure()
        raise
    finally:
        owned.close()


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    export = commands.add_parser('export')
    export.add_argument('--image', required=True)
    export.add_argument('--context', required=True, type=Path)
    export.add_argument('--output', required=True, type=Path)
    export.add_argument('--release-version')
    verify = commands.add_parser('verify')
    verify.add_argument('--expected', required=True, type=Path)
    verify.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        value = export_release_candidate(args.image, args.context, args.output, args.release_version) \
            if args.command == 'export' and args.release_version else \
            export_fixture(args.image, args.context, args.output) if args.command == 'export' else \
            verify_fixture(parse_expected(json_bytes(args.expected.read_bytes())), args.output)
        print(json.dumps(value))
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError, zipfile.BadZipFile, tarfile.TarError) as error:
        detail = str(error) if type(error) is ValueError else type(error).__name__
        parser.exit(1, f'Artifact {args.command} failed: {detail}; no candidate qualified\n')


if __name__ == '__main__':
    main()
