import Stripe from 'stripe';

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

    if (request.method === 'POST' && url.pathname === '/auth/login') {
      return loginAdmin(request, env, corsHeaders);
    }

    if (request.method === 'POST' && url.pathname === '/events') {
      return ingestEvent(request, env, corsHeaders);
    }

    if (request.method === 'POST' && url.pathname === '/checkout') {
      return createCheckoutSession(request, env, corsHeaders);
    }

    if (request.method === 'POST' && url.pathname === '/webhook/stripe') {
      return handleStripeWebhook(request, env, corsHeaders);
    }

    if (request.method === 'GET' && url.pathname === '/summary') {
      if (!(await isAuthorized(request, env))) {
        return json({ error: 'Unauthorized' }, 401, corsHeaders);
      }
      return getSummary(request, env, corsHeaders);
    }

    if (request.method === 'GET' && url.pathname === '/recent') {
      if (!(await isAuthorized(request, env))) {
        return json({ error: 'Unauthorized' }, 401, corsHeaders);
      }
      return getRecent(request, env, corsHeaders);
    }

    if (request.method === 'GET' && url.pathname === '/posts') {
      return listPublishedPosts(request, env, corsHeaders);
    }

    if (request.method === 'GET' && url.pathname.startsWith('/posts/')) {
      return getPostBySlug(request, env, corsHeaders, url.pathname.slice('/posts/'.length));
    }

    if (request.method === 'GET' && url.pathname === '/comments') {
      return listApprovedComments(request, env, corsHeaders);
    }

    if (request.method === 'GET' && url.pathname === '/comments/recent') {
      return listRecentApprovedComments(request, env, corsHeaders);
    }

    if (request.method === 'POST' && url.pathname === '/comments') {
      return createComment(request, env, corsHeaders);
    }

    if (url.pathname === '/admin/posts' || url.pathname.startsWith('/admin/posts/')) {
      if (!(await isAuthorized(request, env))) {
        return json({ error: 'Unauthorized' }, 401, corsHeaders);
      }
      if (request.method === 'GET' && url.pathname === '/admin/posts') {
        return listAllPosts(request, env, corsHeaders);
      }
      if (request.method === 'POST' && url.pathname === '/admin/posts') {
        return createPost(request, env, corsHeaders);
      }
      const postIdMatch = url.pathname.match(/^\/admin\/posts\/(\d+)$/);
      if (postIdMatch && request.method === 'PUT') {
        return updatePost(request, env, corsHeaders, Number(postIdMatch[1]));
      }
      if (postIdMatch && request.method === 'DELETE') {
        return deletePost(request, env, corsHeaders, Number(postIdMatch[1]));
      }
    }

    if (url.pathname === '/admin/comments' || url.pathname.startsWith('/admin/comments/')) {
      if (!(await isAuthorized(request, env))) {
        return json({ error: 'Unauthorized' }, 401, corsHeaders);
      }
      if (request.method === 'GET' && url.pathname === '/admin/comments') {
        return listAllComments(request, env, corsHeaders);
      }
      const commentIdMatch = url.pathname.match(/^\/admin\/comments\/(\d+)$/);
      if (commentIdMatch && request.method === 'PUT') {
        return updateCommentStatus(request, env, corsHeaders, Number(commentIdMatch[1]));
      }
      if (commentIdMatch && request.method === 'DELETE') {
        return deleteComment(request, env, corsHeaders, Number(commentIdMatch[1]));
      }
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
  const configuredOrigins = [
    env.ALLOWED_ORIGIN || '',
    env.ALLOWED_ORIGINS || '',
    'https://www.theharveyeffect.com',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
  ]
    .join(',')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const originAllowed = origin && configuredOrigins.includes(origin.toLowerCase());

  return {
    'Access-Control-Allow-Origin': originAllowed ? origin : configuredOrigins[0] || '*',
    Vary: 'Origin',
  };
}

async function isAuthorized(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!bearer || !env.DB) return false;

  const tokenHash = await hashToken(bearer);
  const session = await env.DB
    .prepare(`SELECT id FROM admin_sessions WHERE token_hash = ? AND expires_at > datetime('now')`)
    .bind(tokenHash)
    .first();
  return Boolean(session);
}

async function hashToken(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function loginAdmin(request, env, headers) {
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, headers);
  }

  const username = asString(payload?.username, 120);
  const password = asString(payload?.password, 500);
  const expectedPassword = asString(env.HARVEY_ADMIN_PASSWORD, 500);

  if (!expectedPassword || username !== 'admin' || password !== expectedPassword) {
    return json({ error: 'Invalid username or passcode' }, 401, headers);
  }

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await hashToken(token);
  await env.DB
    .prepare(`INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, datetime('now', '+8 hours'))`)
    .bind(tokenHash)
    .run();

  return json({ token, expiresIn: 8 * 60 * 60 }, 200, headers);
}

