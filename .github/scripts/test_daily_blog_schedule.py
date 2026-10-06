"""Exercise admission and dispatch behavior without contacting GitHub."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('schedule', Path(__file__).with_name('daily_blog_schedule.py'))
schedule = importlib.util.module_from_spec(spec)
spec.loader.exec_module(schedule)
DAY = '2026-10-06'


def run(run_id=1, status='completed', conclusion='success', *, target='auto', dry=False,
        created='2026-10-06T08:30:00Z', event='schedule'):
    return {'id': run_id, 'status': status, 'conclusion': conclusion, 'event': event,
            'created_at': created, 'html_url': f'https://github.com/ojfbot/daily-logger/actions/runs/{run_id}',
            'display_title': f'Daily Dev Blog | date={target} | dry_run={str(dry).lower()}'}


class FakeGitHub:
    prefix = 'repos/ojfbot/daily-logger'

    def __init__(self, *, article=None, branch=None, runs=None, prs=None):
        self.existing_article = article
        self.existing_branch = branch
        self.run_responses = [runs or []]
        self.prs = prs or []
        self.calls = []
        self.source_run = run()
        self.steps = []
        self.receipt = {'workflow_run_id': 123, 'html_url': 'https://github.com/ojfbot/daily-logger/actions/runs/123'}

    def article(self, day, ref='main'):
        self.calls.append(('article', day, ref))
        return self.existing_article if ref == 'main' else {'name': f'{day}.md'}

    def branch(self, day):
        self.calls.append(('branch', day))
        return self.existing_branch

    def runs(self, day, exclude_id=None):
        self.calls.append(('runs', day))
        result = self.run_responses[0]
        if len(self.run_responses) > 1:
            self.run_responses.pop(0)
        return [item for item in result if str(item['id']) != str(exclude_id)]

    def api(self, endpoint, **kwargs):
        self.calls.append(('api', endpoint, kwargs))
        if endpoint.startswith('pulls?'):
            return self.prs
        if endpoint.endswith('/dispatches'):
            return self.receipt
        if '/jobs?' in endpoint:
            return [{'jobs': [{'steps': self.steps}]}]
        return self.source_run

    def dispatches(self):
        return [call for call in self.calls if call[0] == 'api' and call[1].endswith('/dispatches')]


class AdmissionTests(unittest.TestCase):
    def test_existing_article_stops_before_run_listing(self):
        github = FakeGitHub(article={'sha': 'abc'})
        self.assertEqual(schedule.preflight(github, DAY, False, 2), 'complete')
        self.assertEqual(github.calls, [('article', DAY, 'main')])

    def test_dry_run_does_not_apply_duplicate_guard(self):
        github = FakeGitHub(article={'sha': 'abc'})
        self.assertEqual(schedule.preflight(github, DAY, True, 2), 'generate')
        self.assertEqual(github.calls, [])

    def test_pushed_branch_without_pr_is_recovered_without_generation(self):
        github = FakeGitHub(branch={'ref': 'article/' + DAY})
        self.assertEqual(schedule.preflight(github, DAY, False, 2), 'recover')

    def test_open_pr_is_reused(self):
        github = FakeGitHub(branch={}, prs=[{'state': 'open'}])
        self.assertEqual(schedule.preflight(github, DAY, False, 2), 'recover')

    def test_success_with_pr_awaiting_ci_does_not_admit_cleaner_again(self):
        github = FakeGitHub(branch={}, runs=[run()], prs=[{'state': 'open'}])
        self.assertEqual(schedule.preflight(github, DAY, False, 2), 'complete')

    def test_rejected_pr_is_respected(self):
        github = FakeGitHub(branch={}, prs=[{'state': 'closed'}])
        self.assertEqual(schedule.preflight(github, DAY, False, 2), 'complete')

    def test_no_activity_success_prevents_later_generation(self):
        github = FakeGitHub(runs=[run()])
        self.assertEqual(schedule.preflight(github, DAY, False, 2), 'complete')

    def test_pending_duplicate_does_not_hide_previous_no_activity_success(self):
        github = FakeGitHub(runs=[run(), run(3, 'queued', None)])
        self.assertEqual(schedule.preflight(github, DAY, False, 2), 'complete')

    def test_current_and_pending_runs_do_not_block_first_generation(self):
        github = FakeGitHub(runs=[run(2, 'in_progress', None), run(3, 'queued', None)])
        self.assertEqual(schedule.preflight(github, DAY, False, 2), 'generate')

    def test_rerun_of_successful_attempt_does_not_regenerate_or_admit_cleaner(self):
        github = FakeGitHub(branch={}, prs=[{'state': 'open'}])
        self.assertEqual(schedule.preflight(github, DAY, False, 1, attempt=2), 'complete')

    def test_retry_of_failed_attempt_can_generate(self):
        github = FakeGitHub()
        github.source_run = run(conclusion='failure')
        self.assertEqual(schedule.preflight(github, DAY, False, 1, attempt=2), 'generate')

    def test_explicit_manual_retry_can_recover_failed_generation(self):
        github = FakeGitHub(runs=[run(conclusion='failure')])
        self.assertEqual(schedule.preflight(github, DAY, False, 2), 'generate')


class WatchdogTests(unittest.TestCase):
    def test_missing_run_dispatches_exact_date_once(self):
        github = FakeGitHub()
        result = schedule.watchdog(github, DAY, True)
        self.assertEqual(result['state'], 'dispatched')
        self.assertEqual(len(github.dispatches()), 1)
        self.assertEqual(github.dispatches()[0][2]['data'],
                         {'ref': 'main', 'inputs': {'date_override': DAY, 'dry_run': False}})

    def test_check_only_never_dispatches(self):
        github = FakeGitHub()
        self.assertEqual(schedule.watchdog(github, DAY, False)['state'], 'missing')
        self.assertEqual(github.dispatches(), [])

    def test_success_and_active_runs_never_dispatch(self):
        for status, conclusion in [('completed', 'success'), ('queued', None), ('in_progress', None), ('waiting', None)]:
            with self.subTest(status=status):
                github = FakeGitHub(runs=[run(status=status, conclusion=conclusion)])
                schedule.watchdog(github, DAY, True)
                self.assertEqual(github.dispatches(), [])

    def test_failed_or_cancelled_run_needs_human_attention(self):
        for conclusion in ['failure', 'cancelled', 'timed_out', 'action_required']:
            with self.subTest(conclusion=conclusion):
                github = FakeGitHub(runs=[run(conclusion=conclusion)])
                with self.assertRaises(ValueError):
                    schedule.watchdog(github, DAY, True)
                self.assertEqual(github.dispatches(), [])

    def test_new_cron_run_during_check_prevents_dispatch(self):
        github = FakeGitHub()
        github.run_responses = [[], [run(status='queued', conclusion=None)]]
        self.assertEqual(schedule.watchdog(github, DAY, True)['state'], 'active')
        self.assertEqual(github.dispatches(), [])

    def test_orphan_branch_is_reported_without_automatic_repair(self):
        github = FakeGitHub(branch={})
        with self.assertRaises(ValueError):
            schedule.watchdog(github, DAY, True)
        self.assertEqual(github.dispatches(), [])

    def test_uncertain_dispatch_is_not_retried(self):
        github = FakeGitHub()
        github.receipt = {}
        with self.assertRaises(RuntimeError):
            schedule.watchdog(github, DAY, True)
        self.assertEqual(len(github.dispatches()), 1)


class SourceRunTests(unittest.TestCase):
    def test_dry_runs_and_other_events_do_not_qualify(self):
        self.assertIsNone(schedule.run_date(run(dry=True)))
        self.assertIsNone(schedule.run_date(run(event='pull_request')))

    def test_backfills_use_override_not_creation_date(self):
        self.assertEqual(schedule.run_date(run(target='2026-09-01', event='workflow_dispatch')), '2026-09-01')

    def test_chicago_calendar_boundary_and_dst(self):
        self.assertEqual(schedule.run_date(run(created='2026-10-06T04:59:59Z')), '2026-10-05')
        self.assertEqual(schedule.run_date(run(created='2026-10-06T05:00:00Z')), DAY)
        self.assertEqual(schedule.run_date(run(created='2026-12-06T05:59:59Z')), '2026-12-05')
        self.assertEqual(schedule.run_date(run(created='2026-12-06T06:00:00Z')), '2026-12-06')

    def test_legacy_schedule_supported_but_manual_inputs_not_guessed(self):
        source = run()
        source['display_title'] = 'Daily Dev Blog'
        self.assertEqual(schedule.run_date(source), DAY)
        source['event'] = 'workflow_dispatch'
        with self.assertRaises(ValueError):
            schedule.run_date(source)

    def test_duplicate_completion_does_not_admit_cleaner(self):
        github = FakeGitHub()
        github.steps = [{'name': schedule.READY_STEP, 'conclusion': 'skipped'}]
        self.assertEqual(schedule.cleaner(github, 1), {'proceed': 'false', 'date': DAY})

    def test_new_or_recovered_article_admits_cleaner_for_source_date(self):
        github = FakeGitHub()
        github.source_run = run(target='2026-09-01', event='workflow_dispatch')
        github.steps = [{'name': schedule.READY_STEP, 'conclusion': 'success'}]
        self.assertEqual(schedule.cleaner(github, 1), {'proceed': 'true', 'date': '2026-09-01'})

    def test_cleaner_reads_triggering_attempt_instead_of_later_rerun(self):
        github = FakeGitHub()
        github.steps = [{'name': schedule.READY_STEP, 'conclusion': 'success'}]
        self.assertEqual(schedule.cleaner(github, 1, '2')['proceed'], 'true')
        endpoints = [call[1] for call in github.calls if call[0] == 'api']
        self.assertEqual(endpoints, ['actions/runs/1/attempts/2', 'actions/runs/1/attempts/2/jobs?per_page=100'])

    def test_dry_run_does_not_admit_cleaner(self):
        github = FakeGitHub()
        github.source_run = run(dry=True)
        github.steps = [{'name': schedule.READY_STEP, 'conclusion': 'success'}]
        self.assertEqual(schedule.cleaner(github, 1)['proceed'], 'false')


class GitHubBoundaryTests(unittest.TestCase):
    def test_only_confirmed_404_means_missing(self):
        github = schedule.GitHub('ojfbot/daily-logger')
        for stderr in ['HTTP 401: Bad credentials', 'connection failed', 'rate limited']:
            with self.subTest(stderr=stderr), patch.object(schedule.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', stderr)):
                with self.assertRaises(RuntimeError):
                    github.article(DAY)
        with patch.object(schedule.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'gh: Not Found (HTTP 404)')):
            self.assertIsNone(github.article(DAY))

    def test_pagination_filters_dry_runs_backfills_and_current_run(self):
        github = schedule.GitHub('ojfbot/daily-logger')
        pages = [{'total_count': 4, 'workflow_runs': [run(1, dry=True), run(2, target='2026-09-01')]},
                 {'workflow_runs': [run(3), run(4)]}]
        with patch.object(github, 'api', return_value=pages) as api:
            self.assertEqual([item['id'] for item in github.runs(DAY, 4)], [3])
            self.assertTrue(api.call_args.kwargs['paginate'])

    def test_truncated_listing_does_not_prove_missing(self):
        github = schedule.GitHub('ojfbot/daily-logger')
        with patch.object(github, 'api', return_value=[{'total_count': 1001, 'workflow_runs': []}]):
            with self.assertRaises(ValueError):
                github.runs(DAY)

    def test_manual_cleaner_validates_date_before_emitting_outputs(self):
        with patch.dict(os.environ, {'EVENT_NAME': 'workflow_dispatch', 'DATE_OVERRIDE': '2026-10-06\nproceed=true'}):
            with patch.object(sys, 'argv', ['schedule', 'cleaner']), self.assertRaises(ValueError):
                schedule.main()

    def test_queued_run_crossing_midnight_retains_creation_date(self):
        current = run(created='2026-10-06T04:59:59Z')
        current['run_attempt'] = 1
        with patch.dict(os.environ, {'DATE_OVERRIDE': '', 'DRY_RUN': 'false'}), \
                patch.object(sys, 'argv', ['schedule', 'preflight', '--run-id', '1']), \
                patch.object(schedule.GitHub, 'api', return_value=current), \
                patch.object(schedule, 'preflight', return_value='complete') as check, \
                patch.object(schedule, 'outputs') as output:
            schedule.main()
            self.assertEqual(check.call_args.args[1], '2026-10-05')
            self.assertEqual(output.call_args.args[0]['date'], '2026-10-05')

    def test_cli_check_with_real_fake_gh_process_has_no_writes(self):
        with tempfile.TemporaryDirectory() as folder:
            fake = Path(folder) / 'gh'
            fake.write_text('#!/usr/bin/env python3\nimport json, sys\n'
                            'if "contents/" in sys.argv[2]:\n'
                            ' print("gh: Not Found (HTTP 404)", file=sys.stderr); sys.exit(1)\n'
                            'assert "--method" not in sys.argv\n'
                            'print(json.dumps([{"total_count": 0, "workflow_runs": []}]))\n')
            fake.chmod(0o755)
            env = dict(os.environ, PATH=folder + os.pathsep + os.environ['PATH'])
            result = subprocess.run([sys.executable, str(Path(schedule.__file__)), 'watchdog', '--date', DAY],
                                    capture_output=True, text=True, env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['state'], 'missing')


if __name__ == '__main__':
    unittest.main()
