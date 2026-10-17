"""Run the workflow's article boundary against real Git changes."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

WORKFLOW = Path(__file__).parents[1] / 'workflows/editorial-revise.yml'
ARTICLE = '_articles/2026-10-09.md'


class EditorialBoundaryTests(unittest.TestCase):
    def test_article_only_allowed_and_code_or_symlink_changes_rejected(self):
        workflow = WORKFLOW.read_text()
        blocks = re.findall(r'      - name: Require article and action data only before running PR code\n(.*?)(?=      - name:)', workflow, re.S)
        self.assertEqual(len(blocks), 2)
        for block in blocks:
            command = block.split('        run: |\n', 1)[1]
            command = '\n'.join(line[10:] for line in command.splitlines())
            for change in ['article', 'article_and_registry', 'code', 'symlink', 'registry_symlink', 'other_action_file']:
                with self.subTest(change=change), tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    def git(*args):
                        return subprocess.check_output(['git', *args], cwd=root, text=True).strip()
                    git('init', '-q')
                    git('config', 'user.name', 'Boundary test')
                    git('config', 'user.email', 'boundary@example.invalid')
                    (root / '_articles').mkdir()
                    (root / ARTICLE).write_text('original article')
                    (root / 'package.json').write_text('{}')
                    (root / 'actions').mkdir()
                    (root / 'actions/registry.json').write_text('{}')
                    git('add', '.')
                    git('commit', '-qm', 'base')
                    base = git('rev-parse', 'HEAD')
                    git('remote', 'add', 'origin', str(root))
                    (root / ARTICLE).write_text('accepted article')
                    if change == 'code':
                        (root / 'package.json').write_text('{"scripts":{"postinstall":"malicious"}}')
                    if change == 'symlink':
                        (root / ARTICLE).unlink()
                        (root / ARTICLE).symlink_to('../package.json')
                    if change == 'article_and_registry':
                        (root / 'actions/registry.json').write_text('{"updated":true}')
                    if change == 'registry_symlink':
                        (root / 'actions/registry.json').unlink()
                        (root / 'actions/registry.json').symlink_to('../package.json')
                    if change == 'other_action_file':
                        (root / 'actions/execute.ts').write_text('throw new Error("unexpected code")')
                    git('add', '.')
                    git('commit', '-qm', 'accept draft')
                    head = git('rev-parse', 'HEAD')
                    git('checkout', '--detach', base)
                    result = subprocess.run(['bash', '-eo', 'pipefail', '-c', command], cwd=root,
                                            env={**os.environ, 'BASE_SHA': base, 'ARTICLE_PATH': ARTICLE, 'HEAD_SHA': head, 'HEAD_BRANCH': 'accept/2026-10-09'},
                                            capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0 if change in ['article', 'article_and_registry'] else 1, result.stderr)

                    if change == 'article':
                        self.assertEqual(git('rev-parse', 'HEAD'), head)
                        remote = root / 'remote.git'
                        git('init', '--bare', '-q', str(remote))
                        git('remote', 'set-url', 'origin', str(remote))
                        pushes = re.findall(r'^\s*(git push origin .+)$', workflow, re.M)
                        self.assertEqual(len(pushes), 2)
                        for push in pushes:
                            subprocess.check_call(['bash', '-eo', 'pipefail', '-c', push], cwd=root,
                                                  env={**os.environ, 'HEAD_BRANCH': 'accept/2026-10-09'},
                                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        self.assertEqual(git('--git-dir', str(remote), 'rev-parse', 'refs/heads/accept/2026-10-09'), head)
