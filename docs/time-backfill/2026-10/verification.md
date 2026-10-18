# October backfill verification

The local candidate passes 513 native tests across 45 files, root and frontend type checks, frontend production build, and lint with zero errors and one pre-existing warning. The static API build preserves all 135 source article blobs and displayed bodies. Before/after action, tag, and repository outputs are byte-identical; the entry index is identical with time references removed. Pre-existing generated index drift is excluded from this change.

## Native controls

The committed `october-time-backfill.test.ts` runs the real offline script in a disposable frozen checkout. Two independent output directories and an identical-directory retry produce identical files. An output alias into the source checkout is rejected before writing. An unrelated edit in a later metadata target is rejected before any of the three targets changes. Two applies reproduce the output exactly and preserve every article byte.

Production metadata admission accepts only the three expected October 17 source/event/date bindings, preserves all 33 prior global references, and rejects missing authority or the same event with a different year. The original 134-article/33-reference deterministic shard regression remains pinned to its original immutable metadata and article inputs; it has an explicit 30-second subprocess budget. The replay uses one batched Git object read to avoid repeated process overhead.

Independent native review verified all five new commit groups against their immutable Git object timestamps, complete fresh lifecycle records, exact metadata replay, preserved bindings and source blobs. It reproduced the output-alias bypass and identified the partial-apply ordering issue by inspection, then executed both corrected refusal controls. These controls establish consistency of the saved observations, not external provider/account authentication or concurrent-writer/crash transaction safety.

## Browser controls

An independent local Chromium run serves actual before/after production API builds through controlled local responses, blocks external requests, and inventories every supported rendered token on all 16 existing October dates. Exact label, occurrence and datetime bindings match the production metadata: 22 before and 25 after, with 17 supported tokens remaining plain. Every prior binding is preserved; only the three October 17 exact merge events are added.

The three actual event popovers display Chicago dates/times correctly: October 17 06:22Z becomes October 17 01:22; October 16 21:05Z becomes October 16 16:05; October 16 13:34Z becomes October 16 08:34. The full source seconds remain in datetime attributes. Local time is first with a solid blue meridian, UTC uses dashed amber, and Escape dismisses the popover. Opening and closing the clocks makes no requests. Approximate range endpoints and the unsupported posted-handoff clock remain plain.

Clearly labelled synthetic controls exercise the November 1 repeated Chicago hour (06:30Z and 07:30Z both become 01:30, with distinct -05/-06 offsets) and separate coincident UTC meridians at 320×568. The map stays within that viewport. Scrolling the narrow popover to lower captions did not stay scrolled, so this run does **not** qualify mobile internal scrolling. It changes no UI code. This is recorded for the existing shared audit, alongside the separately documented approximate-range runtime gap.

These local browser fixtures do not establish deployment, production OAuth, authenticated editorial writes, article acceptance, or provider identity. Independent native/browser contributors ran separate review contexts; model identity is not independently authenticated. No generation model or automated review provider was called.

[Browser report and exact per-date inventory](browser/public-verification.md) include portable rerun instructions, original executed-script provenance, and screenshots of the three real event popovers.
