#!/usr/bin/env bash
# Applies the migration and seed to a fresh local database and runs the behaviour checks.
# Needs a local Postgres; pass connection flags in PSQL_ARGS, e.g. PSQL_ARGS="-h /tmp -p 5432 -U postgres".
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql ${PSQL_ARGS:-} -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists tbkhn_test" -c "create database tbkhn_test"
$P -d tbkhn_test -f tests/supabase_stubs.sql
$P -d tbkhn_test -f migrations/0001_initial_schema.sql
$P -d tbkhn_test -f seed.sql
$P -d tbkhn_test -c "truncate public.communities cascade" 2>/dev/null
$P -d tbkhn_test -f tests/schema_test.sql | tail -1
