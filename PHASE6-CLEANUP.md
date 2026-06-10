# Phase 6: Cleanup Old Services

After migration to 2-service stack (Supabase + Cloudflare Pages), the legacy services can be removed.

## Services to delete

### 1. Render Web Service
- **Service ID**: `srv-d8j8h248aovs73929qng`
- **Name**: `inventory-pro-api`
- **URL**: https://dashboard.render.com/web/srv-d8j8h248aovs73929qng
- **Status**: Should already show "Suspended" or "Not deployed" since all pages migrated
- **Action**: Settings → scroll bottom → Delete Service → confirm

### 2. Vercel Project
- **Project name**: `quan-ly-kho-vat-tu-pro` (or `inventory-pro-web` if renamed)
- **URL**: https://vercel.com/dashboard
- **Status**: Last deployment from before migration (typo fix commits, edge runtime commits)
- **Action**: Project → Settings → scroll bottom → Delete Project → confirm

### 3. (Optional) Old C# code
- **Path**: `apps/api/`
- **Status**: All logic ported to TypeScript Edge Functions (Phase 3)
- **Action**: `git rm -r apps/api/` and commit
- **Note**: Keep C# config in a separate branch as reference for 1 month before full deletion

## Final stack (after Phase 6)

```
[User]
  ↓
Cloudflare Pages (DNS + CDN)
  ↓
Supabase (Postgres + Auth + Edge Functions + Storage + pg_cron)
```

**2 services, 1 dashboard to manage (Supabase), 1 dashboard for hosting (Cloudflare).**

## Post-cleanup verification

After deleting Render and Vercel:

1. **Frontend**: https://quankho.pages.dev still works
2. **API**: Edge Functions at https://ituyoplyuhbdxkhabcpy.supabase.co/functions/v1/ still work
3. **DB**: Postgres tables still have all data
4. **Auth**: Users can still log in
5. **Cron**: pg_cron schedule still active

## Cost savings

| Service | Plan | Monthly |
|---|---|---|
| Render | Free | $0 (was free) |
| Vercel | Free | $0 (was free) |
| Supabase | Free | $0 |
| Cloudflare | Free | $0 |
| **Total** | | **$0/month** |

Free tier is sufficient for MVP with up to ~10K MAU. Upgrade to Pro ($25/mo) when hitting limits:
- Supabase Pro: 8 GB DB, 250 GB egress, 2M Edge Function invocations
- Cloudflare Pages: 500K requests/day, unlimited bandwidth
