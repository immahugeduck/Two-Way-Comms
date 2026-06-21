#!/usr/bin/env bash
set -euo pipefail

name="${1:-v2/codex}"

if [[ "$name" != v2/* ]]; then
  echo "Branch name must start with v2/"
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$name"; then
  git switch "$name"
else
  git switch -c "$name"
fi

git push -u origin "$name"

echo "Ready on branch: $name"
