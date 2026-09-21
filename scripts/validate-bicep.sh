#!/usr/bin/env bash
set -euo pipefail

# Validates Bicep templates using the Azure CLI Bicep tooling, mirroring the
# pattern used by sibling repositories (pawprint, site, m365profiles).
if ! command -v az >/dev/null 2>&1; then
  echo "SKIPPED: Azure CLI (az) is not installed; cannot run 'az bicep build'." >&2
  echo "Install: https://learn.microsoft.com/cli/azure/install-azure-cli" >&2
  exit 0
fi

cd "$(dirname "$0")/.."

az bicep build --file infra/main.bicep --stdout > /dev/null
echo "infra/main.bicep: OK"

for module in infra/modules/*/main.bicep; do
  az bicep build --file "$module" --stdout > /dev/null
  echo "$module: OK"
done
