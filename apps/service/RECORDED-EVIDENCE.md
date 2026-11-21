# Recorded evidence protocol

This S06a increment defines an offline replay boundary before the journal graph.
It checks that bounded recorded inputs and responses match an independently
supplied bundle digest. It does not collect evidence, call a model, generate an
article, grant approval, or publish. The existing fixture graph and API keep their
current admission and output contracts.

## Inputs and identity

`openRecordedEvidence(bytes, expectedBundleSha256)` accepts a bounded UTF-8 JSON
envelope. Obtain the expected digest from a separately reviewed fixture or a
future trusted admission record; a digest copied from the same untrusted bundle
does not authenticate its origin. Successful validation proves internal byte
consistency, not the truth of capture metadata, source claims, or embedded owner
approval assertions.
Inputs are ordinary same-realm `Uint8Array` or `Buffer` views over an
`ArrayBuffer`; shared backing stores, proxies and cross-realm inputs reject.

The envelope carries capture declarations, the reporting interval, evidence
references, text artifacts, exact requests and recorded response outcomes. It
distinguishes the reporting activity window from lookback material and current
action snapshots. Git object references and mutable API observations have
different provenance. Legacy context and action payloads remain opaque bytes;
they are not cast to semantically validated application objects.
Reporting timestamps must be canonical and ordered, but this boundary does not
recompute the Chicago cutoff, DST interval or run eligibility from their policy
label. The later semantic adapter must do that.

Identity has three levels:

- The evidence digest binds evidence descriptors and the hashes of their content.
- Each request digest binds that evidence, its role, provider/model, prompt and
  output-schema versions, exact request bytes and any preceding response.
- The outer digest covers the whole envelope, including response outcomes.

The local versioned canonical JSON encoding permits one byte representation.
It is not a claim of compliance with an external canonicalization standard.
Noncanonical encodings and duplicate object keys reject rather than being
silently normalized. Bounds apply to the encoded envelope, artifact bytes,
collections and structural depth. UTF-8 decoding and Unicode validation reject
invalid or lossy input.
Current limits are 8 MiB for the encoded envelope, 256 artifacts, 1 MiB per
artifact, 4 MiB total artifact text, 32 structural levels, 32,768 visited nodes
and 256 elements per collection. These are protocol limits, not host capacity
measurements.

## Replay behavior

An opened handle exposes only fixed qualification metadata and digest identities.
`readRecordedArtifact` returns a fresh byte buffer. `replayRecordedResponse`
requires the exact request binding and returns a recorded result or a closed
missing, failed, unknown or mismatched result. It has no provider fallback or
network path. Unknown completion remains unknown; missing usage remains unknown,
not zero. There is at most one request per role: draft, review and revision.
Request sets may be empty or a prefix of that sequence. Review requires the
recorded draft response, and revision requires the recorded review response;
each binds the immediately preceding returned bytes. Declared and recorded
provider/model identities must match exactly. Unknown identities and versions
remain `null` and cannot be inferred during lookup.
`returned` means response bytes were recorded; it does not assert schema validity,
factual correctness or complete generation. Finish reasons, including truncation,
remain available for later semantic checks.

Caller mutations and mutations of returned buffers cannot change later reads.
Repeated lookup returns the same bytes and does not consume a cursor. This is
replay determinism, not durable deduplication of a provider call. Errors expose
fixed codes without source text, model payloads or nested raw causes. The modules
do not log or emit telemetry.

Both `synthetic` and `recorded` are unverified capture declarations. A priority
snapshot's recorded approval is also an assertion, not authority. Historical
replay retains its recorded context and cannot substitute today's priorities.
Missing priorities remain explicit. A future journal admission must verify the
trusted owner decision, applicable interval and source revisions before allowing
goal-dependent recommendations. No handle authorizes publication, action
admission or execution.

## Qualification and next integration

