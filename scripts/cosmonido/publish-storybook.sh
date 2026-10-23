#!/usr/bin/env bash
# Builds Storybook and publishes it to https://paperclip-storybook.vercel.app
# (mock data only; no server, no production data).
#
# Usage (from the repo root, Git Bash, logged in with `vercel login`):
#   scripts/cosmonido/publish-storybook.sh
# For instant feedback while editing, run Storybook locally instead:
#   pnpm --filter @paperclipai/ui storybook -- --host 0.0.0.0
set -euo pipefail

cd "$(git rev-parse --show-toplevel)/ui"
# Two publishes share storybook-static; a second one waits instead of deleting it mid-build.
lock="storybook-static.lock"
if ! mkdir "$lock" 2>/dev/null; then echo "Another Storybook publish is running ($lock)"; exit 1; fi
trap 'rmdir "$lock"' EXIT
rm -rf storybook-static
npx storybook build -c storybook/.storybook -o storybook-static --quiet

# The Vercel project is named after the folder, so always deploy from one
# called paperclip-storybook.
out="$(mktemp -d)/paperclip-storybook"
cp -r storybook-static "$out"
cd "$out"
# One archive instead of thousands of files: the free plan caps file uploads at 5,000 a day.
vercel deploy --prod --yes --archive=tgz
