#!/usr/bin/env python3
"""Check the daily blog before dispatch, generation, or dependent cleaning."""
import argparse
from datetime import date, datetime, time, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time as clock
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

CHICAGO = ZoneInfo('America/Chicago')
WORKFLOW = 'daily-blog.yml'
READY_STEP = 'Article ready for cleaner'
RUN_TITLE = re.compile(r'^Daily Dev Blog \| date=(auto|\d{4}-\d{2}-\d{2}) \| dry_run=(true|false)$')
ACTIVE = {'queued', 'in_progress', 'requested', 'waiting', 'pending'}


def chicago_now():
    return datetime.now(CHICAGO)


def dispatch_seconds_remaining(target_date):
    observed = chicago_now()
    if observed.date().isoformat() != target_date:
        raise ValueError('Fallback dispatch requires today in America/Chicago; date changed or is not current')
    target = datetime.combine(date.fromisoformat(target_date), time(3, 30), CHICAGO)
    return (target - observed).total_seconds()


def wait_for_dispatch_target(target_date):
    """A local task may start early. Wait at most five minutes before any reads/POST."""
    for _ in range(10):
        remaining = dispatch_seconds_remaining(target_date)
        if remaining <= 0:
            return
        if remaining > 300:
            raise ValueError('Fallback started more than five minutes before the 03:30 Chicago target')
        clock.sleep(min(30, remaining))
    if dispatch_seconds_remaining(target_date) > 0:
        raise ValueError('Fallback could not reach the 03:30 Chicago target within its bounded wait')


def run_evidence(run, target_date, schedule_expression, timezone_name):
    """Return best-effort timing evidence for this attempt's configured target."""
    match = re.fullmatch(r'\s*(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*\s*', schedule_expression)
    if not match:
        raise ValueError('Unsupported schedule expression')
    minute, hour = int(match[1]), int(match[2])
    if minute > 59 or hour > 23:
        raise ValueError('Invalid schedule expression')
    zone = ZoneInfo(timezone_name)
    expected = datetime.combine(date.fromisoformat(target_date), time(hour, minute), zone).astimezone(timezone.utc)
    created = datetime.fromisoformat(run['created_at'].replace('Z', '+00:00'))
    evidence = {
        'expected_at': expected.isoformat(),
        'created_at': created.isoformat(),
        'dispatch_delay_seconds': round((created - expected).total_seconds()),
    }
    started_at = run.get('run_started_at')
    if started_at:
        started = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
        evidence['started_at'] = started.isoformat()
        # Top-level created_at/run_started_at belong to the original attempt.
        # They do not prove queue latency for an Actions rerun.
        if int(run.get('run_attempt', 1)) == 1:
            evidence['start_delay_seconds'] = round((started - created).total_seconds())
    return evidence


def report_run_evidence(run, target_date):
    """Emit diagnostics for generate, recover, and complete preflight outcomes."""
    schedule_expression = os.environ['DAILY_BLOG_SCHEDULE']
    timezone_name = os.environ['DAILY_BLOG_TIMEZONE']
    evidence = run_evidence(run, target_date, schedule_expression, timezone_name)
    url = run.get('html_url', '')
    attempt = f"{run.get('run_number', '?')}.{run.get('run_attempt', 1)}"
    actor = run.get('actor') if isinstance(run.get('actor'), dict) else {}
    source_sha = run.get('head_sha', 'unavailable')
    workflow_ref = run.get('path', 'unavailable')
    print(
        '::notice title=Daily blog preflight evidence::'
        f"event={run.get('event', 'unknown')} run={attempt} "
        f"actor={actor.get('login', 'unavailable')} sha={source_sha} workflow={workflow_ref} "
        f"expected={evidence['expected_at']} created={evidence['created_at']} "
        f"target_delay_seconds={evidence['dispatch_delay_seconds']} url={url}"
    )
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if not summary:
        return
    rows = [
        ('Run', f'[{attempt}]({url})' if url else attempt),
        ('Event', f"`{run.get('event', 'unknown')}`"),
        ('Source SHA', f'`{source_sha}`'),
        ('Workflow ref', f'`{workflow_ref}`'),
        ('Actor', f"`{actor.get('login', 'unavailable')}`"),
        ('Target schedule', f'`{schedule_expression}` in `{timezone_name}`'),
        ('Expected target', evidence['expected_at']),
        ('Run created', evidence['created_at']),
        ('Run started', evidence.get('started_at', 'n/a')),
        ('Target-to-created delay', str(evidence['dispatch_delay_seconds']) + ' seconds'),
        ('Run start delay', str(evidence['start_delay_seconds']) + ' seconds'
         if 'start_delay_seconds' in evidence else 'n/a for reruns or missing timestamp'),
    ]
    with Path(summary).open('a') as stream:
        stream.write('## Daily blog preflight evidence\n\n| Field | Value |\n|---|---|\n')
        stream.write('\n'.join(f'| {key} | {value} |' for key, value in rows) + '\n\n')


