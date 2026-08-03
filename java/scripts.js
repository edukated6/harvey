const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealElements = document.querySelectorAll('.reveal-up');
const videos = document.querySelectorAll('.media-frame video');
const roleFilters = document.querySelectorAll('.role-filter');
const mediaCards = document.querySelectorAll('.media-card');
const filterStatus = document.getElementById('filterStatus');
const openReelButton = document.getElementById('openReel');
const closeReelButton = document.getElementById('closeReel');
const reelModal = document.getElementById('reelModal');
const reelVideo = document.getElementById('reelVideo');
const heroVideo = document.querySelector('.hero-bg');
const quickviewStage = document.querySelector('.quickview-stage');
const heroSection = document.querySelector('.hero');
const mobilePortraitQuery = window.matchMedia('(max-width: 960px), (hover: none) and (pointer: coarse)');
const ANALYTICS_STORAGE_KEY = 'harveyAnalyticsEvents';
const ANALYTICS_VISITOR_KEY = 'harveyAnalyticsVisitor';
const ANALYTICS_SESSION_KEY = 'harveyAnalyticsSession';
const MAX_STORED_ANALYTICS_EVENTS = 600;
const shouldDebugAnalytics = window.location.hostname === 'localhost' || window.location.search.includes('debugAnalytics=1');
const prefersDataSaver = navigator.connection?.saveData === true;
const analyticsEndpoint = window.HARVEY_ANALYTICS_ENDPOINT || '';
const scrollMilestones = [25, 50, 75, 100];
const recordedMilestones = new Set();
const pageVisitStartedAt = Date.now();
const visitorId = getOrCreateStorageId(localStorage, ANALYTICS_VISITOR_KEY, 'visitor');
const sessionId = getOrCreateStorageId(sessionStorage, ANALYTICS_SESSION_KEY, 'session');
const trafficContext = getTrafficContext();

let fadeDistanceCache = Math.max(window.innerHeight * 0.72, 420);
let lastPortraitOpacity = '';
let rafScheduled = false;
let activePreviewVideo = null;

function getOrCreateStorageId(storage, key, label) {
  try {
    const existingId = storage.getItem(key);
    if (existingId) return existingId;

    const randomPart = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const nextId = `${label}_${randomPart}`;
    storage.setItem(key, nextId);
    return nextId;
  } catch (error) {
    return `${label}_unavailable`;
  }
}

function getDeviceType() {
  const width = window.innerWidth;
  if (width <= 768) return 'mobile';
  if (width <= 1100) return 'tablet';
  return 'desktop';
}

function readAnalyticsEvents() {
  try {
    return JSON.parse(localStorage.getItem(ANALYTICS_STORAGE_KEY) || '[]');
  } catch (error) {
    return [];
  }
}

function sanitizeQueryValue(value) {
  return (value || '').trim().slice(0, 160);
}

function detectSourceType(sourceName) {
  if (!sourceName || sourceName === 'direct') return 'direct';
  const normalized = sourceName.toLowerCase();
  const socialHosts = ['instagram', 'facebook', 'linkedin', 'tiktok', 'x.com', 'twitter', 'youtube'];
  const searchHosts = ['google', 'bing', 'duckduckgo', 'yahoo'];

  if (socialHosts.some((host) => normalized.includes(host))) return 'social';
  if (searchHosts.some((host) => normalized.includes(host))) return 'search';
  return 'referral';
}

function getTrafficContext() {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  const utmSource = sanitizeQueryValue(params.get('utm_source'));
  const utmMedium = sanitizeQueryValue(params.get('utm_medium'));
  const utmCampaign = sanitizeQueryValue(params.get('utm_campaign'));
  const utmContent = sanitizeQueryValue(params.get('utm_content'));
  const utmTerm = sanitizeQueryValue(params.get('utm_term'));

  let sourceName = 'direct';
  if (utmSource) {
    sourceName = utmSource;
  } else if (document.referrer) {
    try {
      sourceName = new URL(document.referrer).hostname.replace(/^www\./, '');
    } catch (error) {
      sourceName = 'referral';
    }
  }

  return {
    sourceType: detectSourceType(sourceName),
    sourceName,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
  };
}

function writeAnalyticsEvents(events) {
  try {
    localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(events.slice(-MAX_STORED_ANALYTICS_EVENTS)));
  } catch (error) {
    // Ignore storage issues in private mode.
  }
}

function isMobilePortraitDisabled() {
  return mobilePortraitQuery.matches;
}

function recalculateFadeDistance() {
  fadeDistanceCache = heroSection
    ? Math.max(heroSection.offsetHeight * 0.72, 420)
    : Math.max(window.innerHeight * 0.72, 420);
}

function setPortraitOpacity(value) {
  const nextValue = String(value);
  if (!quickviewStage || nextValue === lastPortraitOpacity) return;
  quickviewStage.style.setProperty('--portrait-scroll-opacity', nextValue);
  lastPortraitOpacity = nextValue;
}

