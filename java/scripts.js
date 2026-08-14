const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealElements = document.querySelectorAll('.reveal-up');
const videos = document.querySelectorAll('.media-frame video');
const roleFilters = document.querySelectorAll('.role-filter');
const mediaCards = document.querySelectorAll('.media-card');
const filterStatus = document.getElementById('filterStatus');
const serviceFilterButtons = document.querySelectorAll('.service-filter');
const serviceCards = document.querySelectorAll('.service-card');
const serviceFilterStatus = document.getElementById('serviceFilterStatus');
const serviceToggleButtons = document.querySelectorAll('.service-toggle');
const serviceVariantSelects = document.querySelectorAll('.service-variant-select');
const serviceQuantityInputs = document.querySelectorAll('.service-quantity-input');
const serviceQuantityButtons = document.querySelectorAll('.service-quantity-btn');
const addonToggleInputs = document.querySelectorAll('.addon-toggle');
const bookingSelectedList = document.getElementById('bookingSelectedList');
const bookingAddonsList = document.getElementById('bookingAddonsList');
const bookingTotal = document.getElementById('bookingTotal');
const bookingCheckout = document.getElementById('bookingCheckout');
const bookingSendBrief = document.getElementById('bookingSendBrief');
const checkoutModeHint = document.getElementById('checkoutModeHint');
const clearBookingBrief = document.getElementById('clearBookingBrief');
const briefProjectInput = document.getElementById('briefProject');
const briefTimelineInput = document.getElementById('briefTimeline');
const briefDetailsInput = document.getElementById('briefDetails');
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
const selectedServiceIds = new Set();
const selectedAddOnIds = new Set();
const checkoutLinksConfig = window.HARVEY_CHECKOUT_LINKS || {};
let packageBuilderStarted = false;

const timelineMultipliers = {
  standard: 1,
  priority: 1.2,
  rush: 1.4,
};

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

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
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

function applyServiceFilter(category) {
  let visibleCount = 0;

  serviceCards.forEach((card) => {
    const serviceCategory = card.dataset.serviceCategory || 'all';
    const shouldShow = category === 'all' || serviceCategory === category;
    card.classList.toggle('is-hidden', !shouldShow);
    if (shouldShow) visibleCount += 1;
  });

  if (serviceFilterStatus) {
    serviceFilterStatus.textContent = category === 'all'
      ? `Showing all services (${visibleCount})`
      : `Showing ${category} services (${visibleCount})`;
  }
}

function getTimelineMultiplier() {
  const timeline = briefTimelineInput?.value || 'standard';
  return timelineMultipliers[timeline] || 1;
}

function syncCardQuantityAvailability(card) {
  const select = card.querySelector('.service-variant-select');
  const selectedOption = select ? select.selectedOptions[0] : null;
  const quantityAllowed = selectedOption?.dataset.quantityAllowed !== 'false';
  const quantityLabel = card.querySelector('.service-quantity-label');
  const quantityControl = card.querySelector('.service-quantity-control');
  const quantityInput = card.querySelector('.service-quantity-input');
  const quantityButtons = card.querySelectorAll('.service-quantity-btn');

  if (quantityLabel) quantityLabel.hidden = !quantityAllowed;
  if (quantityControl) quantityControl.hidden = !quantityAllowed;

  if (quantityInput) {
    quantityInput.disabled = !quantityAllowed;
    if (!quantityAllowed) {
      quantityInput.value = '1';
    }
  }

  quantityButtons.forEach((button) => {
    button.disabled = !quantityAllowed;
  });
}

