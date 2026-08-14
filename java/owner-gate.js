const OWNER_UNLOCKED_KEY = 'harveyAnalyticsOwnerUnlocked';
const OWNER_SESSION_STORAGE = 'harveyAdminSessionToken';

function getMainRoot() {
  return document.getElementById('analyticsMain');
}

function getGateRoot() {
  return document.getElementById('analyticsGate');
}

function unlockDashboard() {
  const main = getMainRoot();
  const gate = getGateRoot();

  if (main) {
    main.hidden = false;
  }

  if (gate) {
    gate.hidden = true;
  }

  window.dispatchEvent(new CustomEvent('harvey-analytics-unlocked'));
}

function bootstrapGate() {
  const unlocked = sessionStorage.getItem(OWNER_UNLOCKED_KEY) === '1';
  window.HARVEY_ANALYTICS_OWNER_KEY = sessionStorage.getItem(OWNER_SESSION_STORAGE) || '';

  if (unlocked) {
    unlockDashboard();
    return;
  }

  // Analytics and admin are only reachable through the shared login page.
  const redirectTarget = (window.location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
  window.location.replace(`./login?redirect=${encodeURIComponent(redirectTarget)}`);
}

document.addEventListener('DOMContentLoaded', bootstrapGate);
