#!/usr/bin/env bash
# Chạy cả web + API song song
# Yêu cầu: pnpm >= 9, .NET 8 SDK, supabase CLI

set -e

# Start Supabase local nếu chưa chạy
if ! supabase status > /dev/null 2>&1; then
  echo "Starting Supabase..."
  supabase start
fi

# Apply migrations
echo "Applying migrations..."
supabase db reset

# Chạy song song
trap "kill 0" EXIT
pnpm dev:api &
pnpm dev:web &
wait
