# ADR-0005: Deployment Architecture (Vercel + Fly.io + Supabase) — $0

## Status
Accepted — 2026-06-06

## Context

Cần deploy InventoryPro (Web + API + DB) cho khách hàng VN với:
- Latency thấp từ VN (< 100ms)
- **Cost = $0 tuyệt đối** cho MVP/pilot
- HTTPS bắt buộc
- Auto-scaling khi user tăng
- Có exit ramp lên paid tier nếu scale

## Decision

| Layer | Provider | Tier | Region | Cost |
|-------|----------|------|--------|------|
| Web (Next.js 15) | **Vercel** | Free | sin1 (Singapore) | **$0** |
| API (ASP.NET Core 8) | **Fly.io** | Free (3 shared VMs 256MB) | sin (Singapore) | **$0** |
| Database (Postgres) | **Supabase** | Free (500MB, 50k MAU) | ap-southeast-1 | **$0** |
| CI/CD | **GitHub Actions** | Free (public repos) | — | **$0** |
| Monitoring | **Supabase logs + Fly logs + Vercel logs** | Free | — | **$0** |
| Email transactional | **Resend** | Free (3000/tháng) | — | **$0** |
| **Tổng** | | | | **$0** |

### Architecture diagram

```
[Users in VN]
     │ HTTPS
     ▼
[Vercel Free - sin1]            (no pause, no cold start)
     │ static + SSR + /api/proxy/*
     ▼
[Fly.io Free - sin]              (cold start 5-15s sau 5 phút idle)
     │ ASP.NET Core 8 (.NET 8)
     │ 1-3 shared VMs 256MB
     ▼
[Supabase Free - ap-southeast-1] (PAUSE sau 7 ngày không dùng)
     │ Postgres 15
     │ 500MB DB, 50k MAU
```

### Free tier limits & mitigations

| Dịch vụ | Free limits | Hạn chế | Mitigation |
|---------|-------------|---------|------------|
| **Vercel** | 100GB BW, 6000 build-min/tháng, 100GB-h function | Không pause | OK — phù hợp prod |
| **Fly.io** | 3 shared VMs 256MB, 3GB storage, 160GB egress | **Scale-to-zero** → cold start 5-15s | Accept hoặc cron ping mỗi 3 phút |
| **Supabase** | 500MB DB, 1GB storage, 2GB egress, 50k MAU | **Pause** sau 7 ngày không dùng | GitHub Action cron gọi `/rest/v1/` mỗi 5 ngày |

### Khi nào cần upgrade

| Trigger | Action | Cost |
|---------|--------|------|
| DB > 500MB | Supabase Pro | $25/tháng (8GB) |
| BW > 100GB/tháng | Vercel Pro | $20/tháng (1TB) |
| Cần multi-region | Vercel Enterprise + Fly multi-region | $100+/tháng |
| Cần SLA + support | Supabase + Fly + Vercel Pro | ~$80/tháng |

**Cho đến khi scale**: $0.

### Key choices

1. **Vercel cho Web, KHÔNG dùng Fly.io cho Next.js** — Vercel tối ưu cho Next.js (ISR, image optimization, edge cache)
2. **Fly.io cho .NET** — Docker support tốt nhất trong free tier (Render/Railway paid)
3. **Supabase thay vì tự host Postgres** — Free tier bao gồm Auth + RLS + Storage + Realtime
4. **Singapore region** cho cả 3 — latency từ VN ~30-50ms
5. **GitHub Actions cho CI/CD** — Free với public repos; private repos cũng có 2000 min/tháng

### Không dùng (vì cost)

- ❌ AWS (EC2/RDS/ALB) — $30+/tháng cho 1 instance
- ❌ Cloud Run / App Engine — vẫn tính phí theo request
- ❌ Render — free tier rất hẹp, không ổn định
- ❌ Railway — không minh bạch pricing
- ❌ DigitalOcean / Linode — $4-6/tháng cho VPS nhỏ nhất

## Consequences

### Positive
- ✅ **$0 tuyệt đối** cho đến khi scale
- ✅ Latency tốt từ VN (~30-50ms Singapore)
- ✅ HTTPS tự động (Vercel + Fly đều có Let's Encrypt)
- ✅ Auto-scaling trong free tier
- ✅ Zero-downtime deploy (Fly bluegreen, Vercel atomic)
- ✅ CI/CD free với GitHub Actions
- ✅ Provider độc lập — vendor lock-in thấp

### Negative
- ⚠️ Supabase pause sau 7 ngày idle — workaround: cron ping
- ⚠️ Fly.io cold start 5-15s — workaround: cron ping hoặc 1 VM 24/7
- ⚠️ DB giới hạn 500MB — đủ cho ~50k records, scale cần upgrade
- ⚠️ Vercel build queue có thể chậm khi traffic cao (rare)
- ⚠️ Không có SLA chính thức ở free tier

### Mitigations

```yaml
# Giữ Supabase không pause
GitHub Action cron: mỗi 5 ngày gọi GET /rest/v1/

# Giảm Fly.io cold start (optional)
GitHub Action cron: mỗi 3 phút gọi GET /health/live (giữ 1 VM warm)

# Monitor uptime
UptimeRobot.com (free 50 monitors) → alert qua email/Telegram
```

## Migration path khi scale

1. **DB đầy (500MB)** → upgrade Supabase Pro $25 → 8GB
2. **BW đầy (100GB)** → upgrade Vercel Pro $20 → 1TB
3. **VM cần mạnh hơn** → Fly.io dedicated CPU ~$10-30/VM
4. **Cần SLA** → upgrade cả 3 → ~$80/tháng
5. **Multi-region** → Vercel Enterprise + Fly multi-region → $200+/tháng

## References

- Vercel pricing: https://vercel.com/pricing
- Fly.io pricing: https://fly.io/docs/about/pricing
- Supabase pricing: https://supabase.com/pricing
- GitHub Actions pricing: https://docs.github.com/en/billing/managing-billing-for-github-actions
