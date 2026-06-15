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
const MAX_STORED_ANALYTICS_EVENTS = 100;
const shouldDebugAnalytics = window.location.hostname === 'localhost' || window.location.search.includes('debugAnalytics=1');
const prefersDataSaver = navigator.connection?.saveData === true;

let fadeDistanceCache = Math.max(window.innerHeight * 0.72, 420);
let lastPortraitOpacity = '';
let rafScheduled = false;
let activePreviewVideo = null;

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
    ...payload,
  };

  if (window.dataLayer && typeof window.dataLayer.push === 'function') {
    window.dataLayer.push(eventPayload);
  }

  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, payload);
  }

  try {
    const existing = JSON.parse(sessionStorage.getItem('harveyAnalytics') || '[]');
    existing.push(eventPayload);
    const bounded = existing.slice(-MAX_STORED_ANALYTICS_EVENTS);
    sessionStorage.setItem('harveyAnalytics', JSON.stringify(bounded));
  } catch (error) {
    // Ignore storage issues in private mode.
  }

  if (shouldDebugAnalytics) {
    console.info('analytics:event', eventPayload);
  }
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

window.addEventListener('scroll', requestSyncTopHeroState, { passive: true });
window.addEventListener('load', () => {
  recalculateFadeDistance();
  syncTopHeroState();
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
  } else if (!prefersReducedMotion && !prefersDataSaver && heroVideo && heroVideo.paused) {
    heroVideo.play().catch(() => {});
  }
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

applyRoleFilter('all');
recalculateFadeDistance();
syncTopHeroState();
