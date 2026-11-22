from datetime import datetime, timezone
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tarfile
from tempfile import TemporaryFile

from artifact import FIXTURE_PROFILE, inspect_image_archive, json_bytes, parse_manifest


DOCKER = ["docker", "--host", "unix:///var/run/docker.sock"]
SERVICES = ["api", "worker", "database"]
PROJECT_LABEL = "com.docker.compose.project"
DIRECTORY_LABEL = "com.docker.compose.project.working_dir"
SERVICE_LABEL = "com.docker.compose.service"
STAGE_DIRECTORY_LABEL = "com.ojfbot.dailylogger.stage.directory"
ENV = {key: value for key, value in os.environ.items()
       if not key.startswith(("DAILYLOGGER_", "COMPOSE_", "DOCKER_"))}


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def run(argv, *, cwd, capture=False, timeout=90, input_text=None):
    return subprocess.run(argv, cwd=cwd, env=ENV, check=True, text=True,
                          capture_output=capture, timeout=timeout, input=input_text).stdout


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def atomic_json(path, value):
    pending = path.with_name(path.name + ".pending-" + secrets.token_hex(6))
    with pending.open("x") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    pending.replace(path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def private_directory(path):
    return path.is_dir() and not path.is_symlink() and not path.stat().st_mode & 0o077


def one_file(directory, name):
    path = directory / name
    require(path.is_file() and not path.is_symlink() and not path.stat().st_mode & 0o077,
            "Incomplete or public staging file: " + name)
    return path


def verify_release(directory):
    manifest = parse_manifest(json_bytes(one_file(directory, "manifest.json").read_bytes()), FIXTURE_PROFILE)
    verification = json_bytes(one_file(directory, "verification.json").read_bytes())
    archive = one_file(directory, "runtime-image.tar")
    require(manifest["purpose"] == "disposable-fixture-candidate" and
            verification["purpose"] == "verified-disposable-fixture-candidate" and
            verification["productionEligible"] is False and
            manifest["source"] == verification["source"] and manifest["source"]["event"] == "pull_request",
            "Staging expects a verified PR fixture image")
    require(manifest["ci"]["runId"] == verification["runId"] and
            manifest["ci"]["attempt"] == verification["attempt"], "CI run does not match verification")
    image = manifest["image"]
    require(image["configId"] == verification["imageConfigId"] and image["engineId"] == verification["imageEngineId"],
            "Verified image identity does not match manifest")
    require(archive.stat().st_size == manifest["archive"]["size"] and
            digest(archive) == manifest["archive"]["sha256"] == verification["archiveSha256"],
            "NAS receiver archive does not match the verified CI artifact")
    compose = one_file(directory, "compose.yaml")
    require(digest(compose) == manifest["sourceFileDigests"]["apps/service/runtime/compose.yaml"],
            "Compose file differs from the reviewed source")
    stage_inputs = json_bytes(one_file(directory, "stage-inputs.json").read_bytes())
    require(digest(one_file(directory, "probe.mjs")) == stage_inputs["probeSha256"] and
            digest(Path(__file__)) == stage_inputs["stagerSha256"] and
            digest(one_file(directory, "artifact.py")) == stage_inputs["verifierSha256"],
            "NAS staging helpers do not match the transfer")
    revision = manifest["source"]["builtRevision"]
    require(re.fullmatch(r"[a-f0-9]{40}", revision), "Invalid built revision")
    return manifest


def rewrite_image(archive_path, output, image, tag):
    old = "dailylogger-runtime:proof"
    root_names = {"index.json", "manifest.json", "oci-layout"}
    seen = set()
    with tarfile.open(archive_path, mode="r:") as source, tarfile.open(fileobj=output, mode="w|") as target:
        for member in source:
            require(member.name not in seen, "Duplicate load member")
            seen.add(member.name)
            if member.name in {"blobs", "blobs/sha256"}:
                require(member.isdir() and member.size == 0, "Unexpected directory framing")
                continue
            require(member.isfile() and (member.name in root_names or
                    re.fullmatch(r"blobs/sha256/[0-9a-f]{64}", member.name)),
                    "Unexpected Docker load member")
            data = source.extractfile(member)
            if member.name in {"index.json", "manifest.json"}:
                require(member.size <= 64 * 1024, "Image load metadata exceeds its limit")
                metadata = json_bytes(data.read())
                if member.name == "index.json":
                    require(set(metadata) == {"schemaVersion", "mediaType", "manifests"}, "Unexpected index fields")
                    (entry,) = metadata["manifests"]
                    require(set(entry) == {"mediaType", "digest", "size", "annotations"} and
                            entry["digest"] == image["engineId"], "Unexpected load index")
                    annotations = entry["annotations"]
                    require(set(annotations) == {"io.containerd.image.name", "org.opencontainers.image.ref.name"} and
                            annotations["io.containerd.image.name"] == "docker.io/library/" + old and
                            annotations["org.opencontainers.image.ref.name"] == "proof", "Unexpected original image tag")
                    annotations["io.containerd.image.name"] = "docker.io/library/" + tag
                    annotations["org.opencontainers.image.ref.name"] = tag.split(":")[1]
                else:
                    (entry,) = metadata
                    require(set(entry) == {"Config", "RepoTags", "Layers"} and entry["RepoTags"] == [old],
                            "Unexpected Docker-save load manifest")
                    entry["RepoTags"] = [tag]
                encoded = json.dumps(metadata).encode()
                member.size = len(encoded)
                data = io.BytesIO(encoded)
            member.pax_headers = {}
            target.addfile(member, data)
        require(root_names <= seen, "OCI load metadata is incomplete")
        source.fileobj.seek(source.offset)
        for trailer in iter(lambda: source.fileobj.read(64 * 1024), b""):
            require(not any(trailer), "Data follows the end of the input archive")
    output.seek(0)
    identities = inspect_image_archive(output)
    require(identities["configId"] == image["configId"] and
            identities["engineKinds"].get(image["engineId"]) == image["engineIdentityKind"],
            "Rewritten load archive does not match the qualified image")
    output.seek(0)


def load_image(directory, manifest):
    image = manifest["image"]
    tag = "dailylogger-runtime:private-stage-" + manifest["source"]["builtRevision"]
    try:
        observed = run([*DOCKER, "image", "inspect", tag], cwd=directory, capture=True, timeout=15)
    except subprocess.CalledProcessError:
        # Keep the retained archive intact and verify the retagged closure before sending it to Docker.
        with TemporaryFile(dir=directory) as archive:
            rewrite_image(directory / "runtime-image.tar", archive, image, tag)
            subprocess.run([*DOCKER, "load"], cwd=directory, env=ENV, stdin=archive, check=True, timeout=120)
        observed = run([*DOCKER, "image", "inspect", tag], cwd=directory, capture=True, timeout=15)
    (metadata,) = json.loads(observed)
    require(metadata["Id"] in {image["configId"], image["engineId"]} and
            (metadata["Os"], metadata["Architecture"], metadata["Config"]["User"]) ==
            ("linux", "amd64", "1000:1000"), "Loaded image identity or runtime user does not match")
    return metadata["Id"]


def stage_environment(directory, image_id):
    password = secrets.token_hex(32)
    with (directory / ".env").open("x") as settings:
        settings.write(
            f"DAILYLOGGER_RUNTIME_IMAGE={image_id}\n"
            f"DAILYLOGGER_DATABASE_PASSWORD={password}\n"
            f"DAILYLOGGER_DATABASE_URL=postgresql://dailylogger:{password}@database:5432/dailylogger\n"
            "DAILYLOGGER_PRIVATE_ORIGIN=https://dailylogger-stage.invalid\n"
            "DAILYLOGGER_OWNER_GITHUB_ID=1\n"
            f"DAILYLOGGER_GITHUB_CLIENT_ID=fixture-{secrets.token_hex(12)}\n"
            f"DAILYLOGGER_GITHUB_CLIENT_SECRET={secrets.token_hex(32)}\n"
        )
    limits = {"database": "768m", "api": "512m", "worker": "512m"}
    owner = {"labels": {STAGE_DIRECTORY_LABEL: str(directory)}}
    overlay = {
        "services": {service: {"restart": "unless-stopped", "mem_limit": capacity,
                               "logging": {"driver": "json-file", "options": {"max-size": "5m", "max-file": "2"}}}
                     for service, capacity in limits.items()},
        "networks": {"application": owner, "oauth-outbound": {"internal": True, **owner}},
        "volumes": {"application-database": owner, "fixture-files": owner},
    }
    atomic_json(directory / "stage.json", overlay)


def compose_command(directory, project):
    return [*DOCKER, "compose", "--project-name", project, "--project-directory", str(directory),
            "--env-file", ".env", "-f", "compose.yaml", "-f", "stage.json"]


def require_unused_project(directory, project):
    label = "label=" + PROJECT_LABEL + "=" + project
    containers = run([*DOCKER, "ps", "-aq", "--filter", label], cwd=directory, capture=True)
    require(not containers.strip(), "Staging Compose project already has containers")
    for resource in ("network", "volume"):
        command = [*DOCKER, resource, "ls"]
        owned = run([*command, "-q", "--filter", label], cwd=directory, capture=True)
        names = run([*command, "--format", "{{.Name}}"], cwd=directory, capture=True)
        require(not owned.strip() and not any(name.startswith(project + "_") for name in names.splitlines()),
                "Staging Compose project already has " + resource + " resources")


def project_containers(directory, project):
    ids = run([*DOCKER, "ps", "-aq", "--filter", f"label={PROJECT_LABEL}={project}"],
              cwd=directory, capture=True).split()
    if not ids:
        return []
    containers = json.loads(run([*DOCKER, "inspect", *ids], cwd=directory, capture=True))
    for container in containers:
        labels = container["Config"]["Labels"]
        require(labels.get(PROJECT_LABEL) == project and labels.get(DIRECTORY_LABEL) == str(directory) and
                labels.get(SERVICE_LABEL) in [*SERVICES, "migrate"], "Stage operation refuses a foreign container")
    return containers


def stop_candidate(directory, project):
    containers = project_containers(directory, project)
    for service in ("api", "migrate", "worker", "database"):
        ids = [c["Id"] for c in containers if c["Config"]["Labels"][SERVICE_LABEL] == service and c["State"]["Running"]]
        if ids:
            run([*DOCKER, "stop", "--time", "10", *ids], cwd=directory)


def qualify(directory, project, image_id, manifest):
    def compose(*args, **kwargs):
        return run([*compose_command(directory, project), *args], cwd=directory, **kwargs)

    config = json.loads(compose("--profile", "migration", "config", "--format", "json", capture=True))
    require(all(not s.get("ports") for s in config["services"].values()) and
            all(n["internal"] for n in config["networks"].values()), "Staging exposes a port or external network")
    require(config["services"]["database"]["image"] == manifest["upstreamImages"]["postgres"],
            "Database pin differs from CI qualification")
    require(all(config["services"][name]["image"] == image_id for name in ["api", "worker", "migrate"]),
            "Compose did not select the verified runtime")
    require(all(not v.get("external") and v["name"].startswith(project + "_")
                for v in config["volumes"].values()), "Staging is not using isolated project volumes")
    compose("up", "-d", "--wait", "--wait-timeout", "45", "--pull", "never", "database")
    compose("run", "--rm", "--no-deps", "--pull", "never", "migrate")
    compose("up", "-d", "--pull", "never", "api", "worker")
    probe = (directory / "probe.mjs").read_text()

    def smoke(*args):
        return json.loads(compose("exec", "-T", "api", "node", "--import", "tsx", "--input-type=module",
                                  "-", *args, input_text=probe, capture=True, timeout=75))

    admitted = smoke("start")
    compose("restart", "api", "worker")
    result = smoke("resume", admitted["runId"], admitted["resumeTargetId"], admitted["key"])
    containers = {}
    networks = {}
    for service in SERVICES:
        container = compose("ps", "-q", service, capture=True).strip()
        details = json.loads(run([*DOCKER, "inspect", container], cwd=directory, capture=True))[0]
        require(details["State"]["Status"] == "running" and not details["HostConfig"]["PortBindings"],
                service + " is stopped or has a published host port")
        attachments = details["NetworkSettings"]["Networks"]
        require(set(attachments) == ({project + "_application", project + "_oauth-outbound"} if service == "api"
                                     else {project + "_application"}), "A service joined an unexpected network")
        for name in attachments:
            networks.setdefault(name, set()).add(details["Id"])
        if service != "database":
            require(details["Image"] in {image_id, manifest["image"]["configId"]}, "Running image does not match")
        else:
            require(details["State"]["Health"]["Status"] == "healthy", "PostgreSQL is not healthy")
        containers[service] = "healthy" if service == "database" else "running"
    for name, members in networks.items():
        network = json.loads(run([*DOCKER, "network", "inspect", name], cwd=directory, capture=True))[0]
        require(network["Internal"] and network["Labels"].get(PROJECT_LABEL) == project and
                network["Labels"].get(STAGE_DIRECTORY_LABEL) == str(directory) and set(network["Containers"]) == members,
                "Stage network is not internal and project-owned")
    flags = ("anonymousRequestRejected", "invalidCsrfRejected", "stoppedAndResumed",
             "duplicateStayedSameRun", "articleAndActionsMatch")
    require(all(result[flag] is True for flag in flags), "Staging smoke failed")
    return {"services": containers, "noPublishedPorts": True, "isolatedNetworks": True, **result}


def activate(root, pending):
    require(private_directory(root) and private_directory(pending) and pending.parent == root,
            "Staging inbox must be a private directory directly beneath the stage root")
    require(re.fullmatch(r"incoming\.[A-Za-z0-9]+", pending.name), "Invalid staging inbox")
    with (root / ".release.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        manifest = verify_release(pending)
        revision = manifest["source"]["builtRevision"]
        attempt = secrets.token_hex(6)
        project = "dailylogger-stage-" + revision[:16] + "-" + attempt
        require_unused_project(pending, project)
        store = root / "releases"
        store.mkdir(mode=0o700, exist_ok=True)
        require(private_directory(store), "Release store is not private")
        destination = store / (revision + "-" + attempt)
        require(not os.path.lexists(destination), "Stage attempt already exists")
        current = root / "active.json"
        previous = json.loads(current.read_text()) if current.exists() else None
        require(not previous or previous["revision"] != revision, "This revision is already the active stage")
        pending.rename(destination)
        atomic_json(destination / "project.json", {"project": project})
        active = {"revision": revision, "release": destination.name, "project": project, "qualified": True}
        configured = False
        try:
            image = load_image(destination, manifest)
            stage_environment(destination, image)
            configured = True
            smoke = qualify(destination, project, image, manifest)
            receipt = {
                "result": "PASS", "scope": "private-fixture-staging",
                "completedAt": datetime.now(timezone.utc).isoformat(),
                "revision": revision, "prHead": manifest["source"]["pullRequest"]["head"],
                "ciRunId": manifest["ci"]["runId"], "release": destination.name, "project": project,
                "previousRevision": previous["revision"] if previous else None,
                "productionEligible": False, **smoke,
            }
            atomic_json(destination / "stage-receipt.json", receipt)
            atomic_json(current, active)
        except Exception as error:
            stop_status = "not-started"
            if configured:
                try:
                    live = json.loads(current.read_text()) if current.exists() else None
                except (OSError, ValueError):
                    stop_status = "activation-uncertain"
                else:
                    if live == active:
                        stop_status = "activation-uncertain"
                    else:
                        try:
                            stop_candidate(destination, project)
                            stop_status = "stopped-candidate"
                        except (RuntimeError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
                            stop_status = "stop-failed"
            atomic_json(destination / "stage-failure.json",
                        {"result": "FAIL", "revision": revision, "candidate": stop_status,
                         "error": type(error).__name__})
            raise
        print(json.dumps(receipt), flush=True)


def discard(release):
    root = release.parent.parent
    require(release.parent.name == "releases" and all(private_directory(path) for path in (root, release.parent, release)),
            "Discard requires a private retained stage release")
    with (root / ".release.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        manifest = verify_release(release)
        revision = manifest["source"]["builtRevision"]
        match = re.fullmatch(revision + "-([a-f0-9]{12})", release.name)
        require(match, "Release path and identity differ")
        current = root / "active.json"
        require(not current.exists() or json.loads(current.read_text())["release"] != release.name,
                "Discard refuses the active staging release")
        project = json_bytes(one_file(release, "project.json").read_bytes())["project"]
        require(project == "dailylogger-stage-" + revision[:16] + "-" + match.group(1),
                "Release project identity is invalid")
        env_file = release / ".env"
        overlay = release / "stage.json"
        if not env_file.exists() or not overlay.exists():
            require_unused_project(release, project)
            env_file.unlink(missing_ok=True)
            overlay.unlink(missing_ok=True)
            return
        project_containers(release, project)
        command = compose_command(release, project)
        config = json.loads(run([*command, "config", "--format", "json"], cwd=release, capture=True))
        for kind in ("volume", "network"):
            for resource in config[kind + "s"].values():
                expected = resource["name"]
                require(expected.startswith(project + "_") and not resource.get("external"),
                        "Stage cleanup refuses an external resource")
                listed = run([*DOCKER, kind, "ls", "--format", "{{.Name}}"], cwd=release, capture=True)
                if expected in listed.splitlines():
                    (existing,) = json.loads(run([*DOCKER, kind, "inspect", expected], cwd=release, capture=True))
                    require(existing["Labels"].get(PROJECT_LABEL) == project and
                            existing["Labels"].get(STAGE_DIRECTORY_LABEL) == str(release),
                            "Stage cleanup refuses a resource with a different owner")
        run([*command, "down", "--volumes"], cwd=release)
        require_unused_project(release, project)
        env_file.unlink(missing_ok=True)
        overlay.unlink(missing_ok=True)
        print("Discarded inactive private stage containers, volumes and credentials.", flush=True)


if __name__ == "__main__":
    os.umask(0o077)
    if len(sys.argv) == 3 and sys.argv[1] == "discard":
        discard(Path(sys.argv[2]).absolute())
    else:
        require(len(sys.argv) == 3 and sys.argv[1] == "activate",
                "Usage: private-stage.py activate /private/stage/root/incoming.NAME")
        inbox = Path(sys.argv[2]).absolute()
        activate(inbox.parent, inbox)
