#!/usr/bin/env bash
# Sync static products from products/<name>/ to docs/<name>/ (served by GitHub Pages).
#
#   ./publish.sh            publish every product that has an index.html
#   ./publish.sh ai-vault   publish only the named product(s)
#
# Each product's JavaScript is syntax-checked with `node --check` first; nothing
# is copied if any check fails. Only docs/<name>/ is replaced — the rest of
# docs/ is never touched.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT/products"
DEST="$ROOT/docs"

if [[ $# -gt 0 ]]; then
  names=("$@")
else
  names=()
  for dir in "$SRC"/*/; do
    [[ -f "$dir/index.html" ]] && names+=("$(basename "$dir")")
  done
fi

if [[ ${#names[@]} -eq 0 ]]; then
  echo "publish: no products with an index.html under products/" >&2
  exit 1
fi

# Validate everything before copying anything.
for name in "${names[@]}"; do
  dir="$SRC/$name"
  if [[ ! "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    echo "publish: invalid product name '$name'" >&2; exit 1
  fi
  if [[ ! -f "$dir/index.html" ]]; then
    echo "publish: $dir/index.html not found" >&2; exit 1
  fi
  while IFS= read -r -d '' js; do
    node --check "$js" || { echo "publish: syntax error in ${js#"$ROOT"/}" >&2; exit 1; }
  done < <(find "$dir" -name '*.js' -not -path '*/node_modules/*' -print0)
  if grep -rqs 'REPLACE_ME' "$dir" --include='*.js' --include='*.html'; then
    echo "publish: warning: $name still contains a REPLACE_ME placeholder (checkout link?)" >&2
  fi
done

for name in "${names[@]}"; do
  out="$DEST/$name"
  rm -rf "$out"
  mkdir -p "$out"
  (cd "$SRC/$name" && find . -type f \
      -not -name '.*' -not -name '*.md' -not -path '*/node_modules/*' -print0 |
    while IFS= read -r -d '' f; do
      mkdir -p "$out/$(dirname "$f")"
      cp "$f" "$out/$f"
    done)
  count=$(find "$out" -type f | wc -l | tr -d ' ')
  echo "publish: products/$name -> docs/$name ($count files)"
done