function getCardServiceSelection(card) {
  const select = card.querySelector('.service-variant-select');
  const quantityInput = card.querySelector('.service-quantity-input');
  const selectedOption = select ? select.selectedOptions[0] : null;
  const serviceId = card.dataset.serviceId || '';
  const serviceName = selectedOption?.dataset.variantName || card.dataset.serviceName || 'Service';
  const unitPrice = Number(selectedOption?.dataset.price || card.dataset.servicePrice || 0);
  const isQuantityAllowed = selectedOption?.dataset.quantityAllowed !== 'false';
  const quantity = isQuantityAllowed ? Number(quantityInput?.value || 1) : 1;
  const normalizedQuantity = isQuantityAllowed ? (Number.isFinite(quantity) && quantity > 0 ? quantity : 1) : 1;
  const lineTotal = unitPrice * normalizedQuantity;

  return {
    id: serviceId,
    name: serviceName,
    price: unitPrice,
    variant: selectedOption?.value || '',
    option: selectedOption?.value || '',
    quantity: normalizedQuantity,
    lineTotal,
  };
}

function collectSelectedServices() {
  const selectedServices = [];

  serviceCards.forEach((card) => {
    const service = getCardServiceSelection(card);
    if (!selectedServiceIds.has(service.id)) return;
    selectedServices.push(service);
  });

  return selectedServices;
}

function collectSelectedAddOns() {
  const selectedAddOns = [];

  addonToggleInputs.forEach((input) => {
    const addOnId = input.dataset.addonId || '';
    if (!selectedAddOnIds.has(addOnId)) return;
    selectedAddOns.push({
      id: addOnId,
      name: input.dataset.addonName || 'Add-on',
      price: Number(input.dataset.addonPrice || 0),
    });
  });

  return selectedAddOns;
}