function trackEvent(eventName, payload = {}) {
  const eventPayload = {
    event: eventName,
    timestamp: new Date().toISOString(),
    visitorId,
    sessionId,
    page: window.location.pathname,
    pageTitle: document.title,
    device: getDeviceType(),
    sourceType: trafficContext.sourceType,
    sourceName: trafficContext.sourceName,
    utmSource: trafficContext.utmSource,
    utmMedium: trafficContext.utmMedium,
    utmCampaign: trafficContext.utmCampaign,
    utmContent: trafficContext.utmContent,
    utmTerm: trafficContext.utmTerm,
    ...payload,
  };

  if (window.dataLayer && typeof window.dataLayer.push === 'function') {
    window.dataLayer.push(eventPayload);
  }

  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, payload);
  }

  const existing = readAnalyticsEvents();
  existing.push(eventPayload);
  writeAnalyticsEvents(existing);

  if (analyticsEndpoint) {
    try {
      const body = JSON.stringify(eventPayload);
      if (typeof navigator.sendBeacon === 'function') {
        const beaconBlob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(analyticsEndpoint, beaconBlob);
      } else {
        fetch(analyticsEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch (error) {
      // Ignore network/reporting errors to avoid UI disruptions.
    }
  }

  if (shouldDebugAnalytics) {
    console.info('analytics:event', eventPayload);
  }
}

function trackPageView() {
  trackEvent('page_view', {
    referrer: document.referrer || 'direct',
    query: window.location.search || '',
    sourceType: trafficContext.sourceType,
    sourceName: trafficContext.sourceName,
    utmSource: trafficContext.utmSource,
    utmMedium: trafficContext.utmMedium,
    utmCampaign: trafficContext.utmCampaign,
    utmContent: trafficContext.utmContent,
    utmTerm: trafficContext.utmTerm,
  });
}

function trackScrollDepthMilestones() {
  const totalScrollable = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  const scrolled = Math.max(window.scrollY, 0);
  const depth = Math.round((scrolled / totalScrollable) * 100);

  scrollMilestones.forEach((milestone) => {
    if (depth >= milestone && !recordedMilestones.has(milestone)) {
      recordedMilestones.add(milestone);
      trackEvent('scroll_depth', { milestone });
    }
  });
}

function trackPageEngagement(reason = 'exit') {
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - pageVisitStartedAt) / 1000));
  trackEvent('engagement_time', {
    reason,
    seconds: elapsedSeconds,
  });
}

function restartTopPortraitAnimation() {
  if (!quickviewStage || prefersReducedMotion || isMobilePortraitDisabled()) return;
  quickviewStage.classList.remove('animate-portrait');
  void quickviewStage.offsetWidth;
  quickviewStage.classList.add('animate-portrait');
}

let portraitPrimed = false;

function syncPortraitScrollFade() {
  if (!quickviewStage) return;

  if (isMobilePortraitDisabled()) {
    setPortraitOpacity('0');
    return;
  }

  const stageRect = quickviewStage.getBoundingClientRect();
  const stageOffscreen = stageRect.bottom <= 0 || stageRect.top >= window.innerHeight;
  if (stageOffscreen) {
    setPortraitOpacity('0');
    return;
  }

  const progress = Math.min(Math.max(window.scrollY / fadeDistanceCache, 0), 1);
  const opacity = 1 - progress;
  setPortraitOpacity(opacity.toFixed(3));
}

function syncTopHeroState() {
  if (isMobilePortraitDisabled()) {
    quickviewStage?.classList.remove('animate-portrait');
    setPortraitOpacity('0');
    return;
  }

  const atTop = window.scrollY <= 48;

  if (atTop && !portraitPrimed) {
    restartTopPortraitAnimation();
    portraitPrimed = true;
  }

  syncPortraitScrollFade();
}

function requestSyncTopHeroState() {
  if (rafScheduled) return;
  rafScheduled = true;
  window.requestAnimationFrame(() => {
    rafScheduled = false;
    syncTopHeroState();
  });
}

function pauseAllPreviewVideosExcept(exceptVideo = null) {
  videos.forEach((video) => {
    if (video !== exceptVideo && !video.paused) {
      video.pause();
    }
  });
}

if (!prefersReducedMotion && 'IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add('is-visible'));
}

