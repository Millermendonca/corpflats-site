#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Push Drizzle schema migrations
pnpm --filter db push
# Bootstrap infrastructure (session table, flats) — never touches user credentials
pnpm --filter db run bootstrap
