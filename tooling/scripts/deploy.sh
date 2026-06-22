#!/usr/bin/env bash
# =============================================================================
# InventoryPro — Full deploy script ($0 cost)
# Stack: Next.js web → Cloudflare Pages | CF Workers API → Cloudflare
# Run script này SAU KHI đã setup accounts (Cloudflare, Supabase, GitHub)
# và fill values trong .env.local.
#
# Yêu cầu: đã cài pnpm, supabase, gh, wrangler CLI.
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "${GREEN}==>${NC} $1"; }
warn() { echo -e "${YELLOW}⚠️${NC}  $1"; }
fail() { echo -e "${RED}❌${NC}  $1"; exit 1; }

# =============================================================================
# Pre-flight checks
# =============================================================================
step "Pre-flight checks"

for cmd in pnpm supabase gh wrangler git; do
  command -v "$cmd" >/dev/null 2>&1 || fail "Missing CLI: $cmd. Cài đặt trước khi chạy script."
done

[ -f .env.local ] || fail "Missing .env.local. Copy từ .env.example và fill in values."
[ -d .git ] || fail "Not a git repo. Chạy 'git init' và push lên GitHub trước."

# =============================================================================
# Step 1: Git status
# =============================================================================
step "Check git status"
if [ -n "$(git status --porcelain)" ]; then
  warn "Có thay đổi chưa commit:"
  git status --short
  read -p "Commit & push? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    git add -A
    git commit -m "chore: deploy production"
    git push origin main
  fi
fi

# =============================================================================
# Step 2: Supabase migrations
# =============================================================================
step "Apply Supabase migrations"
SUPABASE_PROJECT_REF=$(grep "NEXT_PUBLIC_SUPABASE_URL" .env.local | sed -E 's|.*//([^.]+)\.supabase\.co.*|\1|')
[ -n "$SUPABASE_PROJECT_REF" ] || fail "Không tìm thấy SUPABASE_PROJECT_REF trong .env.local"

echo "Project ref: $SUPABASE_PROJECT_REF"

supabase link --project-ref "$SUPABASE_PROJECT_REF" || warn "Supabase link failed - có thể đã link rồi"
supabase db push || fail "Supabase migrations failed"

# =============================================================================
# Step 3: Deploy CF Workers (API backend)
# =============================================================================
step "Deploy API Worker (Cloudflare Workers)"
cd apps/api-worker

# Đọc secrets từ .env.local
SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL ../../.env.local | cut -d= -f2-)
SUPABASE_ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY ../../.env.local | cut -d= -f2-)
SUPABASE_SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY ../../.env.local | cut -d= -f2-)
SUPABASE_JWT_SECRET=$(grep SUPABASE_JWT_SECRET ../../.env.local | cut -d= -f2-)
DATABASE_URL=$(grep "^DATABASE_URL=" ../../.env.local | cut -d= -f2-)

[ -n "$SUPABASE_URL" ] || fail "Missing SUPABASE_URL"
[ -n "$SUPABASE_JWT_SECRET" ] || fail "Missing SUPABASE_JWT_SECRET"
[ -n "$DATABASE_URL" ] || fail "Missing DATABASE_URL"

# Set secrets (KHÔNG echo, KHÔNG commit)
echo "$SUPABASE_URL"           | wrangler secret put SUPABASE_URL
echo "$SUPABASE_ANON_KEY"      | wrangler secret put SUPABASE_ANON_KEY
echo "$SUPABASE_SERVICE_ROLE_KEY" | wrangler secret put SUPABASE_SERVICE_ROLE_KEY
echo "$SUPABASE_JWT_SECRET"    | wrangler secret put SUPABASE_JWT_SECRET
echo "$DATABASE_URL"           | wrangler secret put DATABASE_URL

npm run deploy

step "API Worker deployed: https://quankho-api.letanphatptt.workers.dev"
cd ../..

# =============================================================================
# Step 4: Cloudflare Pages (Web)
# =============================================================================
step "Deploy Web to Cloudflare Pages"
echo ""
echo "Cloudflare Pages deploy trigger qua git push — Pages tự build khi push main:"
echo "  git push origin main"
echo ""
echo "Đảm bảo CF Pages Project 'quankho-web' đã connect repo này (Settings → Builds):"
echo "  - Root directory: apps/web"
echo "  - Build command: pnpm install && pnpm --filter web build"
echo "  - Output directory: .next"
echo "  - Compatibility flags: nodejs_compat"
echo "  - Env vars (runtime, KHÔNG dùng cho build):"
echo "      NEXT_PUBLIC_SUPABASE_URL = $SUPABASE_URL"
echo ""

WEB_URL="https://quankho.pages.dev"

# =============================================================================
# Step 5: Smoke test
# =============================================================================
step "Smoke test"
sleep 10

echo "Testing API health..."
for i in 1 2 3 4 5; do
  if curl -fsSL "https://quankho-api.letanphatptt.workers.dev/health" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ API live${NC}"
    break
  fi
  echo "  Retry $i/5..."
  sleep 10
done

echo "Testing Web..."
curl -fsSL "$WEB_URL" >/dev/null && echo -e "${GREEN}✅ Web live${NC}" || warn "Web check failed"

# =============================================================================
# Step 6: Update Supabase Auth
# =============================================================================
step "Update Supabase Auth"
echo ""
echo "Manual steps cần làm trên Supabase Dashboard:"
echo "  Authentication → URL Configuration:"
echo "    - Site URL: $WEB_URL"
echo "    - Redirect URLs: $WEB_URL/auth/callback, $WEB_URL/login"
echo ""

step "🎉 Deploy hoàn tất! Cost = \$0"
echo ""
echo "URLs:"
echo "  Web: $WEB_URL"
echo "  API: https://quankho-api.letanphatptt.workers.dev"
echo "  DB: Supabase Dashboard"