if ('IntersectionObserver' in window) {
  const mediaObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting && !prefersReducedMotion && !prefersDataSaver) {
          if (activePreviewVideo && activePreviewVideo !== video) {
            activePreviewVideo.pause();
          }
          pauseAllPreviewVideosExcept(video);
          activePreviewVideo = video;
          video.play().catch(() => {});
        } else {
          if (activePreviewVideo === video) {
            activePreviewVideo = null;
          }

          if (!video.paused) {
            video.pause();
          }
        }
      });
    },
    { threshold: 0.6 }
  );

  videos.forEach((video) => {
    video.muted = true;
    video.preload = 'none';
    mediaObserver.observe(video);

    video.addEventListener('play', () => {
      trackEvent('media_play', {
        title: video.closest('.media-card')?.querySelector('h3')?.textContent || 'Unknown media',
      });
    });

    video.addEventListener('timeupdate', () => {
      if (!video.duration || Number.isNaN(video.duration)) return;
      const title = video.closest('.media-card')?.querySelector('h3')?.textContent || 'Unknown media';
      const progress = Math.floor((video.currentTime / video.duration) * 100);

      [25, 50, 75].forEach((mark) => {
        const markerKey = `tracked${mark}`;
        if (progress >= mark && !video.dataset[markerKey]) {
          video.dataset[markerKey] = '1';
          trackEvent('media_progress', { title, progress: mark });
        }
      });
    });

    video.addEventListener('ended', () => {
      const title = video.closest('.media-card')?.querySelector('h3')?.textContent || 'Unknown media';
      trackEvent('media_complete', { title });
    });
  });
}

function applyRoleFilter(role) {
  let visibleCount = 0;

  mediaCards.forEach((card) => {
    const roles = (card.dataset.roles || '').split(' ').filter(Boolean);
    const shouldShow = role === 'all' || roles.includes(role);
    card.classList.toggle('is-hidden', !shouldShow);
    if (!shouldShow) {
      const cardVideo = card.querySelector('video');
      if (cardVideo && !cardVideo.paused) {
        cardVideo.pause();
      }
      if (activePreviewVideo === cardVideo) {
        activePreviewVideo = null;
      }
    }
    if (shouldShow) visibleCount += 1;
  });

  if (filterStatus) {
    filterStatus.textContent = role === 'all'
      ? `Showing all projects (${visibleCount})`
      : `Showing ${role} projects (${visibleCount})`;
  }
}

roleFilters.forEach((button) => {
  button.addEventListener('click', () => {
    const selectedRole = button.dataset.role || 'all';

    roleFilters.forEach((item) => {
      item.classList.remove('is-active');
      item.setAttribute('aria-pressed', 'false');
    });

    button.classList.add('is-active');
    button.setAttribute('aria-pressed', 'true');
    applyRoleFilter(selectedRole);

    trackEvent('role_filter_click', { role: selectedRole });
  });
});

function openReelModal() {
  if (!reelModal) return;
  reelModal.classList.add('is-open');
  reelModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  if (reelVideo) {
    reelVideo.defaultMuted = false;
    reelVideo.muted = false;
    reelVideo.volume = 1;
    reelVideo.currentTime = 0;
    reelVideo.play().catch(() => {});
  }
  trackEvent('reel_modal_open');
}

function closeReelModal() {
  if (!reelModal) return;
  reelModal.classList.remove('is-open');
  reelModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (reelVideo) reelVideo.pause();
  trackEvent('reel_modal_close');
}

if (openReelButton) {
  openReelButton.addEventListener('click', openReelModal);
}

if (closeReelButton) {
  closeReelButton.addEventListener('click', closeReelModal);
}

if (reelModal) {
  reelModal.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeModal === 'true') {
      closeReelModal();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && reelModal?.classList.contains('is-open')) {
    closeReelModal();
  }
});

window.addEventListener('scroll', () => {
  requestSyncTopHeroState();
  trackScrollDepthMilestones();
}, { passive: true });
window.addEventListener('load', () => {
  recalculateFadeDistance();
  syncTopHeroState();
  trackScrollDepthMilestones();
});
window.addEventListener('resize', () => {
  recalculateFadeDistance();
  requestSyncTopHeroState();
});

mobilePortraitQuery.addEventListener('change', () => {
  recalculateFadeDistance();
  syncTopHeroState();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    pauseAllPreviewVideosExcept(null);
    activePreviewVideo = null;
    heroVideo?.pause();
    reelVideo?.pause();
    trackPageEngagement('hidden');
  } else if (!prefersReducedMotion && !prefersDataSaver && heroVideo && heroVideo.paused) {
    heroVideo.play().catch(() => {});
  }
});

window.addEventListener('pagehide', () => {
  trackPageEngagement('pagehide');
});

if (prefersDataSaver) {
  heroVideo?.pause();
}

document.querySelectorAll('a[href^="mailto:"], a[href*="linkedin.com"], a[data-cta="resume"]').forEach((link) => {
  link.addEventListener('click', () => {
    const href = link.getAttribute('href') || '';
    trackEvent('contact_click', {
      type: href.startsWith('mailto:') ? 'email' : (link.dataset.cta === 'resume' ? 'resume' : 'linkedin'),
      target: href,
    });
  });
});

document.querySelectorAll('[data-analytics]').forEach((element) => {
  element.addEventListener('click', () => {
    const eventName = element.getAttribute('data-analytics') || 'custom_click';
    const eventLabel = element.getAttribute('data-analytics-label') || element.textContent?.trim() || 'Unknown';
    trackEvent(eventName, { label: eventLabel });
  });
});

applyRoleFilter('all');
recalculateFadeDistance();
syncTopHeroState();
trackPageView();
