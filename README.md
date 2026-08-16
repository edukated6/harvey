# harvey
Professional Portfolio

## Performance

- Measured audit and optimization plan: [assets/docs/PERFORMANCE_AUDIT_2026-06-14.md](assets/docs/PERFORMANCE_AUDIT_2026-06-14.md)
- Includes exact media sizes/bitrates, estimated impact, and ready-to-run ffmpeg commands.

## Search Engine Optimization

- Public page metadata includes canonical URLs, Open Graph previews, Twitter cards, and JSON-LD where applicable.
- Generate crawlable blog pages and refresh [sitemap.xml](sitemap.xml) after publishing posts:

	`node scripts/generate-seo.mjs`

- The generator reads published posts from the public analytics API. Set `HARVEY_ANALYTICS_API_BASE` to use a different API during a deployment build.
- GitHub Actions runs the generator and deploys GitHub Pages on pushes to `main`, manually, and every 15 minutes so newly published posts become crawlable without a local command.

### Enable Automatic Pages Deployment

In the repository settings, open **Pages** and set **Build and deployment** → **Source** to **GitHub Actions**. After that, publishing a post through the admin panel will be picked up by the scheduled workflow within the next run. You can also run **Build and deploy site** manually from the repository's **Actions** tab.

## Owner Login

- Private login URL: `login.html`. The page sends credentials only to the Worker and receives an eight-hour, revocable server session.
- `analytics.html` and `admin.html` redirect to login when a browser has no session token. Their protected Worker endpoints independently validate the server session, so changing browser storage alone does not grant access.
- The login, analytics, and admin pages are blocked from indexing via `robots.txt` and `noindex` meta.

## Analytics Dashboard

- Private dashboard URL: `analytics.html`.
- The dashboard is hidden from the public site navigation, gated by owner passcode, and blocked from indexing via `robots.txt` and `noindex` meta.
- Event data is stored locally under `harveyAnalyticsEvents` and can also stream to Cloudflare Worker.

## Change Owner Passcode

Set a strong password as a Worker secret; it is never shipped in the static site:

1. From `analytics-worker`, run `npx wrangler secret put HARVEY_ADMIN_PASSWORD` and enter a unique passphrase when prompted.
2. Sign in with username `admin` and that passphrase.
3. Deploy the Worker after changing the secret or authentication code.

## Cloud Analytics API

1. Deploy [analytics-worker/README.md](analytics-worker/README.md).
2. Set your ingest endpoint in [java/analytics-config.js](java/analytics-config.js):
	- `window.HARVEY_ANALYTICS_ENDPOINT = 'https://<your-worker>.workers.dev/events'`
3. Set your summary API base in [java/analytics-config.js](java/analytics-config.js):
	- `window.HARVEY_ANALYTICS_API_BASE = 'https://<your-worker>.workers.dev'`
4. The dashboard login receives an eight-hour server session. The Worker requires that session for analytics reads and every blog administration action.

## Deployment Checklist

1. Replace `database_id` in [analytics-worker/wrangler.toml](analytics-worker/wrangler.toml).
2. Set both `HARVEY_ANALYTICS_ENDPOINT` and `HARVEY_ANALYTICS_API_BASE` in [java/analytics-config.js](java/analytics-config.js).
3. Set `HARVEY_ADMIN_PASSWORD` with `npx wrangler secret put HARVEY_ADMIN_PASSWORD`.
4. Deploy worker and D1 schema from [analytics-worker](analytics-worker).
5. Deploy static site files to your hosting provider.

## UTM/Source Tracking

- Captured automatically: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`.
- Source detection also classifies traffic as direct, social, search, or referral.
