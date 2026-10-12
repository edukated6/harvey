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

Set the password used by the private dashboard login. The username is `admin`; the password is kept only as a Worker secret:

- `wrangler secret put HARVEY_ADMIN_PASSWORD`

Set the Stripe secret used by the dynamic checkout route:

- `wrangler secret put STRIPE_SECRET_KEY`

Set the Stripe webhook secret used by the purchase email automation:

- `wrangler secret put STRIPE_WEBHOOK_SECRET`

Set the Resend API key used to send the project brief after purchase:

- `wrangler secret put RESEND_API_KEY`

Optional, set explicit site origin used by CORS checks:

- `wrangler secret put ALLOWED_ORIGIN` is not required because [analytics-worker/wrangler.toml](analytics-worker/wrangler.toml) already sets `ALLOWED_ORIGIN` in `[vars]`.

Set the key used to sign forProducers download links (any long random string):

- `wrangler secret put DOWNLOAD_SIGNING_SECRET`

## 2b) forProducers Downloads (R2)

The installers live in the R2 bucket bound as `DOWNLOADS` in [analytics-worker/wrangler.toml](analytics-worker/wrangler.toml). `DOWNLOAD_FILES` maps `tier:os` to the object key. After a visitor gives an email, `POST /downloads` returns a signed `/downloads/file/<key>` link that expires after 10 minutes, and the worker streams the file from R2 (resumable downloads supported).

Keep the bucket private: turn off the r2.dev URL and disconnect the public custom domain, or the files can be downloaded without an email. To release a new version, upload the file to the bucket and update its key in `DOWNLOAD_FILES`.

## 3) Configure Stripe Prices

For the dynamic checkout route, map the service keys to Stripe Price IDs in [analytics-worker/wrangler.toml](analytics-worker/wrangler.toml):

- `STRIPE_SERVICE_PRICES = '{"short-form-editing:short-form-edit":"price_...","long-form-editing:long-form-edit":"price_...","motion-graphics:2d-opener":"price_...","motion-graphics:lower-third-mogrt":"price_...","motion-graphics:2d-transition":"price_..."}'`

Use the exact option values from the service dropdowns and the service IDs from the booking builder.

## 4) Deploy

- `npm run deploy`

Or run the helper script (updates `wrangler.toml`, sets secret, deploys):

- `./deploy-worker.ps1 -DatabaseId "<D1_DATABASE_ID>" -AdminKey "<HARVEY_ANALYTICS_ADMIN_KEY>" -AllowedOrigin "https://theharveyeffect.com"`

Use the deployed URL as your site-side endpoint:

- `window.HARVEY_ANALYTICS_ENDPOINT = "https://<your-worker>.workers.dev/events"`

Also set API base:

- `window.HARVEY_ANALYTICS_API_BASE = "https://<your-worker>.workers.dev"`

The login endpoint creates an eight-hour session. A valid session token is required for owner endpoints and blog administration actions.

## Endpoints

- `POST /events` (public ingest)
- `POST /auth/login` (issues a server session)
- `POST /auth/logout` (revokes the current server session)
- `GET /summary?days=14` (authenticated session required)
- `GET /recent?limit=30` (authenticated session required)
- `POST /downloads` (public; saves the visitor's email and returns a 10-minute signed download link)
- `GET /downloads/file/<key>?exp=&sig=` (public; streams the installer from R2 when the signature is valid)
- `GET /admin/downloads?days=14` (authenticated session required; download counts, OS mix, recent signups)
- `GET /admin/downloads.csv` (authenticated session required; one row per email for newsletter import)

Auth header for owner endpoints:

- `Authorization: Bearer <session token>`
