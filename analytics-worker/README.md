# Harvey Analytics API (Cloudflare Worker + D1)

This worker receives portfolio analytics events and serves owner-only summary endpoints.

## 0) Install Tooling

Run from [analytics-worker](analytics-worker):

- `npm install`
- `npx wrangler login` (required once per machine)

## 1) Create D1 Database

1. Create DB:
   - `npm run d1:create`
2. Copy the produced `database_id` into [analytics-worker/wrangler.toml](analytics-worker/wrangler.toml).
3. Apply schema:
   - `npm run d1:migrate`

## 2) Set Owner Secret

Set a worker secret that is required for owner dashboard API reads:

- `wrangler secret put HARVEY_ANALYTICS_ADMIN_KEY`

Optional, set explicit site origin used by CORS checks:

- `wrangler secret put ALLOWED_ORIGIN` is not required because [analytics-worker/wrangler.toml](analytics-worker/wrangler.toml) already sets `ALLOWED_ORIGIN` in `[vars]`.

## 3) Deploy

- `npm run deploy`

Or run the helper script (updates `wrangler.toml`, sets secret, deploys):

- `./deploy-worker.ps1 -DatabaseId "<D1_DATABASE_ID>" -AdminKey "<HARVEY_ANALYTICS_ADMIN_KEY>" -AllowedOrigin "https://theharveyeffect.com"`

Use the deployed URL as your site-side endpoint:

- `window.HARVEY_ANALYTICS_ENDPOINT = "https://<your-worker>.workers.dev/events"`

Also set API base:

- `window.HARVEY_ANALYTICS_API_BASE = "https://<your-worker>.workers.dev"`

Use the same admin key inside your private dashboard gate to read summary data.

## Endpoints

- `POST /events` (public ingest)
- `GET /summary?days=14` (owner key required)
- `GET /recent?limit=30` (owner key required)

Auth header for owner endpoints:

- `Authorization: Bearer <HARVEY_ANALYTICS_ADMIN_KEY>`
