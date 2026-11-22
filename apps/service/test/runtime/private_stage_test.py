"""Behavioral tests for candidate-only staging and cleanup."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from artifact_test import GithubFixture, artifact


SPEC = importlib.util.spec_from_file_location(
    "dailylogger_private_stage", Path(__file__).resolve().parents[2] / "runtime/private-stage.py"
)
stage = importlib.util.module_from_spec(SPEC)
with patch.dict(sys.modules, {"artifact": artifact}):
    SPEC.loader.exec_module(stage)

verify_release = stage.verify_release
REVISION = "1" * 40
MANIFEST = {
    "source": {"builtRevision": REVISION, "pullRequest": {"head": "2" * 40}},
    "ci": {"runId": 42},
}


class PrivateStageTests(unittest.TestCase):
    def setUp(self):
        old_umask = os.umask(0o077)
        self.addCleanup(os.umask, old_umask)
        self.root = Path(self.enterContext(TemporaryDirectory()))
        self.enterContext(patch.object(stage, "verify_release", return_value=MANIFEST))
        self.enterContext(patch.object(stage, "load_image", return_value="sha256:fixture"))
        self.enterContext(patch.object(stage, "require_unused_project"))

    def inbox(self, label):
        source = self.root / ("incoming." + label)
        source.mkdir()
        return source

    def test_failed_smoke_keeps_prior_stage_and_same_build_can_be_retried(self):
        current = self.root / "active.json"
        current.write_text(json.dumps({"revision": "3" * 40, "release": "older"}))
        with patch.object(stage, "qualify", side_effect=RuntimeError("smoke failed")), \
                patch.object(stage, "stop_candidate") as stop:
            with self.assertRaisesRegex(RuntimeError, "smoke failed"):
                stage.activate(self.root, self.inbox("first"))
        failed, = (self.root / "releases").iterdir()
        first_project = json.loads((failed / "project.json").read_text())["project"]
        stop.assert_called_once_with(failed, first_project)
        self.assertEqual(json.loads(current.read_text())["release"], "older")
        self.assertFalse((failed / "stage-receipt.json").exists())
        self.assertEqual(json.loads((failed / "stage-failure.json").read_text())["candidate"], "stopped-candidate")

        with patch.object(stage, "qualify", return_value={"services": {}}):
            stage.activate(self.root, self.inbox("second"))
        active = json.loads(current.read_text())
        self.assertEqual(active["revision"], REVISION)
        self.assertNotEqual(active["project"], first_project)
        self.assertNotEqual(active["release"], failed.name)

        config = json.dumps({"volumes": {}, "networks": {}})
        with patch.object(stage, "project_containers"), patch.object(stage, "run", side_effect=[config, None]) as run:
            stage.discard(failed)
        self.assertEqual(run.call_args.args[0][-2:], ["down", "--volumes"])
        self.assertFalse((failed / ".env").exists())
        self.assertTrue((failed / "stage-failure.json").exists())
        with self.assertRaisesRegex(RuntimeError, "refuses the active"):
            stage.discard(self.root / "releases" / active["release"])

    def test_visible_activation_is_not_stopped_if_directory_sync_errors(self):
        current = self.root / "active.json"
        write = stage.atomic_json

        def writes_then_errors(path, payload):
            write(path, payload)
            if path == current:
                raise OSError("directory sync failed")

        with patch.object(stage, "qualify", return_value={"services": {}}), \
                patch.object(stage, "atomic_json", side_effect=writes_then_errors), \
                patch.object(stage, "stop_candidate") as stop:
            with self.assertRaisesRegex(OSError, "directory sync failed"):
                stage.activate(self.root, self.inbox("candidate"))
        stop.assert_not_called()
        release = self.root / "releases" / json.loads(current.read_text())["release"]
        self.assertEqual(json.loads((release / "stage-failure.json").read_text())["candidate"], "activation-uncertain")

    def test_discard_refuses_project_containers_owned_by_another_stage_root(self):
        with patch.object(stage, "qualify", side_effect=RuntimeError("smoke failed")), \
                patch.object(stage, "stop_candidate"):
            with self.assertRaisesRegex(RuntimeError, "smoke failed"):
                stage.activate(self.root, self.inbox("candidate"))
        release, = (self.root / "releases").iterdir()
        project = json.loads((release / "project.json").read_text())["project"]
        foreign = [{"Config": {"Labels": {stage.PROJECT_LABEL: project, stage.DIRECTORY_LABEL: str(self.root),
                                          stage.SERVICE_LABEL: "api"}}}]
        with patch.object(stage, "run", side_effect=["container-id", json.dumps(foreign)]) as run:
            with self.assertRaisesRegex(RuntimeError, "foreign container"):
                stage.discard(release)
        self.assertEqual(run.call_count, 2)
        self.assertTrue((release / ".env").exists())

    def test_qualification_enables_migration_profile_for_config(self):
        directory = self.inbox("candidate")
        with patch.object(stage, "run", side_effect=subprocess.CalledProcessError(1, "docker")) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                stage.qualify(directory, "test-project", "sha256:fixture", MANIFEST)
        self.assertEqual(run.call_args.args[0][-5:], ["--profile", "migration", "config", "--format", "json"])

    def test_classic_archive_is_refused_before_intake(self):
        directory = self.inbox("classic")
        fixture = GithubFixture()
        manifest = fixture.manifest
        (directory / "manifest.json").write_text(json.dumps(manifest))
        (directory / "verification.json").write_text(json.dumps({
            "purpose": "verified-disposable-fixture-candidate", "productionEligible": False,
            "source": manifest["source"], "runId": manifest["ci"]["runId"], "attempt": manifest["ci"]["attempt"],
            "engineIdentityKind": "config-sha256",
        }))
        (directory / "runtime-image.tar").write_bytes(fixture.image)
        with patch.object(stage, "verify_release", verify_release):
            with self.assertRaisesRegex(RuntimeError, "requires an OCI index archive"):
                stage.activate(self.root, directory)
        self.assertTrue(directory.is_dir())
        self.assertFalse((self.root / "releases").exists())

    def test_discard_removes_credentials_when_overlay_write_failed(self):
        write = stage.atomic_json

        def fails_overlay(path, payload):
            if path.name == "stage.json":
                raise OSError("overlay write failed")
            write(path, payload)

        with patch.object(stage, "atomic_json", side_effect=fails_overlay):
            with self.assertRaisesRegex(OSError, "overlay write failed"):
                stage.activate(self.root, self.inbox("partial"))
        release, = (self.root / "releases").iterdir()
        self.assertTrue((release / ".env").exists())
        self.assertFalse((release / "stage.json").exists())
        with patch.object(stage, "run") as command:
            stage.discard(release)
        command.assert_not_called()
        self.assertFalse((release / ".env").exists())
