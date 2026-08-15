const LOGIN_UNLOCKED_KEY = 'harveyAnalyticsOwnerUnlocked';
const LOGIN_SESSION_STORAGE = 'harveyAdminSessionToken';
const ALLOWED_REDIRECT_PAGES = ['analytics', 'admin'];

function getRedirectTarget() {
  const requested = new URLSearchParams(window.location.search).get('redirect') || '';
  return ALLOWED_REDIRECT_PAGES.includes(requested) ? requested : '';
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getGateSection() {
  return document.getElementById('loginGateSection');
}

function setLoginMessage(message, isError = false) {
  const element = document.getElementById('loginMessage');
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? '#ffc7c7' : '';
}

async function attemptLogin() {
  const gate = getGateSection();
  if (!gate) return;

  const usernameInput = document.getElementById('loginUsername');
  const passcodeInput = document.getElementById('loginPasscode');
  const username = String(usernameInput?.value || '');
  const passcode = String(passcodeInput?.value || '');
  if (!username || !passcode) {
    setLoginMessage('Enter your username and passcode to continue.', true);
    return;
  }

  const apiBase = (window.HARVEY_ANALYTICS_API_BASE || 'https://harvey-analytics-api.harvey-analytics-worker.workers.dev').replace(/\/$/, '');
  let response;
  try {
    response = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: passcode }),
    });
  } catch {
    setLoginMessage('Unable to reach the login service. Check the site connection and try again.', true);
    return;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    setLoginMessage(data.error || 'Invalid username or passcode.', true);
    return;
  }

  sessionStorage.setItem(LOGIN_SESSION_STORAGE, data.token || '');
  sessionStorage.setItem(LOGIN_UNLOCKED_KEY, '1');

  const redirectTarget = getRedirectTarget();
  window.location.replace(`./${redirectTarget || 'analytics'}`);
}

function bindLoginActions() {
  const loginButton = document.getElementById('loginSubmit');
  const passcodeInput = document.getElementById('loginPasscode');
  if (loginButton) {
    loginButton.addEventListener('click', () => {
      attemptLogin().catch(() => {
        setLoginMessage('Unable to verify credentials in this browser.', true);
      });
    });
  }

  if (passcodeInput) {
    passcodeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        attemptLogin().catch(() => {
          setLoginMessage('Unable to verify credentials in this browser.', true);
        });
      }
    });
  }

}

function bootstrapLogin() {
  const unlocked = sessionStorage.getItem(LOGIN_UNLOCKED_KEY) === '1';

  if (unlocked) {
    const redirectTarget = getRedirectTarget();
    window.location.replace(`./${redirectTarget || 'analytics'}`);
    return;
  }

  bindLoginActions();
}

document.addEventListener('DOMContentLoaded', bootstrapLogin);