def calendar_date(value):
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError('Date must be YYYY-MM-DD')
    return value


def run_date(run):
    """Only live schedule/dispatch runs qualify; legacy manual runs are ambiguous."""
    if run['event'] not in {'schedule', 'workflow_dispatch'}:
        return None
    match = RUN_TITLE.fullmatch(run['display_title'])
    if match:
        if match[2] == 'true':
            return None
        if match[1] != 'auto':
            return calendar_date(match[1])
    elif run['event'] != 'schedule':
        raise ValueError(f"Cannot identify inputs of legacy manual run {run['id']}")
    return datetime.fromisoformat(run['created_at'].replace('Z', '+00:00')).astimezone(CHICAGO).date().isoformat()


class GitHub:
    def __init__(self, repo):
        if not re.fullmatch(r'[\w.-]+/[\w.-]+', repo):
            raise ValueError('Repository must be owner/name')
        self.prefix = f'repos/{repo}'

    def api(self, endpoint, *, missing_ok=False, data=None, paginate=False):
        command = ['gh', 'api', f'{self.prefix}/{endpoint}', '-H', 'Accept: application/vnd.github+json',
                   '-H', 'X-GitHub-Api-Version: 2026-03-10']
        if paginate:
            command += ['--paginate', '--slurp']
        if data is not None:
            command += ['--method', 'POST', '--input', '-']
        response = subprocess.run(command, input=json.dumps(data) if data is not None else None,
                                  capture_output=True, text=True, timeout=45)
        if response.returncode:
            if missing_ok and '(HTTP 404)' in response.stderr:
                return None
            # Never echo CLI stderr: authentication/proxy failures can contain credentials.
            raise RuntimeError(f'GitHub request failed: {endpoint}')
        return json.loads(response.stdout) if response.stdout.strip() else {}

    def runs(self, target_date, exclude_id=None):
        # Calendar boundaries follow Chicago DST. Include every page, not just the newest runs.
        midnight = datetime.combine(date.fromisoformat(target_date), time(), CHICAGO).astimezone(timezone.utc)
        query = urlencode({'per_page': 100, 'created': '>=' + midnight.isoformat()})
        pages = self.api(f'actions/workflows/{WORKFLOW}/runs?{query}', paginate=True)
        if sum(len(page['workflow_runs']) for page in pages) < pages[0]['total_count']:
            raise ValueError('Workflow run listing was truncated; no dispatch')
        matches = []
        for page in pages:
            for run in page['workflow_runs']:
                if str(run['id']) != str(exclude_id) and run_date(run) == target_date:
                    matches.append(run)
        return matches

    def article(self, target_date, ref='main'):
        return self.api(f'contents/_articles/{target_date}.md?{urlencode({"ref": ref})}', missing_ok=True)

    def branch(self, target_date):
        return self.api(f'git/ref/heads/article/{target_date}', missing_ok=True)


def run_state(runs):
    if any(run['status'] in ACTIVE for run in runs):
        return 'active'
    if any(run['status'] != 'completed' for run in runs):
        raise ValueError('Unknown GitHub run status')
    if any(run['conclusion'] == 'success' for run in runs):
        return 'complete'
    if runs:
        return 'failed'
    return 'missing'


def preflight(github, target_date, dry_run, run_id, attempt=1):
    if dry_run:
        return 'generate'
    if github.article(target_date) is not None:
        return 'complete'
    # Re-running a successful attempt retains the same run ID, so run listing alone cannot see it.
    for previous in range(1, attempt):
        prior = github.api(f'actions/runs/{run_id}/attempts/{previous}')
        if prior['conclusion'] == 'success' and run_date(prior) == target_date:
            return 'complete'
    # A successful run can have an open article PR awaiting CI; do not admit its cleaner twice.
    runs = github.runs(target_date, run_id)
    if any(run['status'] == 'completed' and run['conclusion'] == 'success' for run in runs):
        return 'complete'
    # Check the fresh remote inside workflow concurrency, not the checkout pinned at dispatch.
    if github.branch(target_date) is not None:
        branch = f'article/{target_date}'
        if github.article(target_date, branch) is None:
            raise ValueError(f'{branch} exists without its article; needs operator repair')
        prs = github.api('pulls?' + urlencode({'head': f'{github.prefix.split("/")[1]}:{branch}', 'state': 'all', 'per_page': 100}))
        if any(pr['state'] == 'closed' for pr in prs) and not any(pr['state'] == 'open' for pr in prs):
            return 'complete'  # Respect an editorial rejection or already-merged PR.
        return 'recover'
    # A queued duplicate does not prevent the current run from generating.
    return 'generate'


