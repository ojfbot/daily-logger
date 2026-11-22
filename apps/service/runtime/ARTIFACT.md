# Fixture and release-candidate image delivery

The image proof now retains the image it tested. CI saves the owned runtime image,
checks every referenced config/layer object, removes only that image record without
force, reloads the archive and runs the existing runtime and TLS proofs once.
The Docker layer store may retain build content; this is export/reload qualification,
not a claim of recovery into an empty store.

One Python standard-library module owns the closed manifest and export/verify
commands. A TypeScript/Zod domain plus a separate ZIP adapter was considered; one
owner keeps the source, API and archive identity rules together without another
dependency. The verifier performs no image load, container execution, SSH or deploy.

## CI output

The workflow uploads exactly `manifest.json` and `runtime-image.tar`, retaining them
for seven days under `dailylogger-fixture-RUN-ATTEMPT`. Upload runs only after all
qualifications pass. The manifest binds the actual checkout, PR head/base, workflow,
run/attempt/job, Docker config ID, archive bytes, build-context receipt, source-file
digests, pinned PostgreSQL/Caddy images and named qualification receipts.

The combined inactive-exporter image requires three additional closed fields in
the offline receipt: `compiledExporterChild: "ready-then-closed"`, integer
`exporterBatches: 0`, and `defaultTelemetry: "disabled"`. The final-image smoke
starts the real compiled child with synthetic file references and closes it
without sending a batch. Missing fields, a no-op-only startup, nonzero/boolean
batch counts or an enabled default reject; older offline receipts are not silently
accepted as proof of this combined image. This remains fixture qualification,
not live Langfuse ingestion or permission to enable the API/worker adapter.

Artifact manifest version 2 additionally requires `enabledExporter` and
`matchedRestore` summaries. Both contain the same engine ID, config ID and pinned
PostgreSQL image as the exported archive. Exporter qualification requires all four
tests, successful cleanup and explicit absence of real Langfuse/host qualification.
Restore qualification requires its complete non-skipped TAP run, all recovery
checks, successful cleanup and no production recovery-authority claim. These
closed summaries omit resource names, paths, connection strings and private data.
Version 1 manifests remain historical fixture evidence; the current receiver
rejects them rather than interpreting missing gates as passed. The independent
receiver expectation and receipt retain their own version 1 schemas.

The shared export command owns one export/reload, runtime smoke, ingress smoke,
enabled-exporter pass and matched-restore pass, in that order. Preparation and
restore counts are read from TAP; HTTP counts remain a separate required receipt.
Both profiles use this producer. A failed process, missing/duplicate receipt,
identity mismatch, skipped suite or cleanup failure prevents manifest creation.
The workflows upload only after this command succeeds and do not repeat its gates.

The actual PR checkout is a synthetic merge, distinct from the PR head. Docker
config IDs, engine index/manifest identities, upstream OCI digests, inner tar hashes and GitHub's outer artifact ZIP
digest are separate identities. The final outer ID/digest is recorded by the
receiver; including it inside its own artifact would create a circular dependency.
The manifest records both config and engine identities. For an OCI archive, every
referenced index/manifest/config/layer blob is hash-checked and the executing
engine target must lead to the recorded runtime config. Layer expansion is bounded.

The workflow has one reviewed producer/uploader job. GitHub's artifact metadata
binds an artifact to a run, rather than independently attesting its numeric job.
The verifier authenticates the reviewed workflow source and its single-uploader
shape, successful attempt/job and matching enclosed job identity. These shape
checks are not a general YAML semantic validator; preserve reviewed-source trust
and the single-uploader invariant when changing the workflow.

## Release candidates from merged source

`service-release-candidate.yml` is a separate, manual workflow. It runs only when
dispatched from `main`, accepts a service-scoped version in
`vMAJOR.MINOR.PATCH-rc.N` form, and repeats the same build, export/reload, runtime,
HTTP, private-TLS, enabled-exporter and matched-restore qualification. Its sealed manifest and receiver expectation
contain the version, `main` source revision, release workflow path and release job.
The workflow retains `manifest.json` and `runtime-image.tar` for 90 days under
`dailylogger-release-candidate-VERSION-RUN-ATTEMPT`.

Both workflows type-check the shared journal and exercise artifact-policy tests
before building. Release-workflow-only changes trigger the PR runtime workflow,
which exercises the same producer and gates using its fixture profile. This is not
an actual main-dispatched release-candidate run; record that separately after merge.

GitHub's 90-day artifact retention is an evidence window, not the durable private
release store. A later slice must copy only a verified candidate into the chosen
private store before an operator can promote or recover it.

