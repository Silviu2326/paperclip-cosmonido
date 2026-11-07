#!/usr/bin/env bash
# Deploys go through .github/workflows/cosmonido-deploy.yml: it backs up the
# data, verifies API + UI and rolls back on failure. A push to `integracion`
# deploys automatically; this script forces a "full" deploy of that branch.
#
# Usage (from the repo root, Git Bash): scripts/cosmonido/deploy-full.sh
set -euo pipefail
gh workflow run cosmonido-deploy.yml -R Silviu2326/paperclip-cosmonido --ref integracion -f mode=full
sleep 5
gh run watch -R Silviu2326/paperclip-cosmonido "$(gh run list -R Silviu2326/paperclip-cosmonido -w cosmonido-deploy.yml -L 1 --json databaseId --jq '.[0].databaseId')" --exit-status
