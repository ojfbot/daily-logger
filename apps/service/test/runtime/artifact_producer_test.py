"""Exercise the real artifact producer with synthetic process and GitHub boundaries."""
from contextlib import redirect_stdout
import copy
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from artifact_test import artifact, GithubFixture, BUILT, REPOSITORY, RELEASE_VERSION


def tap(tests):
    return f'TAP version 13\n1..{tests}\n# tests {tests}\n# pass {tests}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'


class ArtifactProducerTests(unittest.TestCase):
    def exercise(self, *, release=False, fault=None):
        fixture = GithubFixture()
        if release:
            fixture.as_release_candidate()
        temporary = tempfile.TemporaryDirectory(prefix='dailylogger-producer-test-')
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        context = root / 'context'
        context.mkdir()
        context.joinpath('runtime-context.json').write_text(json.dumps(fixture.manifest['context']))
        event = root / 'event.json'
        event.write_text(json.dumps({} if release else {'pull_request': {
            'number': 55, 'head': {'sha': '1' * 40}, 'base': {'sha': '2' * 40}}}))
        output = root / 'candidate'
        identity = fixture.manifest['image']
        image = identity['engineId']
        calls = []
        writes = []
        environment = {
            'PATH': os.environ.get('PATH', ''), 'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': REPOSITORY,
            'GITHUB_JOB': 'release-candidate' if release else 'runtime-image',
            'GITHUB_SHA': BUILT, 'GITHUB_EVENT_PATH': str(event),
            'GITHUB_EVENT_NAME': fixture.expected['source']['event'],
            'GITHUB_REF': fixture.expected['source']['ref'], 'GITHUB_RUN_ID': '100', 'GITHUB_RUN_ATTEMPT': '2',
            'DAILYLOGGER_RELEASE_VERSION': RELEASE_VERSION,
            'GH_TOKEN': 'synthetic-token-canary', 'GITHUB_TOKEN': 'synthetic-other-canary',
            'DAILYLOGGER_ARTIFACT_CREDENTIAL_CANARY': 'synthetic-credential-canary',
        }
        inspected = {'Id': image, 'RepoTags': [artifact.OWNED_IMAGE], 'Os': 'linux',
                     'Architecture': 'amd64', 'Config': {'User': '1000:1000'}}

        def run(args, **options):
            calls.append((list(args), options))
            if args == ['git', 'rev-parse', 'HEAD']:
                return BUILT + '\n'
            if args[:2] == ['git', 'show']:
                self.assertTrue(args[2].startswith(BUILT + ':'))
                return fixture.source_files[args[2].split(':', 1)[1]]
            if args[:3] == ['docker', 'image', 'inspect']:
                return subprocess.CompletedProcess(args, 1) if options.get('allow_failure') else json.dumps([inspected])
            if args[:3] == ['docker', 'image', 'save']:
                options['output_file'].write(fixture.image)
                return None
            if args[:3] == ['docker', 'image', 'load']:
                self.assertEqual(options['input_file'].read(), fixture.image)
                return ''
            if args[:3] == ['docker', 'image', 'rm']:
                return ''
            if args[:2] == ['docker', 'run']:
                return json.dumps(fixture.manifest['context'])
            self.assertEqual(args[0], 'pnpm')
            for key in ('GH_TOKEN', 'GITHUB_TOKEN', 'DAILYLOGGER_ARTIFACT_CREDENTIAL_CANARY'):
                self.assertNotIn(key, options['env'])
            if args[1] == 'service:runtime:smoke':
                self.assertEqual(args[2], image)
                return ''.join(json.dumps(fixture.manifest['qualifications'][name]) + '\n'
                               for name in ('offline', 'entrypoints', 'http'))
            if args[1] == 'service:ingress:smoke':
                return json.dumps(fixture.manifest['qualifications']['ingress']) + '\n'
            if args[1] == 'service:runtime:exporter':
                self.assertEqual(args[2:], [image, identity['configId']])
                self.assertGreater(options['timeout'], 240)
                if fault == 'exporter-process':
                    raise ValueError('Synthetic exporter process failed')
                summary = copy.deepcopy(fixture.manifest['qualifications']['enabledExporter'])
                summary.update(schemaVersion=1, result='passed',
                    counts={'tests': 4, 'pass': 4, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0})
                if fault in ('exporter-engine', 'exporter-config', 'exporter-postgres'):
                    summary[{'exporter-engine': 'image', 'exporter-config': 'configId',
                             'exporter-postgres': 'postgresImage'}[fault]] = 'sha256:' + 'f' * 64
                elif fault == 'exporter-cleanup':
                    summary['cleanup'] = 'failed'
                elif fault == 'exporter-count':
                    summary['counts']['skipped'] = 1
                elif fault == 'exporter-result':
                    summary['result'] = 'failed'
                # Real exporter JSON begins with schemaVersion, not proof.
                summary = {'schemaVersion': summary.pop('schemaVersion'), **summary}
                text = json.dumps(summary) + '\n'
                return '' if fault == 'exporter-missing' else text * (2 if fault == 'exporter-duplicate' else 1)
            self.assertEqual(args[:3], ['pnpm', 'exec', 'node'])
            if '--test-concurrency=1' not in args:
                return tap(10)
            self.assertIn('--test-reporter=tap', args)
            self.assertTrue(any(path.endswith('matched-restore.test.mjs') for path in args))
            self.assertEqual(options['env']['DAILYLOGGER_RESTORE_IMAGE'], image)
            self.assertEqual(options['env']['DAILYLOGGER_RESTORE_CONFIG_ID'], identity['configId'])
            self.assertGreater(options['timeout'], 600)
            if fault == 'restore-process':
                raise ValueError('Synthetic restore process failed')
            summary = copy.deepcopy(fixture.manifest['qualifications']['matchedRestore'])
            summary.pop('counts')
            summary['imageConfigId'] = summary.pop('configId')
            if fault in ('restore-engine', 'restore-config', 'restore-postgres'):
                summary[{'restore-engine': 'image', 'restore-config': 'imageConfigId',
                         'restore-postgres': 'postgresImage'}[fault]] = 'sha256:' + 'f' * 64
            elif fault == 'restore-cleanup':
                summary['cleanupComplete'] = False
            elif fault == 'restore-check':
                summary['checks']['zeroPostCutSourceEffects'] = False
            text = '# ' + json.dumps(summary) + '\n'
            text = '' if fault == 'restore-missing' else text * (2 if fault == 'restore-duplicate' else 1)
            counts = tap(14)
            if fault == 'restore-skipped':
                counts = counts.replace('# skipped 0', '# skipped 1')
            elif fault == 'restore-cancelled':
                counts = counts.replace('# cancelled 0', '# cancelled 1')
            return text + counts

        actual_write = artifact.OwnedOutput.write_json

        def write(owned, name, data):
            writes.append(name)
            calls.append((['write', name], {}))
            return actual_write(owned, name, data)

        with patch.dict(os.environ, environment, clear=True), patch.object(artifact, 'run', side_effect=run), \
             patch.object(artifact.OwnedOutput, 'write_json', write), redirect_stdout(io.StringIO()):
            def produce():
                return artifact.export_release_candidate(artifact.OWNED_IMAGE, context, output, RELEASE_VERSION, fixture) \
                    if release else artifact.export_fixture(artifact.OWNED_IMAGE, context, output, fixture)
            if fault:
                with self.assertRaises(ValueError):
                    produce()
                self.assertNotIn('manifest.json', writes)
                self.assertFalse(output.joinpath('manifest.json').exists())
            else:
                result = produce()
                self.assertFalse(result['productionEligible'])
                manifest = json.loads(output.joinpath('manifest.json').read_text())
                self.assertEqual(manifest['schemaVersion'], 2)
                self.assertEqual(manifest['qualifications']['enabledExporter'], fixture.manifest['qualifications']['enabledExporter'])
                self.assertEqual(manifest['qualifications']['matchedRestore'], fixture.manifest['qualifications']['matchedRestore'])
                operations = [args for args, _ in calls]
                reload_at = operations.index(['docker', 'image', 'load'])
                exporter_at = next(i for i, args in enumerate(operations) if args[:2] == ['pnpm', 'service:runtime:exporter'])
                restore_at = next(i for i, args in enumerate(operations) if '--test-concurrency=1' in args)
                write_at = operations.index(['write', 'manifest.json'])
                self.assertLess(reload_at, exporter_at)
                self.assertLess(exporter_at, restore_at)
                self.assertLess(restore_at, write_at)

    def test_both_profiles_bind_reload_and_gates_before_manifest_creation(self):
        for release in (False, True):
            with self.subTest(release=release):
                self.exercise(release=release)

    def test_either_gate_process_failure_prevents_manifest_creation_for_both_profiles(self):
        for release in (False, True):
            for fault in ('exporter-process', 'restore-process'):
                with self.subTest(release=release, fault=fault):
                    self.exercise(release=release, fault=fault)

    def test_missing_duplicate_failed_or_mismatched_receipts_never_create_manifest(self):
        for fault in ('exporter-missing', 'exporter-duplicate', 'exporter-engine', 'exporter-config',
                      'exporter-postgres', 'exporter-cleanup', 'exporter-count', 'exporter-result',
                      'restore-missing', 'restore-duplicate', 'restore-engine', 'restore-config',
                      'restore-postgres', 'restore-cleanup', 'restore-check', 'restore-skipped', 'restore-cancelled'):
            with self.subTest(fault=fault):
                self.exercise(release=True, fault=fault)


if __name__ == '__main__':
    unittest.main()
