# Deploy Info — Thông tin triển khai

> File lưu trữ thông tin accounts, project refs, secrets, deployment URLs.
> **TUYỆT MẬT** — KHÔNG commit file này nếu có values thật.
> Khuyến nghị: dùng Bitwarden / 1Password / GitHub Secrets để lưu values thật.

---

## 1. Supabase (Database + Auth + Storage)

### Project
- **Tên project**: `inventory-prod`
- **Project ref** (slug): `<SUPABASE_PROJECT_REF>` ← fill in
- **Region**: Singapore (ap-southeast-1)
- **Plan**: Free
- **Dashboard**: https://app.supabase.com/project/<SUPABASE_PROJECT_REF>
- **Database URL** (direct connection):
  ```
  postgresql://postgres:<DB_PASSWORD>@db.<SUPABASE_PROJECT_REF>.supabase.co:5432/postgres
  ```
- **Connection pooling** (transaction mode, port 6543):
  ```
  postgresql://postgres.<SUPABASE_PROJECT_REF>:<DB_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
  ```

### API keys
| Key | Env var | Lưu ở đâu |
|-----|---------|-----------|
| `Project URL` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` | Vercel + Fly secrets |
| `anon public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + Fly secrets |
| `service_role` | `SUPABASE_SERVICE_ROLE_KEY` | Fly secrets ONLY |
| `JWT Secret` | `SUPABASE_JWT_SECRET` | Fly secrets + Vercel |

### Auth config
- Site URL: `https://inventory-prod.vercel.app`
- Additional redirect URLs:
  - `https://inventory-prod.vercel.app/auth/callback`
  - `https://inventory-prod.vercel.app/login`
- Enable sign up: **TẮT** (chỉ admin tạo user)

### Account email
- Email: `<YOUR_EMAIL>` ← fill in
- 2FA: enabled

### CLI setup
```bash
supabase login  # sẽ mở browser
supabase link --project-ref <SUPABASE_PROJECT_REF>
supabase db push  # apply tất cả 9 migrations
```

---

## 2. Vercel (Web - Next.js 15)

### Project
- **Tên project**: `inventory-prod`
- **Tên app** (URL): `inventory-prod` → https://inventory-prod.vercel.app
- **Plan**: Hobby (Free)
- **Region**: sin1 (Singapore) — đã set trong `vercel.json`
- **Framework**: Next.js (auto-detect)
- **Repo**: GitHub `<YOUR_GITHUB_USERNAME>/inventory-prod` (private OK)
- **Dashboard**: https://vercel.com/dashboard

### Environment variables (Project Settings → Environment Variables)

| Name | Value | Env |
|------|-------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<SUPABASE_PROJECT_REF>.supabase.co` | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<anon public>` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `<service_role>` | All (nhưng thực tế web không cần) |
| `SUPABASE_JWT_SECRET` | `<JWT Secret>` | All |
| `NEXT_PUBLIC_API_BASE_URL` | `https://inventory-prod.fly.dev` | Production |
| `NEXT_PUBLIC_APP_NAME` | `Quản kho` | All |
| `NEXT_PUBLIC_APP_VERSION` | `0.1.0` | All |

### Account email
- Email: `<YOUR_EMAIL>` ← fill in (GitHub SSO)

### CLI setup
```bash
npm i -g vercel
vercel login  # GitHub
vercel link   # link tới project
vercel --prod # deploy
```

### Custom domain (optional)
- Vercel → Project → Settings → Domains
- Add: `inventory.vn` (hoặc domain khách hàng)
- DNS: CNAME → `cname.vercel-dns.com`

---

## 3. Fly.io (API - ASP.NET Core 8)

### App
- **Tên app**: `inventory-prod`
- **Region**: sin (Singapore) — đã set trong `fly.toml`
- **Plan**: Free (3 shared VMs 256MB, scale-to-zero)
- **URL**: https://inventory-prod.fly.dev
- **Dashboard**: https://fly.io/apps/inventory-prod

### VM config
- size: `shared-cpu-1x`
- memory: `256mb`
- cpus: 1
- internal port: 8080
- external: 80, 443 (HTTPS auto)

### Secrets (set via `fly secrets set`)

