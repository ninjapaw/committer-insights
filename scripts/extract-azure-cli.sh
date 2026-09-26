#!/bin/sh
# Extracts the pinned Azure CLI Python runtime archive (a plain, sorted,
# deterministic zip produced by packReducedAzureCli) into a build directory.
# Mirrors the safety checks in extract-azure-cli.ps1: entry-count limit,
# per-entry and total size limits, and path traversal / absolute-path
# rejection. Requires the standard macOS "zip"/"unzip" tools.
set -eu

archive="$COMMITTER_AZ_ARCHIVE"
output="$COMMITTER_AZ_OUTPUT"

entry_count=$(unzip -Z1 "$archive" | wc -l | tr -d ' ')
if [ "$entry_count" -gt 25000 ]; then
  echo 'Azure CLI archive has too many entries' >&2
  exit 1
fi

unzip -Z1 "$archive" | while IFS= read -r name; do
  case "$name" in
    /* | *..*)
      echo "Unsafe Azure CLI archive path: $name" >&2
      exit 1
      ;;
  esac
done

total=0
while IFS= read -r size; do
  if [ "$size" -gt 134217728 ]; then
    echo 'Azure CLI archive entry exceeds size limit' >&2
    exit 1
  fi
  total=$((total + size))
done <<EOF
$(unzip -lqq "$archive" | awk '{ print $1 }')
EOF
if [ "$total" -gt 629145600 ]; then
  echo 'Azure CLI archive exceeds extraction limits' >&2
  exit 1
fi

mkdir -p "$output"
unzip -q -o "$archive" -d "$output"
