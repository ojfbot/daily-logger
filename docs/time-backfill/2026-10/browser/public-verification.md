# October timestamp browser verification

The local browser proof passed for all 16 existing October article dates. Actual production API build files supplied each page. The rendered label, occurrence, and full `datetime` matched the corresponding API metadata and backfill manifest.

The 22 existing October bindings remain unchanged. The three additions appear only in the October 17 article, for 25 final bindings. The remaining 17 supported occurrences stay plain. Every one of the 135 article blobs matches the source bytes, and every displayed article body remains unchanged. References outside October also remain unchanged in the API files.

| Article date | Before bindings | After bindings | Plain after |
|---|---:|---:|---:|
| 2026-10-01 | 2 | 2 | 0 |
| 2026-10-02 | 9 | 9 | 0 |
| 2026-10-03 | 0 | 0 | 2 |
| 2026-10-04 | 0 | 0 | 1 |
| 2026-10-06 | 0 | 0 | 0 |
| 2026-10-07 | 1 | 1 | 0 |
| 2026-10-08 | 1 | 1 | 0 |
| 2026-10-09 | 0 | 0 | 0 |
| 2026-10-10 | 0 | 0 | 0 |
| 2026-10-11 | 0 | 0 | 0 |
| 2026-10-12 | 0 | 0 | 0 |
| 2026-10-13 | 0 | 0 | 0 |
| 2026-10-14 | 3 | 3 | 5 |
| 2026-10-15 | 6 | 6 | 2 |
| 2026-10-16 | 0 | 0 | 2 |
| 2026-10-17 | 0 | 3 | 5 |

## Real October 17 popovers

Chrome 155.0.8059.80 used `America/Chicago`. Each trigger retained the source seconds in its `<time datetime>` attribute while displaying the article's minute precision.

| Article text | Source instant | Local date and time |
|---|---|---|
| `06:22Z` | `2026-10-17T06:22:23.000Z` | October 17, 01:22, UTC−05:00 |
| `21:05Z` | `2026-10-16T21:05:02.000Z` | October 16, 16:05, UTC−05:00 |
| `13:34Z` | `2026-10-16T13:34:59.000Z` | October 16, 08:34, UTC−05:00 |

The popovers show the device clock first, with a solid blue offset meridian and a dashed amber Greenwich meridian. Each map has a finite night path. Escape closes each popover and clears its trigger's accessibility state. Opening and closing each popover makes no requests.

The approximate range endpoints `19:42Z` and `18:21Z`, the posting time `06:30Z`, and the reporting bounds stay plain. This result covers the historical metadata whitelist. It does not repair the unchanged generator or parser's approximate-range behavior.

## Synthetic display controls

The separate synthetic November 1 fixtures render both `06:30Z` and `07:30Z` as 01:30 in Chicago, with UTC−05:00 and UTC−06:00 respectively. The offset meridian changes with the historical offset. These fixtures are labelled synthetic and add no article authority.

A synthetic UTC control at 320 × 568 pixels shows separated coincident meridians and stays within the viewport without horizontal document overflow. Internal scrolling to lower captions was not established by this proof.

All 35 attempted nonlocal HTTP requests were Google Fonts stylesheet requests. Browser routing blocked them. Authentication, reviews, and other unavailable API requests received local 503 fixtures. The browser recorded zero page runtime errors.

## Evidence and limits

[Rendered per-date inventory](rendered-per-date.json) contains the exact before and after bindings and every supported rendered occurrence. [Script versions](script-versions.json) distinguishes the executed script from its portable command-line wrapper. [Rerun instructions](README.md) describe the required local inputs.

The executed script SHA-256 is `cd2eafd4966df6529855d9829830dc4a5657c80a8a789c72961d1aa7c68bcbfd`. Its assertions passed. The portable script SHA-256 is `555e6f2d542c93598bd2f71e4743220febfbb38e76441d73fb2eaffb54c25634`. Only its input and output path arguments changed after the run.

The proof uses a local development app with actual built API files. It does not establish deployed behavior, authenticated editing, source-provider identity, publication readiness, merge approval, or deployment approval.

[Separate mobile-scroll observation](supplemental-mobile-scroll/receipt.json) preserves the exact fixture/source pins, attempted inputs, immediate and settled scroll positions, screenshot hashes, observing context and untraced mechanism hypothesis. It supplements the original passing metadata/display inventory.