The receiver authenticates this candidate exactly as it authenticates fixture
output, then writes a `verified-release-candidate` receipt with the version and
image identities. A wrong version, workflow, source ref, artifact bytes or image
archive fails before an image is loaded. This is a release candidate for later
private storage and deployment qualification. It does not create a Git tag,
publish an image, activate the NAS or mark the candidate production eligible.

## Verify on the receiving controller

Use the controller's existing authenticated `gh` installation with repository
Actions-read access. No GitHub credential belongs in the API, worker or payload.
Create an expectation JSON from the independently reviewed source and CI record:

```json
{
  "schemaVersion": 1,
  "artifactId": 123,
  "runId": 456,
  "attempt": 1,
  "source": {
    "builtRevision": "<actual tested 40-hex checkout>",
    "event": "pull_request",
    "ref": "refs/pull/123/merge",
    "pullRequest": {
      "number": 123,
      "head": "<reviewed 40-hex PR head>",
      "base": "<reviewed 40-hex PR base>"
    }
  }
}
```

The values above are placeholders. Never obtain the expected checkout solely from
the downloaded manifest. Manual fixture runs use `event: workflow_dispatch`, an
exact `refs/heads/...` ref and `pullRequest: null`.

```sh
pnpm service:artifact:verify --expected /private/path/expected.json \
  --output /private/path/new-verified-candidate
```

Verification first authenticates immutable artifact/run/attempt/job and source
records through fixed GitHub API routes. It checks expiry and verifies the outer
ZIP bytes before parsing. It then rejects unsafe/extra members, duplicate JSON,
unsupported identities and incomplete qualification, checks inner archive/config/
layer hashes, and writes a private verification receipt in the new output directory.
Downloads are bounded by the authenticated artifact size, with a two-GiB ceiling.
They also have a 600-second total deadline; expiry terminates the owned downloader.
Existing destinations and Git metadata/worktrees are rejected.
File operations use the created directory descriptor. If its pathname is replaced,
verification fails and preserves the replacement. Every failed private stage is
retained with an `UNQUALIFIED` marker for explicit reconciliation; failure handling
never recursively deletes a pathname. Raw tar headers are bounded before parsing;
layout-changing PAX and GNU longname/link/sparse framing are rejected. An accepted
index has exactly one runnable Linux/amd64 manifest; attestations remain separate.

The output is always a non-production candidate with `productionEligible: false`.
Private origin/source ranges, TLS files and application credentials remain
separate operator inputs. This increment implements no NAS activation, production
invoker, upgrade quiescence, restoration, real GitHub login or unattended renewal.
See [ingress preparation](INGRESS.md) for the remaining live checks.

## Private fixture staging on a host

Select a successful `service-runtime.yml` run from this repository for the exact
PR head. Staging expects the OCI index archive produced by this workflow.
Independently pin its tested merge and artifact ID and run the receiver above.
Transfer its three verified files into a new, mode-0700 `incoming.NAME`
directory under a dedicated private stage root. Include the candidate's
`compose.yaml`, `artifact.py`, and `private-stage.py`, and copy
`private-stage-probe.mjs` as `probe.mjs`. Use mode 0600 for files. Generate
`stage-inputs.json` on the receiver controller with the SHA-256 values of
`probe.mjs`, `private-stage.py`, and `artifact.py` under the respective keys
`probeSha256`, `stagerSha256`, and `verifierSha256`.

Run `python3 <inbox>/private-stage.py activate <inbox>`. The helper retains the
release by built revision and attempt, rechecks the runtime bytes before Docker
load, and starts a dedicated Compose project on internal networks with zero
published ports. It generates fixture credentials locally. After the API and
worker recover a test run across a restart, the helper writes the test receipt
and atomically records the active staging revision. Verify the receipt, active
record, and running containers agree before recording success.

On a failed smoke test the helper stops only the candidate and keeps the prior
active revision. Retry a failed build with a new inbox containing the same
verified files. Each attempt has its own directory and project. If interrupted,
check the active record and exact candidate containers before retrying. To
reclaim an inactive candidate's resources, run
`python3 <release>/private-stage.py discard <release>`. This deletes its fixture
volumes and local credentials and keeps its release files and receipts for
operator review. Release files have no automatic expiry. Each revision has
fresh stage-only data. This path does not verify a browser login or publish an
article.

GitHub documents [artifact identity and digest metadata](https://docs.github.com/en/rest/actions/artifacts),
[run-attempt evidence](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run-attempt)
and [job records](https://docs.github.com/en/rest/actions/workflow-jobs).
