# harvey
Professional Portfolio

## Performance

- Measured audit and optimization plan: [assets/docs/PERFORMANCE_AUDIT_2026-06-14.md](assets/docs/PERFORMANCE_AUDIT_2026-06-14.md)
- Includes exact media sizes/bitrates, estimated impact, and ready-to-run ffmpeg commands.

## Analytics Dashboard

- Private dashboard URL: `analytics.html`.
- The dashboard is hidden from the public site navigation, gated by owner passcode, and blocked from indexing via `robots.txt` and `noindex` meta.
- Event data is stored locally under `harveyAnalyticsEvents` and can also stream to Cloudflare Worker.

## Change Owner Passcode

1. Generate a new SHA-256 hash in PowerShell:
	- `$text = 'YOUR_NEW_PASSPHRASE'; $bytes = [System.Text.Encoding]::UTF8.GetBytes($text); $sha = [System.Security.Cryptography.SHA256]::Create(); ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''`
2. Replace `data-owner-hash` in `analytics.html` with the generated hash.

## Cloud Analytics API

1. Deploy [analytics-worker/README.md](analytics-worker/README.md).
2. Set your ingest endpoint in [java/analytics-config.js](java/analytics-config.js):
	- `window.HARVEY_ANALYTICS_ENDPOINT = 'https://<your-worker>.workers.dev/events'`
3. Set your summary API base in [java/analytics-config.js](java/analytics-config.js):
	- `window.HARVEY_ANALYTICS_API_BASE = 'https://<your-worker>.workers.dev'`
4. When unlocking the dashboard, paste your `HARVEY_ANALYTICS_ADMIN_KEY` in the optional API key field.

## Deployment Checklist

1. Replace `database_id` in [analytics-worker/wrangler.toml](analytics-worker/wrangler.toml).
2. Set both `HARVEY_ANALYTICS_ENDPOINT` and `HARVEY_ANALYTICS_API_BASE` in [java/analytics-config.js](java/analytics-config.js).
3. Confirm your passcode hash in [analytics.html](analytics.html) (`data-owner-hash`).
4. Deploy worker and D1 schema from [analytics-worker](analytics-worker).
5. Deploy static site files to your hosting provider.

## UTM/Source Tracking

- Captured automatically: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`.
- Source detection also classifies traffic as direct, social, search, or referral.
