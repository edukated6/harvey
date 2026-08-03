const OWNER_UNLOCKED_KEY = 'harveyAnalyticsOwnerUnlocked';
const OWNER_API_KEY_STORAGE = 'harveyAnalyticsOwnerApiKey';

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashText(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}

function getMainRoot() {
  return document.getElementById('analyticsMain');
}

function getGateRoot() {
  return document.getElementById('analyticsGate');
}

function setMessage(message, isError = false) {
  const element = document.getElementById('gateMessage');
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? '#ffc7c7' : '';
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

async function attemptUnlock() {
  const main = getMainRoot();
  if (!main) return;

  const expectedHash = String(main.dataset.ownerHash || '').trim().toLowerCase();
  const passcodeInput = document.getElementById('ownerPasscode');
  const apiKeyInput = document.getElementById('ownerApiKey');

  if (!expectedHash || expectedHash.length !== 64) {
    setMessage('Owner hash is not configured. Update data-owner-hash in analytics.html.', true);
    return;
  }

  const passcode = String(passcodeInput?.value || '');
  if (!passcode) {
    setMessage('Enter your owner passcode to continue.', true);
    return;
  }

  const candidateHash = await hashText(passcode);
  if (candidateHash !== expectedHash) {
    setMessage('Invalid passcode.', true);
    return;
  }

  sessionStorage.setItem(OWNER_UNLOCKED_KEY, '1');

  const apiKey = String(apiKeyInput?.value || '').trim();
  if (apiKey) {
    sessionStorage.setItem(OWNER_API_KEY_STORAGE, apiKey);
    window.HARVEY_ANALYTICS_OWNER_KEY = apiKey;
  } else {
    const restored = sessionStorage.getItem(OWNER_API_KEY_STORAGE) || '';
    window.HARVEY_ANALYTICS_OWNER_KEY = restored;
  }

  setMessage('Authenticated. Loading analytics...');
  unlockDashboard();
}

function bindGateActions() {
  const unlockButton = document.getElementById('unlockAnalytics');
  const passcodeInput = document.getElementById('ownerPasscode');

  if (unlockButton) {
    unlockButton.addEventListener('click', () => {
      attemptUnlock().catch(() => {
        setMessage('Unable to verify credentials in this browser.', true);
      });
    });
  }

  if (passcodeInput) {
    passcodeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        attemptUnlock().catch(() => {
          setMessage('Unable to verify credentials in this browser.', true);
        });
      }
    });
  }
}

function bootstrapGate() {
  const unlocked = sessionStorage.getItem(OWNER_UNLOCKED_KEY) === '1';
  const restoredApiKey = sessionStorage.getItem(OWNER_API_KEY_STORAGE) || '';
  window.HARVEY_ANALYTICS_OWNER_KEY = restoredApiKey;

  if (unlocked) {
    unlockDashboard();
    return;
  }

  bindGateActions();
}

document.addEventListener('DOMContentLoaded', bootstrapGate);