function createBookingMailto(selectedServices, selectedAddOns, estimatedTotal) {
  const selectedText = selectedServices.length
    ? selectedServices.map((service) => {
        const quantityText = service.quantity > 1 ? ` x${service.quantity}` : '';
        const lineTotal = service.lineTotal || (service.price * (service.quantity || 1));
        return `- ${service.name}${quantityText} (${formatCurrency(lineTotal)})`;
      }).join('\n')
    : '- None selected yet';

  const addOnText = selectedAddOns.length
    ? selectedAddOns.map((addOn) => `- ${addOn.name} (${formatCurrency(addOn.price)})`).join('\n')
    : '- No add-ons selected';

  const projectName = (briefProjectInput?.value || 'Untitled project').trim();
  const timeline = briefTimelineInput?.value || 'standard';
  const details = (briefDetailsInput?.value || 'No additional details provided').trim();
  const total = formatCurrency(estimatedTotal);

  const subject = 'Service Booking Request - The Harvey Effect';
  const body = [
    'Hi Ahmaad,',
    '',
    'I want to book your services. Here is my project brief:',
    '',
    `Project Name: ${projectName}`,
    `Timeline: ${timeline}`,
    '',
    'Selected Services:',
    selectedText,
    '',
    'Selected Add-Ons:',
    addOnText,
    '',
    `Estimated Starting Total: ${total}`,
    '',
    `Project Notes: ${details}`,
  ].join('\n');

  return `mailto:ahmaadharvey@pm.me?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function createCheckoutBundleKey(serviceIds) {
  return [...serviceIds].sort().join('+');
}

function getCheckoutLink(selectedServices) {
  if (!selectedServices.length) return '';

  const bundleKey = createCheckoutBundleKey(selectedServices.map((service) => service.id));
  const servicesMap = checkoutLinksConfig.services || {};
  const bundlesMap = checkoutLinksConfig.bundles || {};

  let link = bundlesMap[bundleKey] || '';
  if (!link && selectedServices.length === 1) {
    link = servicesMap[selectedServices[0].id] || '';
  }
  if (!link) {
    link = checkoutLinksConfig.default || '';
  }

  const trimmed = String(link || '').trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

function markPackageBuilderStart() {
  if (packageBuilderStarted) return;
  packageBuilderStarted = true;
  trackEvent('service_builder_start');
}

function renderBookingList(targetList, rows, emptyLabel) {
  if (!targetList) return;
  targetList.innerHTML = '';

  if (!rows.length) {
    const emptyState = document.createElement('li');
    emptyState.textContent = emptyLabel;
    targetList.appendChild(emptyState);
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement('li');
    const quantity = Number(row.quantity || 1);
    const lineTotal = Number(row.lineTotal || (row.price * quantity));
    const quantityText = quantity > 1 ? ` x${quantity}` : '';
    item.textContent = `${row.name}${quantityText} - ${formatCurrency(lineTotal)}`;
    targetList.appendChild(item);
  });
}

function updateCheckoutActions(selectedServices, selectedAddOns, estimatedTotal) {
  const mailtoHref = createBookingMailto(selectedServices, selectedAddOns, estimatedTotal);
  const checkoutLink = getCheckoutLink(selectedServices);

  if (bookingSendBrief) {
    bookingSendBrief.setAttribute('href', mailtoHref);
  }

  if (!bookingCheckout) return;

  const checkoutApiBase = (window.HARVEY_CHECKOUT_API_BASE || window.HARVEY_ANALYTICS_API_BASE || '').replace(/\/$/, '');
  const isServerCheckoutEnabled = Boolean(checkoutApiBase);

  if (checkoutLink && !isServerCheckoutEnabled) {
    bookingCheckout.setAttribute('href', checkoutLink);
    bookingCheckout.setAttribute('target', '_blank');
    bookingCheckout.setAttribute('rel', 'noopener noreferrer');
    bookingCheckout.textContent = 'Continue to Secure Checkout';
    if (checkoutModeHint) {
      checkoutModeHint.textContent = 'Checkout mode: Live secure payment link enabled';
    }
  } else {
    bookingCheckout.setAttribute('href', mailtoHref);
    bookingCheckout.removeAttribute('target');
    bookingCheckout.removeAttribute('rel');
    bookingCheckout.textContent = isServerCheckoutEnabled ? 'Continue to Secure Checkout' : 'Start Checkout Request';
    if (checkoutModeHint) {
      checkoutModeHint.textContent = isServerCheckoutEnabled
        ? 'Checkout mode: Dynamic Stripe secure session'
        : 'Checkout mode: Custom proposal request';
    }
  }
}

function updateBookingSummary() {
  const selectedServices = collectSelectedServices();
  const selectedAddOns = collectSelectedAddOns();
  const baseServicesTotal = selectedServices.reduce((sum, service) => sum + (service.lineTotal || (service.price * (service.quantity || 1))), 0);
  const addOnsTotal = selectedAddOns.reduce((sum, addOn) => sum + addOn.price, 0);
  const estimatedTotal = Math.round((baseServicesTotal + addOnsTotal) * getTimelineMultiplier());

  renderBookingList(bookingSelectedList, selectedServices, 'No services selected yet');
  renderBookingList(bookingAddonsList, selectedAddOns, 'No add-ons selected');

  if (bookingTotal) {
    bookingTotal.textContent = formatCurrency(estimatedTotal);
  }

  updateCheckoutActions(selectedServices, selectedAddOns, estimatedTotal);
}

serviceFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.serviceFilter || 'all';

    serviceFilterButtons.forEach((item) => {
      item.classList.remove('is-active');
      item.setAttribute('aria-pressed', 'false');
    });

    button.classList.add('is-active');
    button.setAttribute('aria-pressed', 'true');
    applyServiceFilter(filter);
    trackEvent('service_filter_click', { category: filter });
  });
});

serviceToggleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const serviceId = button.dataset.serviceToggle || '';
    const card = button.closest('.service-card');
    const serviceSelection = card ? getCardServiceSelection(card) : null;
    const serviceName = serviceSelection?.name || card?.dataset.serviceName || serviceId;

    if (!serviceId || !card) return;

    const isSelected = selectedServiceIds.has(serviceId);
    if (isSelected) {
      selectedServiceIds.delete(serviceId);
      button.textContent = 'Add to Package';
      button.classList.remove('is-selected');
      button.setAttribute('aria-pressed', 'false');
      card.classList.remove('is-selected');
    } else {
      selectedServiceIds.add(serviceId);
      button.textContent = 'Added to Package';
      button.classList.add('is-selected');
      button.setAttribute('aria-pressed', 'true');
      card.classList.add('is-selected');
    }

    updateBookingSummary();
    if (selectedServiceIds.size > 0) {
      markPackageBuilderStart();
    }
    trackEvent('service_toggle_click', {
      serviceId,
      serviceName,
      selected: !isSelected,
      price: serviceSelection?.price || Number(card.dataset.servicePrice || 0),
    });
  });
});

serviceVariantSelects.forEach((select) => {
  select.addEventListener('change', () => {
    const card = select.closest('.service-card');
    if (!card) return;

    syncCardQuantityAvailability(card);
    updateBookingSummary();

    if (selectedServiceIds.has(card.dataset.serviceId || '')) {
      const selectedVariant = getCardServiceSelection(card);
      trackEvent('service_variant_change', {
        serviceId: card.dataset.serviceId || '',
        serviceName: selectedVariant.name,
        price: selectedVariant.price,
      });
    }
  });
});

serviceCards.forEach((card) => {
  syncCardQuantityAvailability(card);
});

function normalizeServiceQuantity(value) {
  const numericValue = Number(value || 1);
  if (!Number.isFinite(numericValue)) return 1;
  return Math.min(10, Math.max(1, Math.round(numericValue)));
}

serviceQuantityInputs.forEach((input) => {
  input.addEventListener('input', () => {
    const card = input.closest('.service-card');
    const safeValue = normalizeServiceQuantity(input.value);
    input.value = String(safeValue);

    if (card && selectedServiceIds.has(card.dataset.serviceId || '')) {
      updateBookingSummary();
      trackEvent('service_quantity_change', {
        serviceId: card.dataset.serviceId || '',
        quantity: safeValue,
      });
    }
  });
});

serviceQuantityButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const input = button.parentElement?.querySelector('.service-quantity-input');
    if (!input) return;

    const action = button.dataset.quantityAction || 'increase';
    const change = action === 'decrease' ? -1 : 1;
    const nextValue = normalizeServiceQuantity(Number(input.value || 1) + change);
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
});

addonToggleInputs.forEach((input) => {
  input.addEventListener('change', () => {
    const addOnId = input.dataset.addonId || '';
    const addOnName = input.dataset.addonName || addOnId;
    const selected = input.checked;

    if (!addOnId) return;

    if (selected) {
      selectedAddOnIds.add(addOnId);
      markPackageBuilderStart();
    } else {
      selectedAddOnIds.delete(addOnId);
    }

    updateBookingSummary();
    trackEvent('addon_toggle_click', {
      addOnId,
      addOnName,
      selected,
    });
  });
});

[briefProjectInput, briefTimelineInput, briefDetailsInput].forEach((field) => {
  if (!field) return;
  field.addEventListener('input', () => {
    if ((briefProjectInput?.value || '').trim() || (briefDetailsInput?.value || '').trim()) {
      markPackageBuilderStart();
    }
    updateBookingSummary();
  });
});

if (briefTimelineInput) {
  briefTimelineInput.addEventListener('change', () => {
    updateBookingSummary();
    trackEvent('booking_timeline_change', { timeline: briefTimelineInput.value || 'standard' });
  });
}

if (clearBookingBrief) {
  clearBookingBrief.addEventListener('click', () => {
    selectedServiceIds.clear();
    selectedAddOnIds.clear();

    serviceToggleButtons.forEach((button) => {
      button.textContent = 'Add to Package';
      button.classList.remove('is-selected');
      button.setAttribute('aria-pressed', 'false');
    });

    serviceCards.forEach((card) => {
      card.classList.remove('is-selected');
    });

    addonToggleInputs.forEach((input) => {
      input.checked = false;
    });

    if (briefProjectInput) briefProjectInput.value = '';
    if (briefTimelineInput) briefTimelineInput.value = 'standard';
    if (briefDetailsInput) briefDetailsInput.value = '';
    packageBuilderStarted = false;

    updateBookingSummary();
    trackEvent('booking_brief_clear');
  });
}

if (bookingCheckout) {
  bookingCheckout.addEventListener('click', async (event) => {
    const selectedServices = collectSelectedServices();
    const selectedAddOns = collectSelectedAddOns();
    const checkoutLink = getCheckoutLink(selectedServices);
    const checkoutApiBase = (window.HARVEY_CHECKOUT_API_BASE || window.HARVEY_ANALYTICS_API_BASE || '').replace(/\/$/, '');
    const route = checkoutLink && !checkoutApiBase ? 'secure_checkout' : 'proposal_request';
    const estimatedTotal = Number((bookingTotal?.textContent || '').replace(/[^\d]/g, '')) || 0;

    trackEvent('service_checkout_intent', {
      route,
      selectedServices: selectedServices.length,
      selectedAddOns: selectedAddOns.length,
      estimatedTotal,
    });

    if (!checkoutApiBase || !selectedServices.length) {
      return;
    }

    event.preventDefault();

    try {
      const response = await fetch(`${checkoutApiBase}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedServices,
          selectedAddOns,
          projectName: briefProjectInput?.value || '',
          timeline: briefTimelineInput?.value || 'standard',
          details: briefDetailsInput?.value || '',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
        return;
      }
    } catch (error) {
      // Fall back to mailto request if server checkout is unavailable.
    }

    const mailtoHref = createBookingMailto(selectedServices, selectedAddOns, estimatedTotal);
    window.location.href = mailtoHref;
  });
}