def watchdog(github, target_date, dispatch):
    if dispatch:
        wait_for_dispatch_target(target_date)
    if github.article(target_date) is not None:
        return {'state': 'complete', 'date': target_date}
    runs = github.runs(target_date)
    state = run_state(runs)
    result = {'state': state, 'date': target_date, 'runs': [run['html_url'] for run in runs]}
    if state == 'failed':
        raise ValueError('A live run failed/cancelled; inspect instead of retrying: ' + ', '.join(result['runs']))
    if state != 'missing' or not dispatch:
        return result
    if github.branch(target_date) is not None:
        raise ValueError('Article branch exists without a successful run; needs PR/publication repair')
    # Narrow the read/dispatch race. Workflow preflight is the authoritative duplicate guard.
    refreshed = github.runs(target_date)
    if refreshed:
        state = run_state(refreshed)
        if state == 'failed':
            raise ValueError('A live run failed during the check; no dispatch: ' + ', '.join(run['html_url'] for run in refreshed))
        return {'state': state, 'date': target_date, 'runs': [run['html_url'] for run in refreshed]}
    # Long reads or a clock change must not carry an admitted request into another date.
    if dispatch_seconds_remaining(target_date) > 0:
        raise ValueError('Clock moved before the 03:30 target; no dispatch')
    receipt = github.api(f'actions/workflows/{WORKFLOW}/dispatches', data={
        'ref': 'main', 'inputs': {'date_override': target_date, 'dry_run': False},
    })
    # Never retry an uncertain POST. A run ID is the delivery receipt.
    if not isinstance(receipt.get('workflow_run_id'), int) or not receipt.get('html_url'):
        raise RuntimeError('Dispatch returned no run receipt; inspect remote runs before any retry')
    return {'state': 'dispatched', 'date': target_date, 'run_id': receipt['workflow_run_id'], 'url': receipt['html_url']}


def cleaner(github, run_id, attempt=None):
    source = f'actions/runs/{run_id}' + (f'/attempts/{attempt}' if attempt else '')
    run = github.api(source)
    target_date = run_date(run)
    if target_date is None or run['conclusion'] != 'success':
        return {'proceed': 'false', 'date': ''}
    pages = github.api(f'{source}/jobs?per_page=100', paginate=True)
    ready = any(step['name'] == READY_STEP and step['conclusion'] == 'success'
                for page in pages for job in page['jobs'] for step in job['steps'])
    return {'proceed': str(ready).lower(), 'date': target_date}


def outputs(values):
    if os.environ.get('GITHUB_OUTPUT'):
        with Path(os.environ['GITHUB_OUTPUT']).open('a') as stream:
            for key, value in values.items():
                stream.write(f'{key}={value}\n')
    print(json.dumps(values))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['watchdog', 'preflight', 'cleaner'])
    parser.add_argument('--repo', default=os.environ.get('GITHUB_REPOSITORY', 'ojfbot/daily-logger'))
    parser.add_argument('--date', default=os.environ.get('DATE_OVERRIDE') or None)
    parser.add_argument('--attempt', default=os.environ.get('SOURCE_RUN_ATTEMPT'))
    parser.add_argument('--dispatch', action='store_true', help='Allow one conditional workflow dispatch')
    parser.add_argument('--run-id', default=os.environ.get('SOURCE_RUN_ID', os.environ.get('GITHUB_RUN_ID')))
    args = parser.parse_args()
    github = GitHub(args.repo)
    target_date = calendar_date(args.date) if args.date else datetime.now(CHICAGO).date().isoformat()
    if args.mode == 'preflight':
        if not args.run_id or not str(args.run_id).isdigit():
            raise ValueError('Preflight requires its numeric current run ID')
        current = github.api(f'actions/runs/{args.run_id}')
        if not args.date:
            # A run queued across midnight must keep the date used by the watchdog's attribution.
            target_date = datetime.fromisoformat(current['created_at'].replace('Z', '+00:00')).astimezone(CHICAGO).date().isoformat()
        try:
            report_run_evidence(current, target_date)
        except (ValueError, KeyError, TypeError, OSError) as error:
            print(f'::warning title=Run evidence unavailable::{error}')
        outputs({'mode': preflight(github, target_date, os.environ.get('DRY_RUN') == 'true',
                                  args.run_id, int(current['run_attempt'])), 'date': target_date})
    elif args.mode == 'cleaner':
        if os.environ.get('EVENT_NAME') == 'workflow_dispatch':
            outputs({'proceed': 'true', 'date': target_date})
        else:
            if not args.run_id or not str(args.run_id).isdigit():
                raise ValueError('Cleaner requires a numeric source run ID')
            if args.attempt is not None and (not args.attempt.isdigit() or int(args.attempt) < 1):
                raise ValueError('Cleaner source attempt must be positive')
            outputs(cleaner(github, args.run_id, args.attempt))
    else:
        print(json.dumps(watchdog(github, target_date, args.dispatch)))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, KeyError, TypeError, OSError, subprocess.TimeoutExpired) as error:
        print(f'daily-blog schedule check failed: {error}', file=sys.stderr)
        sys.exit(1)