function getStripeClient(env) {
  const secretKey = (env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) return null;

  return new Stripe(secretKey, {
    apiVersion: '2025-02-24.acacia',
  });
}

function parsePriceMap(env) {
  try {
    const raw = env.STRIPE_SERVICE_PRICES || '{}';
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function compactSummary(items, fallback = 'None selected') {
  if (!Array.isArray(items) || !items.length) return fallback;
  return items
    .map((item) => {
      const label = item.name || item.id || 'Service';
      const quantity = Number(item.quantity || item.qty || 1);
      return quantity > 1 ? `${label} x${quantity}` : label;
    })
    .join(', ')
    .slice(0, 300);
}

function normalizeQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(1, Math.min(99, Math.round(quantity)));
}

function resolveStripePriceId(service, priceMap) {
  if (!service || typeof service !== 'object') return null;

  const keys = [
    `${service.id || ''}:${service.variant || ''}`,
    `${service.id || ''}`,
    `${service.id || ''}:${service.option || ''}`,
  ].filter(Boolean);

  for (const key of keys) {
    if (priceMap[key]) return String(priceMap[key]);
  }

  return null;
}

async function createCheckoutSession(request, env, headers) {
  const stripe = getStripeClient(env);
  if (!stripe) {
    return json({ error: 'Stripe checkout is not configured on the server.' }, 500, headers);
  }

  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, headers);
  }

  const priceMap = parsePriceMap(env);
  const selectedServices = Array.isArray(payload?.selectedServices) ? payload.selectedServices : [];
  const selectedAddOns = Array.isArray(payload?.selectedAddOns) ? payload.selectedAddOns : [];

  const lineItems = [];

  selectedServices.forEach((service) => {
    const priceId = resolveStripePriceId(service, priceMap);
    if (!priceId) return;

    lineItems.push({
      price: priceId,
      quantity: normalizeQuantity(service.quantity),
    });
  });

  selectedAddOns.forEach((addon) => {
    const priceId = resolveStripePriceId(addon, priceMap);
    if (!priceId) return;

    lineItems.push({
      price: priceId,
      quantity: normalizeQuantity(addon.quantity || 1),
    });
  });

  if (!lineItems.length) {
    return json({ error: 'No valid Stripe line items were found for this checkout request.' }, 400, headers);
  }

  const total = lineItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
  if (!total) {
    return json({ error: 'Checkout total is invalid.' }, 400, headers);
  }

  const successUrl = (env.STRIPE_SUCCESS_URL || 'https://theharveyeffect.com/?checkout=success').trim();
  const cancelUrl = (env.STRIPE_CANCEL_URL || 'https://theharveyeffect.com/?checkout=cancelled').trim();

  const serviceSummary = compactSummary(selectedServices, 'No services selected');
  const addOnSummary = compactSummary(selectedAddOns, 'No add-ons selected');

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    metadata: {
      projectName: asString(payload?.projectName, 200),
      timeline: asString(payload?.timeline, 80),
      details: asString(payload?.details, 300),
      serviceSummary,
      addOnSummary,
      source: 'portfolio-builder',
    },
  });

  return json({ url: session.url }, 200, headers);
}

async function handleStripeWebhook(request, env, headers) {
  const stripe = getStripeClient(env);
  if (!stripe) {
    return json({ error: 'Stripe webhook is not configured on the server.' }, 500, headers);
  }

  const webhookSecret = (env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) {
    return json({ error: 'Stripe webhook secret is not configured.' }, 500, headers);
  }

  const signature = request.headers.get('Stripe-Signature') || '';
  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    return json({ error: 'Invalid Stripe webhook signature.' }, 400, headers);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object || {};
    const customerEmail = session.customer_details?.email || session.customer_email || env.EMAIL_TO || 'ahmaadharvey@pm.me';
    const projectName = asString(session.metadata?.projectName, 200) || 'Untitled project';
    const timeline = asString(session.metadata?.timeline, 80) || 'standard';
    const details = asString(session.metadata?.details, 300) || 'No additional notes were provided.';
    const serviceSummary = asString(session.metadata?.serviceSummary, 300) || 'No services selected';
    const addOnSummary = asString(session.metadata?.addOnSummary, 300) || 'No add-ons selected';

    const subject = `New booking: ${projectName}`;
    const html = `
      <h2>New service purchase</h2>
      <p><strong>Project:</strong> ${escapeHtml(projectName)}</p>
      <p><strong>Timeline:</strong> ${escapeHtml(timeline)}</p>
      <p><strong>Services:</strong> ${escapeHtml(serviceSummary)}</p>
      <p><strong>Add-ons:</strong> ${escapeHtml(addOnSummary)}</p>
      <p><strong>Project details:</strong> ${escapeHtml(details)}</p>
      <p><strong>Customer email:</strong> ${escapeHtml(customerEmail)}</p>
    `;

    await sendProjectBriefEmail(env, customerEmail, subject, html);
  }

  return json({ received: true }, 200, headers);
}

