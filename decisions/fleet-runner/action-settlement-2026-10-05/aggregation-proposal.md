# Aggregate future suggestions under retained action IDs

Status: proposal for operator review. No generator, projection, UI or closure behavior is changed in this settlement PR.

Scope similarity alone is insufficient. A request to merge a PR and a request to verify its deployed behavior can share a repository and target while remaining independently incomplete. Aggregation must preserve those obligations and the original source identities.

## Proposed representation

Use an existing open action ID as `retainedActionId`. Do not create a new group identity or another queue. Retain each original source action, including command, description, repository and date. New source IDs continue to use the existing `actionId` function.

```json
{
  "retainedActionId": "act-2026-07-27-fix-and-pr-c6630d",
  "sourceActions": [
    {
      "id": "act-2026-07-26-fix-defects-651aaa",
      "relation": "same-outcome",
      "requestedOutcome": "Correct the two named corpus bindings and open the correction PR",
      "completionCriteria": ["Both characterized entries corrected", "Correction PR published with binding evidence"]
    },
    {
      "id": "act-2026-07-25-investigate-afa72f",
      "relation": "related-work",
      "requestedOutcome": "Confirm field-level characterization, then correct and publish or record diagnosis scope",
      "completionCriteria": ["Characterization decision recorded", "Conditional correction or diagnosis outcome evidenced"]
    }
  ]
}
```

The example abbreviates original records for readability. An implementation must persist the original ID and identity fields at creation, with the originating article path and commit as provenance. The current ID hashes exact description text: a reference to a mutable article alone is insufficient. Later prose edits must not recompute the original ID. This freezes the existing identity rather than introducing another identity scheme. `related-work` is a navigational relationship; it does not authorize hiding an independent actionable outcome beneath another item. Source status and resolution continue to come from the existing done ledger.

## Future filing flow

1. Load current open items through the existing context-loading path. Give the drafter their original IDs, requested outcomes, targets and completion criteria.
2. A future article suggestion may include a proposed `retainedActionId`. The normal source record keeps its own ID and source date; the pointer files its provenance against the retained active item.
3. Validate the pointer against the current open feed and its frozen provenance. Re-resolve aliases only for comparison; never change historical source repositories or recompute original IDs. Reject a dangling legacy pointer or changed acceptance scope; preserve a separate open source pending explicit qualification.
4. Attach as `same-outcome` only when completing the retained item would satisfy every target and validation obligation of the new suggestion. Similar wording, shared PR numbers and old age are insufficient. A broader acceptance condition or additional target is `related-work` and remains separately actionable pending an explicit scope decision.
5. Derive aggregation in the existing static API projection. Display one retained active item for proven same-outcome sources, with all source IDs, dates, descriptions and remaining criteria accessible. Keep related independent outcomes visible. Do not use this report as an intake source.
6. If the retained item has closed, disappeared, changed scope or become ambiguous before filing, preserve the new source as a separate open item. Do not silently reopen or attach to closed work.
7. Close each source through `done-actions.json` only when its own full criteria are satisfied or explicitly superseded. Never cascade closure from the retained ID without per-source evidence. Partial completion stays open.

New provenance would live in future source articles, so rebuilds can reproduce relationships without modifying historical articles. A future implementation needs an explicit source-schema extension plus a derived projection, rather than edits to generated JSON that vanish on rebuild. Selection should be deterministic once qualified: retain the most complete still-valid existing outcome, recording which additional acceptance condition justifies a later source; where equivalent, use the oldest source and ID as a tie-breaker. Changing the retained display pointer is not changing any source identity.

That future slice should share identity and matching utilities between the builder, context loader and closure persistence so aggregation does not add another implementation of the ID-or-legacy rule. This PR changes none of those functions.

## Examples from this settlement

- The July 18 and July 23 cockpit #34 sources have the same shipped outcome and both close with their own preserved IDs. There is no reason to retain a now-complete open group.
- The July 26/27 f1-pit-wall correction sources can use July 27 as the retained item because it explicitly requires both opening and merging the correction PR; July 26 only requires opening it. The July 25 characterization/diagnosis branch is additional related work and remains independently actionable.
- The August 2/3 denylist suggestions share both failure/pass verification obligations. Retain the older August 2 source, `act-2026-08-02-validate-7e79b9`, under the equivalent-outcome tie-breaker. Neither is closed by grouping.
- The April 11/12 shell fallback requests can aggregate only if the retained criterion includes the two-sub-app response and location-convention documentation required by the more detailed source.
- The port reassignment and live federation validation sources are related. A port-config merge does not close the runtime verification source.
- Historical suggestion-log audits name different session windows. They are related telemetry work, not interchangeable duplicates.

## Qualification before implementation

The next independently reviewable slice should demonstrate one future source suggestion filed against a current retained item, reproducible projection and visible source lineage. It should include negative examples for merge-versus-verification, different targets, broader acceptance criteria, ambiguous aliases and a retained item that closes during generation. Legacy items without a pointer must keep today's behavior. Settlement must still prove exact intended filtering, independent source closure and idempotent rebuilds.

Operator review is needed before selecting matching authority and whether ambiguous proposals require confirmation. The present PR preserves all unresolved items and does not choose a runtime authority, dispatcher or publication workflow.