if (bookingSendBrief) {
  bookingSendBrief.addEventListener('click', () => {
    const selectedServices = collectSelectedServices();
    const selectedAddOns = collectSelectedAddOns();
    trackEvent('service_brief_send_click', {
      selectedServices: selectedServices.length,
      selectedAddOns: selectedAddOns.length,
    });
  });
}

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
applyServiceFilter('all');

const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

const navLinkElements = document.querySelectorAll('.nav-links a[data-nav-link]');
const navSpySections = Array.from(navLinkElements)
  .filter((link) => (link.getAttribute('href') || '').startsWith('#'))
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

if ('IntersectionObserver' in window && navSpySections.length) {
  const navSpyObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const activeId = `#${entry.target.id}`;
        navLinkElements.forEach((link) => {
          link.classList.toggle('is-active', link.getAttribute('href') === activeId);
        });
      });
    },
    { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
  );

  navSpySections.forEach((section) => navSpyObserver.observe(section));
}

const blogGrid = document.getElementById('blogGrid');
const blogEmptyState = document.getElementById('blogEmptyState');
const blogFiltersContainer = document.getElementById('blogFilters');
const blogApiBase = (window.HARVEY_ANALYTICS_API_BASE || '').replace(/\/$/, '');
let allBlogPosts = [];

function formatBlogDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function renderBlogPosts(posts) {
  if (!blogGrid) return;

  if (!posts.length) {
    blogGrid.innerHTML = '<p class="blog-empty">New posts are on the way. Check back soon for production insights and behind-the-scenes breakdowns.</p>';
    return;
  }

  blogGrid.innerHTML = '';
  posts.forEach((post) => {
    const card = document.createElement('a');
    card.className = 'blog-card reveal-up is-visible';
    card.href = `./blog-post.html?slug=${encodeURIComponent(post.slug)}`;
    card.dataset.category = (post.category || '').toLowerCase();
    card.setAttribute('data-analytics', 'blog_post_click');
    card.setAttribute('data-analytics-label', post.title);

    const coverHtml = post.coverImage
      ? `<div class="blog-card-cover"><img src="${escapeHtml(post.coverImage)}" alt="" loading="lazy" decoding="async"></div>`
      : '';

    card.innerHTML = `
      ${coverHtml}
      <div class="blog-card-body">
        <p class="blog-card-kicker">${escapeHtml(post.category || 'Insight')}</p>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.excerpt || '')}</p>
        <p class="blog-card-meta">${formatBlogDate(post.publishedAt)}</p>
      </div>
    `;
    blogGrid.appendChild(card);
  });
}