```bash
fly secrets set \
  Supabase__Url="https://<SUPABASE_PROJECT_REF>.supabase.co" \
  Supabase__JwtSecret="<JWT_SECRET>" \
  Supabase__AnonKey="<anon public>" \
  Supabase__ServiceRoleKey="<service_role>" \
  ConnectionStrings__Supabase="Host=db.<SUPABASE_PROJECT_REF>.supabase.co;Port=5432;Database=postgres;Username=postgres;Password=<DB_PASSWORD>;SslMode=Require;TrustServerCertificate=true"
```

⚠️ Lưu trong password manager. KHÔNG echo, KHÔNG commit.

### Account email
- Email: `<YOUR_EMAIL>` ← fill in
- 2FA: enabled

### CLI setup
```bash
curl -L https://fly.io/install.sh | sh
fly auth signup  # hoặc fly auth login
```

### Deploy
```bash
fly deploy  # build từ apps/api/Dockerfile, bluegreen
fly status  # xem machines
fly logs    # xem real-time logs
fly ssh console  # SSH vào container
```

---

## 4. GitHub (Source + CI/CD)

### Repo
- **URL**: `https://github.com/<YOUR_GITHUB_USERNAME>/<REPO_NAME>`
- **Visibility**: Private
- **Default branch**: `main`

### Secrets (Settings → Secrets and variables → Actions)

Cần set cho workflow `.github/workflows/deploy-prod.yml`:

| Secret | Mô tả | Lấy từ đâu |
|--------|-------|-----------|
| `SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase Dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | anon public | Supabase Dashboard |
| `SUPABASE_JWT_SECRET` | JWT Secret | Supabase Dashboard |
| `API_BASE_URL` | `https://inventory-prod.fly.dev` | Fly.io |
| `VERCEL_TOKEN` | Vercel auth token | Vercel → Settings → Tokens |
| `VERCEL_ORG_ID` | Vercel team/org ID | Vercel → Settings → General |
| `VERCEL_PROJECT_ID` | Vercel project ID | Vercel → Project → Settings → General |
| `FLY_API_TOKEN` | Fly API token | `fly auth token` |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI token | `supabase login` → tạo token |
| `SUPABASE_PROJECT_REF` | Project ref slug | Supabase Dashboard URL |
| `SUPABASE_DB_PASSWORD` | Database password | Khi tạo project |
| `WEB_URL` | `https://inventory-prod.vercel.app` | Sau khi deploy Vercel |

### Workflows đã setup

| File | Trigger | Mục đích |
|------|---------|----------|
| `.github/workflows/ci-api.yml` | push/PR `apps/api/**` | Build + test .NET |
| `.github/workflows/ci-web.yml` | push/PR `apps/web/**` | Lint + type-check + test + build Next.js |
| `.github/workflows/ci-db.yml` | PR `infrastructure/supabase/**` | Lint SQL migrations |
| `.github/workflows/deploy-prod.yml` | push `main` | Full deploy pipeline |
| `.github/workflows/keep-supabase-alive.yml` | cron `0 3 */5 * *` | Ping Supabase chống pause |

---

## 5. Domains & DNS (optional)

Nếu dùng custom domain `inventory.vn`:

| Subdomain | Type | Value |
|-----------|------|-------|
| `inventory.vn` | CNAME | `cname.vercel-dns.com` (Web Vercel) |
| `api.inventory.vn` | CNAME | `inventory-prod.fly.dev` (API Fly) |
| `db.inventory.vn` | — | Dùng Supabase subdomain (không cần) |

Trong Supabase Auth: thêm `https://inventory.vn` vào Site URL.

---

## 6. Email Transactional (optional, free)

Dùng **Resend** (free 3000 emails/tháng) cho:
- Welcome email
- Password reset
- Stock alerts

- Website: https://resend.com
- API key: lưu trong Vercel + Fly secrets

---

## 7. Monitoring (free)

| Service | URL | Dùng cho |
|---------|-----|----------|
| Vercel Analytics | https://vercel.com/dashboard | Web vitals, errors |
| Fly Metrics | https://fly.io/apps/inventory-prod/metrics | API latency, CPU, RAM |
| Supabase Logs | https://app.supabase.com/project/_/logs | DB queries, auth events |
| UptimeRobot | https://uptimerobot.com (free 50 monitors) | Uptime alerts email/Telegram |

