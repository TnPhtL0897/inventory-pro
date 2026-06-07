#!/usr/bin/env bash
# =============================================================================
# InventoryPro — Full deploy script ($0 cost)
# Chạy script này SAU KHI đã setup accounts (Supabase, Vercel, Fly.io, GitHub).
# Yêu cầu: đã cài supabase, fly, vercel, gh, pnpm, dotnet CLI.
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

for cmd in pnpm dotnet supabase fly vercel git; do
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
# Step 3: Vercel deploy (Web)
# =============================================================================
step "Deploy Web to Vercel"
vercel --prod \
  --yes \
  --token "$VERCEL_TOKEN" \
  -b "NEXT_PUBLIC_SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2-)" \
  -b "NEXT_PUBLIC_SUPABASE_ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2-)" \
  -b "NEXT_PUBLIC_API_BASE_URL=https://inventory-prod.fly.dev" \
  -b "NEXT_PUBLIC_APP_NAME=Quản lý kho vật tư Pro" \
  -b "NEXT_PUBLIC_APP_VERSION=0.1.0"

WEB_URL=$(vercel ls --token "$VERCEL_TOKEN" 2>/dev/null | grep inventory-prod | awk '{print $2}' | head -1)
[ -z "$WEB_URL" ] && WEB_URL="https://inventory-prod.vercel.app"
step "Web deployed: $WEB_URL"

# =============================================================================
# Step 4: Fly.io deploy (API)
# =============================================================================
step "Deploy API to Fly.io"
fly apps create inventory-prod 2>/dev/null || warn "App đã tồn tại hoặc tạo thất bại"

# Set secrets
SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2-)
SUPABASE_JWT_SECRET=$(grep SUPABASE_JWT_SECRET .env.local | cut -d= -f2-)
SUPABASE_ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2-)
SUPABASE_SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2-)
DB_PASSWORD=$(grep DB_PASSWORD .env.local | cut -d= -f2-)

[ -n "$SUPABASE_URL" ] || fail "Missing SUPABASE_URL"
[ -n "$SUPABASE_JWT_SECRET" ] || fail "Missing SUPABASE_JWT_SECRET"
[ -n "$DB_PASSWORD" ] || fail "Missing DB_PASSWORD"

fly secrets set \
  Supabase__Url="$SUPABASE_URL" \
  Supabase__JwtSecret="$SUPABASE_JWT_SECRET" \
  Supabase__AnonKey="$SUPABASE_ANON_KEY" \
  Supabase__ServiceRoleKey="$SUPABASE_SERVICE_ROLE_KEY" \
  ConnectionStrings__Supabase="Host=db.${SUPABASE_PROJECT_REF}.supabase.co;Port=5432;Database=postgres;Username=postgres;Password=${DB_PASSWORD};SslMode=Require;TrustServerCertificate=true" \
  --app inventory-prod

fly deploy --remote-only --strategy bluegreen

step "API deployed: https://inventory-prod.fly.dev"

# =============================================================================
# Step 5: Smoke test
# =============================================================================
step "Smoke test"
sleep 10

# Health API
echo "Testing API health..."
for i in 1 2 3 4 5; do
  if curl -fsSL "https://inventory-prod.fly.dev/health/live" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ API live${NC}"
    break
  fi
  echo "  Retry $i/5..."
  sleep 10
done

curl -fsSL "https://inventory-prod.fly.dev/health/ready" || warn "API ready check failed (DB?)"

# Health Web
echo "Testing Web..."
curl -fsSL "$WEB_URL/login" | grep -q "Đăng nhập" && echo -e "${GREEN}✅ Web live${NC}" || warn "Web check failed"

# =============================================================================
# Step 6: Update Auth + CORS
# =============================================================================
step "Update Supabase Auth + CORS"
echo ""
echo "Manual steps cần làm:"
echo "1. Supabase Dashboard > Authentication > URL Configuration"
echo "   - Site URL: $WEB_URL"
echo "   - Redirect URLs: $WEB_URL/auth/callback, $WEB_URL/login"
echo ""
echo "2. Update CORS trong apps/api/appsettings.Production.json"
echo "   - Thêm $WEB_URL vào Cors.AllowedOrigins"
echo "   - Commit + fly deploy lại"
echo ""
echo "3. (Optional) Add custom domain trong Vercel + Fly"

step "🎉 Deploy hoàn tất! Cost = \$0"
echo ""
echo "URLs:"
echo "  Web: $WEB_URL"
echo "  API: https://inventory-prod.fly.dev"
echo "  API docs (Swagger): https://inventory-prod.fly.dev/swagger (chỉ trên dev environment)"
echo "  DB: Supabase Dashboard"
