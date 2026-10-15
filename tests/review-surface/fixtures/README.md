# Frozen article inputs for review tests

These four files contain the exact `_articles/<date>.md` bytes at the revisions
listed in `manifest.json`. The manifest records both the Git blob SHA and SHA-256.
They are test inputs, not current articles or newly published reviews.

The original October 14 review covers `ce04d676` and the original October 13 review
covers `457809f`. The October 13 correction is captured at `ce04d676`; the October
14 correction is captured at `59d39b5`. Both October 14 versions remain drafts.
These known revisions preserve the actual before/after relationships used by the
stale-review and request-refusal controls.

Each input was extracted with `git show <source-commit>:_articles/<date>.md` from a
checkout containing that exact source. Its bytes were independently compared to
`git rev-parse <source-commit>:_articles/<date>.md` and their SHA-256 recorded. Tests
recompute both hashes before using the fixture. They reject a changed byte or
unknown source revision rather than relabeling arbitrary content with a known SHA.
No Git history, network call, or current generated API file is needed at test time.

`article-snapshots.ts` renders the matching bytes for browser fixtures and derives
the displayed title, summary, status and fingerprint from those bytes. Ancillary
metrics are deliberately empty fixture values. Browser tests cannot replace the
fingerprint while retaining prose from another source revision.
