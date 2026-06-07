#!/usr/bin/env bash
# Setup dự án lần đầu

set -e

echo "==> Cài dependencies..."
pnpm install

echo "==> Copy env files..."
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "  ✓ Tạo .env.local (nhớ fill in Supabase credentials)"
fi

if [ ! -f apps/api/src/InventoryPro.API/appsettings.Development.json ]; then
  cp apps/api/src/InventoryPro.API/appsettings.Development.json.example \
     apps/api/src/InventoryPro.API/appsettings.Development.json 2>/dev/null || true
fi

echo "==> Khởi tạo Supabase local..."
if command -v supabase > /dev/null; then
  supabase start
  supabase db reset
  echo "  ✓ Supabase local đã chạy"
else
  echo "  ⚠ supabase CLI chưa cài. Cài: https://supabase.com/docs/guides/cli"
fi

echo "==> Done!"
echo ""
echo "Tiếp theo:"
echo "  1. Sửa .env.local với Supabase credentials"
echo "  2. pnpm dev        # chạy web + API"
echo "  3. Truy cập http://localhost:3000"