`validateRecordedDraft(handle, binding)` in `recorded-article.ts` is the first
semantic adapter. It selects only an exactly matched `draft` recording whose
output schema is `dailylogger-article-v2`, using the stored binding snapshot.
Missing, failed, unknown and mismatched recordings retain their replay states.
Unsupported roles or schemas return fixed rejection codes. Returned artifact
text is independently bounded for nested JSON depth, nodes and collection size
before applying the shared `ArticleDataSchema` to the original parsed value.
Ordinary JSON whitespace is allowed; this adapter uses JavaScript JSON parsing
semantics, unlike the envelope's canonical encoding. Invalid syntax, lossy
Unicode scalars, nonfinite numbers, limit violations and schema failures return
fixed codes without raw payloads, diagnostics or causes.

The adapter does not try V1, fill missing fields, salvage partial output or
invoke a provider. A valid result is a fresh parsed article plus recorded usage
and finish metadata; truncated or unknown finish states remain visible. The
unchanged shared schema strips unknown fields and retains defaults and optional
status/outcome assertions. Therefore `validated` means original V2 shape only:
it is not a closed wire contract, source verification, completion, reporting-date
admission, a human verdict or permission to publish/admit/execute actions. Every
returned article explicitly retains unverified provenance and no authority.
The future graph must separately enforce service-owned status/outcome and
approval policy. The existing CLI keeps its original salvage behavior.

## Service draft request/output contract

`validateRecordedServiceDraft` is a separate adapter for
`dailylogger-service-draft-v1`. It does not change the legacy tool or the
`dailylogger-article-v2` replay behavior above. The new tool explicitly requests
the sealed report date, schemaVersion 2 and every ordinary authored field;
telemetry remains optional, with all six fields required when present. Candidate
ideas are limited to five open suggestions with the same report date. Article
status/outcome, closure claims, canonical action IDs and undeclared fields reject.

The bound `model_request` must be JSON with format
`dailylogger-service-draft-request-v1`. `serviceDraftRequest` creates this
normalized application request: route/model, report date, current prompt
version/system bytes, user prompt, telemetry selector, output-token ceiling and
the exact selected tool. The adapter checks those actual request contents against
the stored binding and sealed report; changing an output-schema label alone is
insufficient. This recording describes application intent, not a captured SDK
invocation, provider execution, approved budget or validated context. The numeric
request ceiling is a structural bound; durable spend admission remains separate.
The standalone request/tool helpers take ordinary application values; they are
not hostile-object admission APIs. The sealed adapter supplies bounded parsed
JSON, snapshots stored bindings and reports closed failure codes.

The response must pass the exact JSON schema supplied to the tool with coercion,
defaults and property removal disabled, then the shared article validator's
compatibility checks. The returned article copies the original parsed fields;
it does not return the shared validator's potentially normalized/defaulted view.
Both request and response JSON use the existing bounded parser and its documented
JavaScript JSON semantics. Failed, missing, unknown and mismatched exchanges stay
distinct; shape success retains truncation/unknown finish metadata and grants no
authority. Invalid outcomes expose closed codes without raw request/response text.

Tests cover the legacy mismatch, resealed wrong-tool recordings, date and route
binding, forbidden authority fields, mutation isolation and closed failures. The
final-image smoke consumes a separate synthetic service recording. No real
provider call, captured real draft, semantic context admission or graph recovery
is established. Reporting-window eligibility, approved priorities, grounding,
independent review and safe serialization of untrusted article text remain
separate boundaries; shape validation is not permission to publish.

Synthetic protocol and article tests exercise changed evidence/action/priority bindings,
wrong model or prompt, absent or uncertain responses, malformed references,
byte and nested JSON limits, mutation isolation, original-response rejection and
private-payload canaries. They run through
the ordinary `pnpm test:service` suite. They do not establish a captured real
draft, editorial quality or successful model operation.

The next adapter needs a genuine captured corpus and semantic normalization of
the existing collector, priority and action contracts. Extract pure legacy
transformations into the service image boundary before importing them; importing
the entire generator also brings provider dependencies and does not qualify its
runtime closure. The later journal graph should use its own versioned admission,
bind a run identity to the reviewed bundle digest, checkpoint artifact references
and preserve the existing fixture path. Real PostgreSQL restart/recovery and
budget/provider tests remain separate requirements for S06 completion.
