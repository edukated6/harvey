export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = {
      ...getCorsHeaders(origin, env),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Analytics-Key',
      'Cache-Control': 'no-store',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/events') {
      return ingestEvent(request, env, corsHeaders);
    }

    if (request.method === 'GET' && url.pathname === '/summary') {
      if (!isAuthorized(request, env)) {
        return json({ error: 'Unauthorized' }, 401, corsHeaders);
      }
      return getSummary(request, env, corsHeaders);
    }

    if (request.method === 'GET' && url.pathname === '/recent') {
      if (!isAuthorized(request, env)) {
        return json({ error: 'Unauthorized' }, 401, corsHeaders);
      }
      return getRecent(request, env, corsHeaders);
    }

    return json({ error: 'Not found' }, 404, corsHeaders);
  },
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function getCorsHeaders(origin, env) {
  const allowedOrigin = env.ALLOWED_ORIGIN || '';
  const originAllowed = origin && allowedOrigin && origin.toLowerCase() === allowedOrigin.toLowerCase();

  return {
    'Access-Control-Allow-Origin': originAllowed ? origin : allowedOrigin || '*',
    Vary: 'Origin',
  };
}

function isAuthorized(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const headerKey = request.headers.get('X-Analytics-Key') || '';
  const provided = bearer || headerKey;
  const expected = env.HARVEY_ANALYTICS_ADMIN_KEY || '';
  return Boolean(expected) && provided === expected;
}

async function ingestEvent(request, env, headers) {
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, headers);
  }

  if (!payload || typeof payload !== 'object') {
    return json({ error: 'Invalid payload' }, 400, headers);
  }

  const event = asString(payload.event, 80);
  const timestamp = normalizeTimestamp(payload.timestamp);

  if (!event) {
    return json({ error: 'Missing event name' }, 400, headers);
  }

  const bind = env.DB
    .prepare(
      `INSERT INTO analytics_events (
        event, timestamp, visitor_id, session_id, page, page_title, device,
        referrer, query, source_type, source_name,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        target, label, role, seconds, milestone, progress, title, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event,
      timestamp,
      asString(payload.visitorId, 120),
      asString(payload.sessionId, 120),
      asString(payload.page, 240),
      asString(payload.pageTitle, 240),
      asString(payload.device, 32),
      asString(payload.referrer, 500),
      asString(payload.query, 500),
      asString(payload.sourceType, 64),
      asString(payload.sourceName, 120),
      asString(payload.utmSource, 120),
      asString(payload.utmMedium, 120),
      asString(payload.utmCampaign, 160),
      asString(payload.utmContent, 160),
      asString(payload.utmTerm, 160),
      asString(payload.target, 240),
      asString(payload.label, 240),
      asString(payload.role, 80),
      asInt(payload.seconds),
      asInt(payload.milestone),
      asInt(payload.progress),
      asString(payload.title, 240),
      safeJson(payload)
    );

  await bind.run();

  return json({ ok: true }, 202, headers);
}

async function getSummary(request, env, headers) {
  const url = new URL(request.url);
  const days = clamp(asInt(url.searchParams.get('days'), 14), 1, 90);

  const totalsQuery = env.DB
    .prepare(
      `SELECT
         SUM(CASE WHEN event = 'page_view' THEN 1 ELSE 0 END) AS total_views,
         COUNT(DISTINCT CASE WHEN event = 'page_view' THEN visitor_id END) AS unique_viewers,
         SUM(CASE WHEN event LIKE '%_click' OR event = 'analytics_page_open' THEN 1 ELSE 0 END) AS total_clicks,
         AVG(CASE WHEN event = 'engagement_time' THEN seconds END) AS avg_engagement_seconds
       FROM analytics_events
       WHERE timestamp >= datetime('now', ?)`
    )
    .bind(`-${days} day`);

  const trendQuery = env.DB
    .prepare(
      `SELECT
         substr(timestamp, 1, 10) AS day,
         SUM(CASE WHEN event = 'page_view' THEN 1 ELSE 0 END) AS views
       FROM analytics_events
       WHERE timestamp >= datetime('now', ?)
       GROUP BY day
       ORDER BY day ASC`
    )
    .bind(`-${days} day`);

  const sourceQuery = env.DB
    .prepare(
      `SELECT
         COALESCE(NULLIF(source_name, ''), 'unknown') AS source,
         SUM(CASE WHEN event = 'page_view' THEN 1 ELSE 0 END) AS views
       FROM analytics_events
       WHERE timestamp >= datetime('now', ?)
       GROUP BY source
       ORDER BY views DESC
       LIMIT 8`
    )
    .bind(`-${days} day`);

  const utmQuery = env.DB
    .prepare(
      `SELECT
         COALESCE(NULLIF(utm_campaign, ''), '(not set)') AS campaign,
         SUM(CASE WHEN event = 'page_view' THEN 1 ELSE 0 END) AS views,
         SUM(CASE WHEN event LIKE '%_click' OR event = 'analytics_page_open' THEN 1 ELSE 0 END) AS clicks
       FROM analytics_events
       WHERE timestamp >= datetime('now', ?)
       GROUP BY campaign
       ORDER BY views DESC
       LIMIT 10`
    )
    .bind(`-${days} day`);

  const [totals, trend, sources, campaigns] = await Promise.all([
    totalsQuery.first(),
    trendQuery.all(),
    sourceQuery.all(),
    utmQuery.all(),
  ]);

  return json(
    {
      days,
      totals: {
        totalViews: asInt(totals?.total_views),
        uniqueViewers: asInt(totals?.unique_viewers),
        totalClicks: asInt(totals?.total_clicks),
        avgEngagementSeconds: Math.round(Number(totals?.avg_engagement_seconds || 0)),
      },
      trend: (trend.results || []).map((row) => ({ day: row.day, views: asInt(row.views) })),
      sources: (sources.results || []).map((row) => ({ source: row.source, views: asInt(row.views) })),
      campaigns: (campaigns.results || []).map((row) => ({
        campaign: row.campaign,
        views: asInt(row.views),
        clicks: asInt(row.clicks),
      })),
    },
    200,
    headers
  );
}

async function getRecent(request, env, headers) {
  const url = new URL(request.url);
  const limit = clamp(asInt(url.searchParams.get('limit'), 30), 1, 100);

  const rows = await env.DB
    .prepare(
      `SELECT event, timestamp, page, page_title, source_name, utm_campaign, target, label
       FROM analytics_events
       ORDER BY id DESC
       LIMIT ?`
    )
    .bind(limit)
    .all();

  return json({ rows: rows.results || [] }, 200, headers);
}

function asString(value, max = 120) {
  if (value === null || value === undefined) return '';
  return String(value).slice(0, max);
}

function asInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function safeJson(payload) {
  try {
    return JSON.stringify(payload);
  } catch {
    return '{}';
  }
}