Setup UptimeRobot (recommended):
- Monitor 1: `https://inventory-prod.fly.dev/health/ready` (HTTP, every 5 min)
- Monitor 2: `https://inventory-prod.vercel.app/login` (HTTP, every 5 min)
- Alert contacts: email + Telegram (free)

---

## 8. Backup & Recovery (free)

### Database backup

Supabase free **KHÔNG có** auto backup. Setup manual:

```bash
# Trên máy local (cron hàng ngày)
pg_dump "$DATABASE_URL" | gzip > ~/backups/inventory-$(date +%F).sql.gz

# Restore
gunzip -c backup-2026-06-06.sql.gz | psql "$DATABASE_URL"
```

Khuyến nghị: GitHub Action cron backup hàng ngày lên Cloudflare R2 (free 10GB storage).

### Disaster recovery

| Scenario | RPO | RTO | Action |
|----------|-----|-----|--------|
| Supabase pause | 0 | 5 min | Click "Restore" in dashboard |
| Fly.io VM down | 0 | 1 min | Auto-restart (machine_checks) |
| Code bug | 0 | 5 min | `fly rollback` hoặc redeploy |
| DB corruption | 24h | 30 min | Restore from manual backup |

---

## 9. Quick reference: commands

```bash
# === LOCAL DEV ===
pnpm install
supabase start
supabase db reset       # reset + apply migrations + seed
pnpm dev                # web (3000) + API (5000)
pnpm test               # web vitest
cd apps/api && dotnet test

# === DEPLOY ===
# Supabase
supabase link --project-ref <ref>
supabase db push

# Vercel
vercel --prod

# Fly.io
fly deploy
fly logs
fly status
fly secrets list

# === TROUBLESHOOTING ===
# Supabase paused
# → Dashboard → click "Restore"

# API down
fly logs -a inventory-prod
fly restart -a inventory-prod

# Rollback deploy
fly releases -a inventory-prod
fly releases rollback <version>
```

---

## 10. Cost = $0 tuyệt đối

Đã verify với mọi provider free tier:

- ✅ Vercel: 100GB BW, 6000 build-min, free SSL, free CDN global
- ✅ Fly.io: 3 shared VMs 256MB, 3GB storage, 160GB egress/tháng
- ✅ Supabase: 500MB Postgres, 1GB storage, 50k MAU, 2GB egress
- ✅ GitHub Actions: 2000 min/tháng (private) hoặc unlimited (public)
- ✅ Resend: 3000 emails/tháng
- ✅ UptimeRobot: 50 monitors
- ✅ Cloudflare R2: 10GB storage (cho backup)

**Tổng: $0/tháng** cho đến khi vượt limits.

Limits:
- DB ≤ 500MB (~50k records)
- BW ≤ 100GB/tháng (~10k users)
- 3 Fly VMs 256MB (đủ cho 1-2k concurrent users)
- Accept cold start 5-15s + Supabase pause sau 7 ngày (mitigated bằng cron ping)

---

## 11. Khi cần support / scale

| Trigger | Action | New cost |
|---------|--------|----------|
| DB > 500MB | Supabase Pro | $25/mo (8GB) |
| BW > 100GB | Vercel Pro | $20/mo (1TB) |
| Cold start issues | Fly dedicated CPU | $12/mo/VM |
| Multi-region | Vercel Enterprise | $200+/mo |
| SLA + support | Upgrade cả 3 | $80+/mo |

Luôn upgrade **từng service** độc lập, vendor lock-in thấp.

---

## Checklist khi onboard người mới vào deploy

- [ ] Supabase: tạo account, vào project
- [ ] Vercel: login bằng GitHub, accept invite vào project
- [ ] Fly.io: `fly auth signup`, accept invite vào org
- [ ] GitHub: thêm vào repo với role `Maintainer` hoặc `Admin`
- [ ] 1Password: thêm folder "InventoryPro Deploy" với tất cả secrets
- [ ] Đọc docs/DEPLOY.md để hiểu flow
- [ ] Chạy smoke test sau khi setup: `curl https://inventory-prod.fly.dev/health/ready`
