#!/usr/bin/env bash
set -euo pipefail

git fetch -p origin >/dev/null

mapfile -t branches < <(git branch -r --format='%(refname:short)' \
  | sed 's#^origin/##' \
  | grep -Ev '^(main|HEAD)$' \
  | grep -Evi '^v2/' || true)

if [[ ${#branches[@]} -eq 0 ]]; then
  echo "No non-v2 remote branches to delete."
  exit 0
fi

for b in "${branches[@]}"; do
  if [[ "$b" == "origin" ]]; then
    continue
  fi
  git push origin --delete "$b"
done

git fetch -p origin >/dev/null

echo "Deleted non-v2 remote branches; kept main and v2/*"
