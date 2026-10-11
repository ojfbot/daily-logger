// One-time check of the settled snapshot at PR #340's final head only.
// Later legitimate appends/projections are expected to fail these exact counts/digests.
// Not a general ledger validator; do not add it to CI or package scripts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const receipt = read('decisions/daily-queue/2026-10-10.validation.json');
const done = read('api/done-actions.json');
const open = read('api/actions.json');
const ids = [
  'act-2026-10-10-pr-review-4bb888',
  'act-2026-10-10-investigate-4f976a',
  'act-2026-10-10-file-bug-067a8d',
  'act-2026-10-10-triage-5957cd',
];

assert.equal(done.length, 120, 'Snapshot has advanced: this one-time check expects 116 prior dispositions plus four original instructions');
assert.equal(digest(done.slice(0, 116)), receipt.baseline.previousDispositionsSha256,
  'A prior disposition changed');
assert.equal(open.length, 78, 'Rebuild the queue: expected only the unrelated open actions');
assert.equal(digest(open), receipt.baseline.unrelatedActionsSha256,
  'An unrelated action changed or disappeared');
assert.deepEqual(receipt.baseline.originalInstructions.map((action) => action.id), ids);
assert.deepEqual(done.slice(116).map((action) => action.id), ids);
for (const original of receipt.baseline.originalInstructions) {
  const disposition = done.find((action) => action.id === original.id);
  for (const field of ['command', 'description', 'repo', 'sourceDate', 'id']) {
    assert.equal(disposition[field], original[field], `${original.id}: original ${field} changed`);
  }
  assert.equal(disposition.status, 'done');
  assert.equal(disposition.closedDate, '2026-10-10');
  assert.ok(disposition.resolution.length > 100, `${original.id}: missing rationale`);
}
assert.match(done.at(-1).resolution, /^Transferred/);
assert.match(done.at(-1).resolution, /ADRs?[- ]?0079|ADR-0079/);
assert.match(done.at(-1).resolution, /remain Proposed/);
assert.equal(receipt.followupBeads.length, 10);
assert.equal(new Set(receipt.followupBeads.map((bead) => bead.id)).size, 10);
for (const bead of receipt.followupBeads) {
  assert.equal(bead.actor, 'code-codex');
  assert.equal(bead.queue, 'available');
  assert.equal(bead.gate, 'gate-0');
  assert.ok(bead.refs.includes(bead.issue));
}
assert.equal(receipt.timeliness.checkpoint_is_request, true);
assert.equal(receipt.timeliness.automatic_reminder, false);
console.log('PASS: four exact instructions dispositioned; 116 prior dispositions and 78 unrelated actions preserved; ten gate-0 follow-ups retained.');
console.log('Local snapshot verification only: no claim of remote bead state, human approval or deployed delivery.');