async function sendProjectBriefEmail(env, customerEmail, subject, htmlBody) {
  const apiKey = (env.RESEND_API_KEY || '').trim();
  const from = (env.RESEND_FROM || 'onboarding@resend.dev').trim();
  const to = (env.EMAIL_TO || 'ahmaadharvey@pm.me').trim();

  if (!apiKey) {
    return false;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: customerEmail,
      subject,
      html: htmlBody,
    }),
  });

  return response.ok;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function serializePost(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMd: row.body_md,
    coverImage: row.cover_image,
    category: row.category,
    tags: row.tags ? String(row.tags).split(',').map((t) => t.trim()).filter(Boolean) : [],
    relatedServiceId: row.related_service_id,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listPublishedPosts(request, env, headers) {
  const url = new URL(request.url);
  const limit = clamp(asInt(url.searchParams.get('limit'), 20), 1, 50);

  const rows = await env.DB
    .prepare(
      `SELECT id, slug, title, excerpt, cover_image, category, tags, related_service_id, published_at
       FROM posts
       WHERE status = 'published'
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all();

  return json({ posts: (rows.results || []).map(serializePost) }, 200, headers);
}

async function getPostBySlug(request, env, headers, slug) {
  const cleanSlug = asString(decodeURIComponent(slug || ''), 120);
  if (!cleanSlug) {
    return json({ error: 'Missing slug' }, 400, headers);
  }

  const row = await env.DB
    .prepare(`SELECT * FROM posts WHERE slug = ? AND status = 'published'`)
    .bind(cleanSlug)
    .first();

  if (!row) {
    return json({ error: 'Post not found' }, 404, headers);
  }

  return json({ post: serializePost(row) }, 200, headers);
}

async function listAllPosts(request, env, headers) {
  const rows = await env.DB.prepare(`SELECT * FROM posts ORDER BY created_at DESC`).all();
  return json({ posts: (rows.results || []).map(serializePost) }, 200, headers);
}

async function createPost(request, env, headers) {
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, headers);
  }

  const title = asString(payload?.title, 200);
  const bodyMd = asString(payload?.bodyMd, 20000);
  if (!title || !bodyMd) {
    return json({ error: 'Title and body are required' }, 400, headers);
  }

  const slug = asString(payload?.slug, 120) ? slugify(payload.slug) : slugify(title);
  if (!slug) {
    return json({ error: 'Unable to derive a slug from the title' }, 400, headers);
  }

  const status = payload?.status === 'published' ? 'published' : 'draft';
  const publishedAt = status === 'published' ? normalizeTimestamp(payload?.publishedAt) : null;
  const tags = Array.isArray(payload?.tags) ? payload.tags.join(',') : asString(payload?.tags, 300);

  try {
    const result = await env.DB
      .prepare(
        `INSERT INTO posts (slug, title, excerpt, body_md, cover_image, category, tags, related_service_id, status, published_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        slug,
        title,
        asString(payload?.excerpt, 400),
        bodyMd,
        asString(payload?.coverImage, 400),
        asString(payload?.category, 80),
        tags,
        asString(payload?.relatedServiceId, 120),
        status,
        publishedAt
      )
      .run();

    return json({ ok: true, id: result.meta?.last_row_id }, 201, headers);
  } catch (error) {
    return json({ error: 'A post with that slug already exists.' }, 409, headers);
  }
}

async function updatePost(request, env, headers, id) {
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, headers);
  }

  const existing = await env.DB.prepare(`SELECT * FROM posts WHERE id = ?`).bind(id).first();
  if (!existing) {
    return json({ error: 'Post not found' }, 404, headers);
  }

  const title = asString(payload?.title, 200) || existing.title;
  const slug = payload?.slug ? slugify(payload.slug) : existing.slug;
  const status = payload?.status === 'published' || payload?.status === 'draft' ? payload.status : existing.status;
  const wasPublished = existing.status === 'published';
  const publishedAt = status === 'published' ? existing.published_at || normalizeTimestamp() : null;
  const tags = Array.isArray(payload?.tags) ? payload.tags.join(',') : asString(payload?.tags, 300) || existing.tags;

  await env.DB
    .prepare(
      `UPDATE posts SET
         slug = ?, title = ?, excerpt = ?, body_md = ?, cover_image = ?, category = ?, tags = ?,
         related_service_id = ?, status = ?, published_at = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(
      slug,
      title,
      asString(payload?.excerpt, 400) || existing.excerpt,
      asString(payload?.bodyMd, 20000) || existing.body_md,
      asString(payload?.coverImage, 400) || existing.cover_image,
      asString(payload?.category, 80) || existing.category,
      tags,
      asString(payload?.relatedServiceId, 120) || existing.related_service_id,
      status,
      status === 'published' && !wasPublished ? normalizeTimestamp() : publishedAt,
      id
    )
    .run();

  return json({ ok: true }, 200, headers);
}

async function deletePost(request, env, headers, id) {
  await env.DB.prepare(`DELETE FROM comments WHERE post_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM posts WHERE id = ?`).bind(id).run();
  return json({ ok: true }, 200, headers);
}

function serializeComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    parentId: row.parent_id,
    authorName: row.author_name,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function listApprovedComments(request, env, headers) {
  const url = new URL(request.url);
  const postId = asInt(url.searchParams.get('postId'), 0);
  if (!postId) {
    return json({ error: 'Missing postId' }, 400, headers);
  }

  const rows = await env.DB
    .prepare(`SELECT * FROM comments WHERE post_id = ? AND status = 'approved' ORDER BY created_at ASC`)
    .bind(postId)
    .all();

  return json({ comments: (rows.results || []).map(serializeComment) }, 200, headers);
}

async function listRecentApprovedComments(request, env, headers) {
  const url = new URL(request.url);
  const limit = clamp(asInt(url.searchParams.get('limit'), 6), 1, 20);

  const rows = await env.DB
    .prepare(
      `SELECT comments.*, posts.slug AS post_slug, posts.title AS post_title
       FROM comments
       JOIN posts ON posts.id = comments.post_id
       WHERE comments.status = 'approved' AND posts.status = 'published'
       ORDER BY comments.created_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all();

  const comments = (rows.results || []).map((row) => ({
    ...serializeComment(row),
    postSlug: row.post_slug,
    postTitle: row.post_title,
  }));

  return json({ comments }, 200, headers);
}

