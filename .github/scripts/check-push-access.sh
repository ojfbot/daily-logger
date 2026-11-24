#!/usr/bin/env bash
# Proves the git credentials in use can PUSH to a remote, without changing it.
#
# `git ls-remote` only needs read access, so it passes for a token that cannot
# push. A dry-run push asks the server for the push service (receive-pack),
# which requires write access, then stops before sending anything.
#
# Runs from a fresh temporary repository so the workspace checkout's own
# credentials (actions/checkout's GITHUB_TOKEN header) are not what gets tested.
#
# Usage: check-push-access.sh <remote-url>
set -euo pipefail

remote="${1:?usage: check-push-access.sh <remote-url>}"
probe_ref="refs/heads/cleaner-push-access-probe"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

git -C "$work" init -q
git -C "$work" -c user.name=push-probe -c user.email=push-probe@invalid -c commit.gpgsign=false \
  commit -q --allow-empty -m "push access probe (never pushed)"

if ! git -C "$work" push --dry-run --quiet "$remote" "HEAD:${probe_ref}"; then
  echo "✗ Push access check failed for ${remote}: the token can read but not push, or cannot reach it (see git's error above)." >&2
  exit 1
fi

echo "✓ Push access confirmed for ${remote} (dry run; nothing was pushed)"