function applyBlogFilter(category) {
  const filtered = category === 'all'
    ? allBlogPosts
    : allBlogPosts.filter((post) => (post.category || '').toLowerCase() === category);
  renderBlogPosts(filtered);
}

function renderBlogFilters(posts) {
  if (!blogFiltersContainer) return;
  const categories = Array.from(new Set(posts.map((post) => post.category).filter(Boolean)));
  if (!categories.length) {
    blogFiltersContainer.hidden = true;
    return;
  }

  blogFiltersContainer.hidden = false;
  blogFiltersContainer.innerHTML = '';

  const buildButton = (label, value, isActive) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `role-filter${isActive ? ' is-active' : ''}`;
    button.textContent = label;
    button.dataset.category = value;
    button.setAttribute('aria-pressed', String(isActive));
    button.addEventListener('click', () => {
      blogFiltersContainer.querySelectorAll('.role-filter').forEach((btn) => {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('is-active');
      button.setAttribute('aria-pressed', 'true');
      applyBlogFilter(value);
    });
    return button;
  };

  blogFiltersContainer.appendChild(buildButton('All Posts', 'all', true));
  categories.forEach((category) => {
    blogFiltersContainer.appendChild(buildButton(category, category.toLowerCase(), false));
  });
}

async function loadBlogPosts() {
  if (!blogGrid) return;

  const limit = Number(blogGrid.dataset.limit) || 6;

  if (!blogApiBase) {
    renderBlogPosts([]);
    return;
  }

  try {
    const response = await fetch(`${blogApiBase}/posts?limit=${limit}`);
    if (!response.ok) throw new Error('Unable to load posts');
    const data = await response.json();
    allBlogPosts = Array.isArray(data.posts) ? data.posts : [];
    renderBlogFilters(allBlogPosts);
    renderBlogPosts(allBlogPosts);
  } catch (error) {
    if (blogEmptyState) {
      blogEmptyState.textContent = 'New posts are on the way. Check back soon for production insights and behind-the-scenes breakdowns.';
    }
  }
}

loadBlogPosts();

const recentCommentsList = document.getElementById('recentCommentsList');

function formatRecentCommentDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderRecentComments(comments) {
  if (!recentCommentsList) return;

  if (!comments.length) {
    recentCommentsList.innerHTML = '<li class="recent-comments-empty">No comments yet. Be the first to join the conversation.</li>';
    return;
  }

  recentCommentsList.innerHTML = '';
  comments.forEach((comment) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'recent-comment-item';
    link.href = `./blog-post.html?slug=${encodeURIComponent(comment.postSlug)}#comments`;

    link.innerHTML = `
      <p class="recent-comment-author">${escapeHtml(comment.authorName)}</p>
      <p class="recent-comment-body">${escapeHtml(comment.body)}</p>
      <p class="recent-comment-meta">on ${escapeHtml(comment.postTitle)} &middot; ${formatRecentCommentDate(comment.createdAt)}</p>
    `;

    item.appendChild(link);
    recentCommentsList.appendChild(item);
  });
}

async function loadRecentComments() {
  if (!recentCommentsList || !blogApiBase) return;

  try {
    const response = await fetch(`${blogApiBase}/comments/recent?limit=6`);
    if (!response.ok) throw new Error('Unable to load recent comments');
    const data = await response.json();
    renderRecentComments(Array.isArray(data.comments) ? data.comments : []);
  } catch (error) {
    // Leave the default empty-state message in place.
  }
}

loadRecentComments();
updateBookingSummary();
recalculateFadeDistance();
syncTopHeroState();
trackPageView();