async function createComment(request, env, headers) {
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, headers);
  }

  const postId = asInt(payload?.postId, 0);
  const authorName = asString(payload?.authorName, 80).trim();
  const body = asString(payload?.body, 2000).trim();
  const honeypot = asString(payload?.website, 200);

  if (honeypot) {
    return json({ ok: true }, 202, headers);
  }

  if (!postId || !authorName || !body) {
    return json({ error: 'postId, authorName, and body are required' }, 400, headers);
  }

  const post = await env.DB.prepare(`SELECT id FROM posts WHERE id = ? AND status = 'published'`).bind(postId).first();
  if (!post) {
    return json({ error: 'Post not found' }, 404, headers);
  }

  const visitorId = asString(payload?.visitorId, 120);
  if (visitorId) {
    const recent = await env.DB
      .prepare(
        `SELECT COUNT(*) AS count FROM comments
         WHERE visitor_id = ? AND created_at >= datetime('now', '-1 minute')`
      )
      .bind(visitorId)
      .first();
    if (asInt(recent?.count) >= 3) {
      return json({ error: 'You are commenting too quickly. Please wait a moment.' }, 429, headers);
    }
  }

  await env.DB
    .prepare(
      `INSERT INTO comments (post_id, parent_id, author_name, body, visitor_id, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    )
    .bind(postId, asInt(payload?.parentId, 0) || null, authorName, body, visitorId)
    .run();

  return json({ ok: true, message: 'Comment submitted for review.' }, 202, headers);
}

async function listAllComments(request, env, headers) {
  const url = new URL(request.url);
  const status = asString(url.searchParams.get('status'), 20);

  const rows = status
    ? await env.DB.prepare(`SELECT * FROM comments WHERE status = ? ORDER BY created_at DESC`).bind(status).all()
    : await env.DB.prepare(`SELECT * FROM comments ORDER BY created_at DESC`).all();

  return json({ comments: (rows.results || []).map(serializeComment) }, 200, headers);
}

async function updateCommentStatus(request, env, headers, id) {
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, headers);
  }

  const status = payload?.status;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return json({ error: 'Invalid status' }, 400, headers);
  }

  await env.DB.prepare(`UPDATE comments SET status = ? WHERE id = ?`).bind(status, id).run();
  return json({ ok: true }, 200, headers);
}

async function deleteComment(request, env, headers, id) {
  await env.DB.prepare(`DELETE FROM comments WHERE id = ?`).bind(id).run();
  return json({ ok: true }, 200, headers);
}
