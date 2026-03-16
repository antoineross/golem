#!/usr/bin/env bash
set -euo pipefail

# Validates that reusable workflows don't request permissions
# exceeding what the caller grants. GitHub Actions rejects these
# at startup with no useful error in the UI.

WORKFLOWS_DIR=".github/workflows"

extract_caller_perms() {
  awk '
    /^permissions:/ { in_perms=1; next }
    in_perms && /^[^ ]/ { in_perms=0 }
    in_perms && /^  [a-z]/ {
      gsub(/^ +/, "")
      gsub(/: +/, ":")
      print
    }
  ' "$1"
}

extract_called_perms() {
  awk '
    /^jobs:/ { in_jobs=1 }
    in_jobs && /^    permissions:/ { in_perms=1; next }
    in_jobs && in_perms && /^    [^ ]/ { in_perms=0 }
    in_jobs && in_perms && /^      [a-z]/ {
      gsub(/^ +/, "")
      gsub(/: +/, ":")
      print
    }
  ' "$1"
}

for caller in "$WORKFLOWS_DIR"/*.yml; do
  [ -f "$caller" ] || continue

  called_files=$(grep -E 'uses:\s*\./\.github/workflows/' "$caller" 2>/dev/null \
    | sed 's|.*uses: *\./\.github/workflows/||; s| .*||' \
    | sort -u) || true

  [ -z "$called_files" ] && continue

  caller_perms=$(extract_caller_perms "$caller")

  echo "$called_files" | while IFS= read -r called_file; do
    [ -z "$called_file" ] && continue
    called_path="$WORKFLOWS_DIR/$called_file"
    [ -f "$called_path" ] || continue

    called_perms=$(extract_called_perms "$called_path")
    [ -z "$called_perms" ] && continue

    echo "$called_perms" | while IFS=: read -r perm level; do
      [ -z "$perm" ] && continue
      [ "$level" = "read" ] || [ "$level" = "none" ] && continue

      caller_level=$(echo "$caller_perms" | grep "^${perm}:" | cut -d: -f2 || true)

      if [ -z "$caller_level" ]; then
        echo "ERROR: $called_path requests '$perm: $level' but $caller does not grant it"
        echo "  -> add '$perm: $level' to permissions in $caller"
        echo "1" > /tmp/wf_perm_err
      elif [ "$caller_level" = "read" ] && [ "$level" = "write" ]; then
        echo "ERROR: $called_path requests '$perm: $level' but $caller only grants '$perm: read'"
        echo "  -> update to '$perm: $level' in $caller"
        echo "1" > /tmp/wf_perm_err
      fi
    done
  done
done

if [ -f /tmp/wf_perm_err ]; then
  rm -f /tmp/wf_perm_err
  exit 1
fi

echo "Workflow permissions check passed"
