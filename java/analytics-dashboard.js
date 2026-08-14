const ANALYTICS_STORAGE_KEY = 'harveyAnalyticsEvents';
const MAX_ROWS = 12;
const DEFAULT_DAYS = 14;

function readEvents() {
  try {
    const data = JSON.parse(localStorage.getItem(ANALYTICS_STORAGE_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

function saveEvents(events) {
  try {
    localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(events));
  } catch (error) {
    // Ignore storage write issues.
  }
}

function trackDashboardView(events) {
  const eventPayload = {
    event: 'analytics_dashboard_view',
    timestamp: new Date().toISOString(),
    page: window.location.pathname,
    pageTitle: document.title,
    visitorId: localStorage.getItem('harveyAnalyticsVisitor') || 'visitor_unavailable',
    sessionId: sessionStorage.getItem('harveyAnalyticsSession') || 'session_unavailable',
    device: window.innerWidth <= 768 ? 'mobile' : (window.innerWidth <= 1100 ? 'tablet' : 'desktop'),
  };

  const updated = [...events, eventPayload].slice(-600);
  saveEvents(updated);
  return updated;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatPct(value) {
  return `${Math.round(value || 0)}%`;
}

function dayKey(dateValue) {
  const date = new Date(dateValue);
  return date.toISOString().slice(0, 10);
}

function getLastNDays(days) {
  const labels = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    labels.push(d.toISOString().slice(0, 10));
  }

  return labels;
}

function shortVisitorId(value) {
  if (!value || typeof value !== 'string') return 'unknown';
  return value.length <= 12 ? value : `${value.slice(0, 7)}...${value.slice(-4)}`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function renderTrendBars(dayLabels, dailyViews) {
  const chart = document.getElementById('viewsTrendBars');
  if (!chart) return;

  const max = Math.max(...dayLabels.map((label) => dailyViews.get(label) || 0), 1);
  chart.innerHTML = '';

  dayLabels.forEach((label) => {
    const value = dailyViews.get(label) || 0;
    const ratio = value / max;
    const bar = document.createElement('div');
    bar.className = 'analytics-bar';
    bar.style.setProperty('--bar-height', `${Math.max(8, Math.round(ratio * 100))}%`);
    bar.setAttribute('title', `${label}: ${value} views`);

    const barValue = document.createElement('span');
    barValue.className = 'analytics-bar-value';
    barValue.textContent = String(value);

    const barDay = document.createElement('span');
    barDay.className = 'analytics-bar-day';
    barDay.textContent = label.slice(5);

    bar.append(barValue, barDay);
    chart.appendChild(bar);
  });
}

function renderSimpleList(listId, rows, emptyText, formatter) {
  const list = document.getElementById(listId);
  if (!list) return;

  list.innerHTML = '';
  if (!rows || rows.length === 0) {
    const li = document.createElement('li');
    li.textContent = emptyText;
    list.appendChild(li);
    return;
  }

  rows.forEach((row) => {
    const li = document.createElement('li');
    li.innerHTML = formatter(row);
    list.appendChild(li);
  });
}

function renderTopClicks(events) {
  const clickCounts = new Map();
  events
    .filter((event) => (
      event.event === 'contact_click'
      || event.event === 'analytics_page_open'
      || event.event === 'service_checkout_click'
      || event.event === 'service_brief_send_click'
      || event.event === 'service_checkout_intent'
    ))
    .forEach((event) => {
      const key = event.target || event.label || event.type || 'Unknown target';
      clickCounts.set(key, (clickCounts.get(key) || 0) + 1);
    });

  const rows = [...clickCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  renderSimpleList('topClicksList', rows, 'No click targets tracked yet.', ([target, count]) => `<strong>${count}</strong> • ${target}`);
}

function renderTopSources(sourceRows) {
  renderSimpleList(
    'topSourcesList',
    sourceRows,
    'No source data tracked yet.',
    (row) => `<strong>${formatNumber(row.views)}</strong> • ${row.source}`
  );
}

function renderUtmCampaigns(campaignRows) {
  renderSimpleList(
    'utmCampaignsList',
    campaignRows,
    'No campaign-tagged traffic yet.',
    (row) => `<strong>${formatNumber(row.views)}</strong> views • ${formatNumber(row.clicks)} clicks • ${row.campaign}`
  );
}

function renderServiceFunnel(events) {
  const pageViews = events.filter((event) => event.event === 'page_view').length;
  const builderStarts = events.filter((event) => event.event === 'service_builder_start').length;
  const serviceAdds = events.filter((event) => event.event === 'service_toggle_click' && event.selected === true).length;
  const addOnAdds = events.filter((event) => event.event === 'addon_toggle_click' && event.selected === true).length;
  const checkoutIntents = events.filter((event) => event.event === 'service_checkout_intent').length;
  const secureCheckoutIntents = events.filter(
    (event) => event.event === 'service_checkout_intent' && event.route === 'secure_checkout'
  ).length;
  const proposalIntents = events.filter(
    (event) => event.event === 'service_checkout_intent' && event.route === 'proposal_request'
  ).length;
  const briefSends = events.filter((event) => event.event === 'service_brief_send_click').length;

  const viewToBuilder = pageViews > 0 ? (builderStarts / pageViews) * 100 : 0;
  const builderToCheckout = builderStarts > 0 ? (checkoutIntents / builderStarts) * 100 : 0;

  const rows = [
    `Views: ${formatNumber(pageViews)}`,
    `Package Builder Starts: ${formatNumber(builderStarts)} (${formatPct(viewToBuilder)} of views)`,
    `Service Adds: ${formatNumber(serviceAdds)} • Add-On Adds: ${formatNumber(addOnAdds)}`,
    `Checkout Intents: ${formatNumber(checkoutIntents)} (${formatPct(builderToCheckout)} of builder starts)`,
    `Intent Route Mix: ${formatNumber(secureCheckoutIntents)} secure • ${formatNumber(proposalIntents)} proposal`,
    `Project Brief Sends: ${formatNumber(briefSends)}`,
  ];

  renderSimpleList('serviceFunnelList', rows, 'No service funnel activity tracked yet.', (row) => row);
}

function renderViewerSnapshot(events) {
  const list = document.getElementById('viewerSnapshot');
  if (!list) return;

  const viewerVisits = new Map();
  const deviceCounts = new Map();

  events
    .filter((event) => event.event === 'page_view')
    .forEach((event) => {
      const viewer = event.visitorId || 'unknown';
      viewerVisits.set(viewer, (viewerVisits.get(viewer) || 0) + 1);
      const device = event.device || 'unknown';
      deviceCounts.set(device, (deviceCounts.get(device) || 0) + 1);
    });

  const totalViews = [...viewerVisits.values()].reduce((sum, count) => sum + count, 0);
  const deviceSummary = [...deviceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([device, count]) => `${device}: ${formatPct((count / Math.max(totalViews, 1)) * 100)}`)
    .join(' | ');

  const topViewers = [...viewerVisits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([viewer, count]) => `${shortVisitorId(viewer)} (${count})`)
    .join(', ');

  list.innerHTML = '';
  const items = [
    `Tracked viewers: ${viewerVisits.size}`,
    `Device mix: ${deviceSummary || 'No data yet'}`,
    `Most active viewers: ${topViewers || 'No viewer IDs yet'}`,
  ];

  items.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  });
}

function renderRecentActivity(rows) {
  const container = document.getElementById('recentActivity');
  if (!container) return;

  container.innerHTML = '';
  if (!rows || rows.length === 0) {
    container.textContent = 'No events captured yet. Open your portfolio page and interact with media, filters, and contact links.';
    return;
  }

  rows.forEach((event) => {
    const row = document.createElement('div');
    row.className = 'analytics-row';

    const when = new Date(event.timestamp || Date.now());
    const info = [
      event.page || '',
      event.source_name || event.sourceName || '',
      event.utm_campaign || event.utmCampaign || '',
      event.label || event.target || '',
    ]
      .filter(Boolean)
      .join(' • ');

    row.innerHTML = `
      <p class="analytics-row-event">${event.event}</p>
      <p class="analytics-row-meta">${when.toLocaleString()} • ${info || 'General event'}</p>
    `;

    container.appendChild(row);
  });
}

function computeMetrics(events) {
  const pageViews = events.filter((event) => event.event === 'page_view');
  const clicks = events.filter((event) => event.event.endsWith('_click') || event.event === 'analytics_page_open');
  const engagementEvents = events.filter((event) => event.event === 'engagement_time');
  const uniqueVisitors = new Set(pageViews.map((event) => event.visitorId || 'unknown'));

  const avgSeconds = engagementEvents.length
    ? Math.round(engagementEvents.reduce((sum, event) => sum + (Number(event.seconds) || 0), 0) / engagementEvents.length)
    : 0;

  const returningVisitors = [...uniqueVisitors].filter((viewerId) => {
    const count = pageViews.filter((event) => (event.visitorId || 'unknown') === viewerId).length;
    return count > 1;
  }).length;

  const returningRate = uniqueVisitors.size > 0 ? (returningVisitors / uniqueVisitors.size) * 100 : 0;
  const ctr = pageViews.length > 0 ? (clicks.length / pageViews.length) * 100 : 0;

  const mediaProgress = events.filter((event) => event.event === 'media_progress').length;
  const mediaComplete = events.filter((event) => event.event === 'media_complete').length;
  const depthHits = events.filter((event) => event.event === 'scroll_depth').length;
  const engagementScore = Math.round((avgSeconds * 0.8) + (mediaProgress * 1.2) + (mediaComplete * 3) + (depthHits * 0.5));

  return {
    totalViews: pageViews.length,
    uniqueViewers: uniqueVisitors.size,
    totalClicks: clicks.length,
    ctr,
    avgSeconds,
    returningRate,
    engagementScore,
  };
}

function summarizeSourcesFromLocal(events) {
  const counts = new Map();
  events
    .filter((event) => event.event === 'page_view')
    .forEach((event) => {
      const source = event.sourceName || 'unknown';
      counts.set(source, (counts.get(source) || 0) + 1);
    });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([source, views]) => ({ source, views }));
}

function summarizeCampaignsFromLocal(events) {
  const rows = new Map();
  events.forEach((event) => {
    const campaign = event.utmCampaign || '(not set)';
    if (!rows.has(campaign)) rows.set(campaign, { campaign, views: 0, clicks: 0 });
    const entry = rows.get(campaign);
    if (event.event === 'page_view') entry.views += 1;
    if (event.event.endsWith('_click') || event.event === 'analytics_page_open') entry.clicks += 1;
  });

  return [...rows.values()].sort((a, b) => b.views - a.views).slice(0, 10);
}

async function fetchRemote(apiBase, ownerKey, days) {
  if (!apiBase || !ownerKey) return null;

  const summaryUrl = `${apiBase.replace(/\/$/, '')}/summary?days=${days}`;
  const recentUrl = `${apiBase.replace(/\/$/, '')}/recent?limit=${MAX_ROWS}`;
  const headers = { Authorization: `Bearer ${ownerKey}` };

  try {
    const [summaryRes, recentRes] = await Promise.all([
      fetch(summaryUrl, { headers }),
      fetch(recentUrl, { headers }),
    ]);

    if (!summaryRes.ok || !recentRes.ok) {
      return null;
    }

    const summary = await summaryRes.json();
    const recent = await recentRes.json();
    return { summary, recent };
  } catch (error) {
    return null;
  }
}

function buildDailyViewsMap(dayLabels, sourceRows) {
  const map = new Map(dayLabels.map((label) => [label, 0]));
  (sourceRows || []).forEach((row) => {
    if (row.day && map.has(row.day)) {
      map.set(row.day, Number(row.views) || 0);
    }
  });
  return map;
}

async function renderDashboard() {
  const root = document.getElementById('analyticsMain');
  const days = Number(root?.dataset.apiDays || DEFAULT_DAYS) || DEFAULT_DAYS;
  const apiBase = String(root?.dataset.apiBase || window.HARVEY_ANALYTICS_API_BASE || '').trim();
  const ownerKey = String(window.HARVEY_ANALYTICS_OWNER_KEY || sessionStorage.getItem('harveyAdminSessionToken') || '').trim();

  let events = readEvents();
  events = trackDashboardView(events);

  const localMetrics = computeMetrics(events);
  const dayLabels = getLastNDays(days);

  const remote = await fetchRemote(apiBase, ownerKey, days);

  const metrics = remote
    ? {
      totalViews: Number(remote.summary?.totals?.totalViews || 0),
      uniqueViewers: Number(remote.summary?.totals?.uniqueViewers || 0),
      totalClicks: Number(remote.summary?.totals?.totalClicks || 0),
      avgSeconds: Number(remote.summary?.totals?.avgEngagementSeconds || 0),
      returningRate: localMetrics.returningRate,
      ctr: Number(remote.summary?.totals?.totalViews || 0) > 0
        ? (Number(remote.summary?.totals?.totalClicks || 0) / Number(remote.summary?.totals?.totalViews || 1)) * 100
        : 0,
      engagementScore: localMetrics.engagementScore,
    }
    : localMetrics;

  const dailyViews = remote
    ? buildDailyViewsMap(dayLabels, remote.summary?.trend || [])
    : buildDailyViewsMap(
      dayLabels,
      events
        .filter((event) => event.event === 'page_view')
        .map((event) => ({ day: dayKey(event.timestamp || Date.now()), views: 1 }))
        .reduce((acc, row) => {
          const existing = acc.find((item) => item.day === row.day);
          if (existing) {
            existing.views += 1;
          } else {
            acc.push({ day: row.day, views: 1 });
          }
          return acc;
        }, [])
    );

  const viewsLastWindow = [...dailyViews.values()].reduce((sum, value) => sum + value, 0);

  setText('metricViews', formatNumber(metrics.totalViews));
  setText('metricVisitors', formatNumber(metrics.uniqueViewers));
  setText('metricClicks', formatNumber(metrics.totalClicks));
  setText('metricEngagement', formatNumber(metrics.engagementScore));
  setText('metricViewsTrend', `Last ${days} days: ${formatNumber(viewsLastWindow)}`);
  setText('metricVisitorTrend', `Returning rate: ${formatPct(metrics.returningRate)}`);
  setText('metricClickTrend', `CTR: ${formatPct(metrics.ctr)}`);
  setText('metricEngagementTrend', `Avg time: ${formatNumber(metrics.avgSeconds)}s`);
  setText('trendSummary', `${viewsLastWindow} views in the past ${days} days.`);

  renderTrendBars(dayLabels, dailyViews);
  renderTopClicks(events);
  renderViewerSnapshot(events);
  renderTopSources(remote?.summary?.sources || summarizeSourcesFromLocal(events));
  renderUtmCampaigns(remote?.summary?.campaigns || summarizeCampaignsFromLocal(events));
  renderServiceFunnel(events);

  const remoteRows = remote?.recent?.rows || [];
  const localRows = [...events].reverse().slice(0, MAX_ROWS);
  renderRecentActivity(remoteRows.length > 0 ? remoteRows : localRows);
}

function bindActions() {
  const clearButton = document.getElementById('clearAnalytics');
  if (!clearButton) return;

  clearButton.addEventListener('click', () => {
    const confirmed = window.confirm('Reset all local analytics data for this browser?');
    if (!confirmed) return;

    localStorage.removeItem(ANALYTICS_STORAGE_KEY);
    renderDashboard();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindActions();
});

window.addEventListener('harvey-analytics-unlocked', () => {
  renderDashboard();
});
