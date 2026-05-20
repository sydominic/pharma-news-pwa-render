#!/usr/bin/env bash
set -euo pipefail

echo "[render-build] node version"
node --version

echo "[render-build] enable corepack and pin pnpm"
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm --version

echo "[render-build] install server dependencies"
pnpm --dir server install --no-frozen-lockfile

echo "[render-build] install client dependencies"
pnpm --dir client install --no-frozen-lockfile

echo "[render-build] build React client"
pnpm --dir client run build
