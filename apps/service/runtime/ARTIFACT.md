# Disposable fixture image delivery

The image proof now retains the image it tested. CI saves the owned runtime image,
checks every referenced config/layer object, removes only that image record without
force, reloads the archive and runs the existing runtime and TLS proofs once.
The Docker layer store may retain build content; this is export/reload qualification,
not a claim of recovery into an empty store.

One Python standard-library module owns the closed manifest and both delivery
commands. A TypeScript/Zod domain plus a separate ZIP adapter was considered; one
owner keeps the source, API and archive identity rules together without another
dependency. The verifier performs no image load, container execution, SSH or deploy.

## CI output

The workflow uploads exactly `manifest.json` and `runtime-image.tar`, retaining them
for seven days under `dailylogger-fixture-RUN-ATTEMPT`. Upload runs only after all
qualifications pass. The manifest binds the actual checkout, PR head/base, workflow,
run/attempt/job, Docker config ID, archive bytes, build-context receipt, source-file
digests, pinned PostgreSQL/Caddy images and named qualification receipts.

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
shape, successful attempt/job and matching enclosed job identity. Preserve that
review invariant when changing the workflow.

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

The output is always a disposable fixture candidate with `productionEligible:
false`. Private origin/source ranges, TLS files and application credentials remain
separate operator inputs. This increment implements no NAS activation, production
invoker, upgrade quiescence, restoration, real GitHub login or unattended renewal.
See [ingress preparation](INGRESS.md) for the remaining live checks.

GitHub documents [artifact identity and digest metadata](https://docs.github.com/en/rest/actions/artifacts),
[run-attempt evidence](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run-attempt)
and [job records](https://docs.github.com/en/rest/actions/workflow-jobs).
