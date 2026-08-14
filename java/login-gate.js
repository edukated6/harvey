const LOGIN_UNLOCKED_KEY = 'harveyAnalyticsOwnerUnlocked';
const LOGIN_API_KEY_STORAGE = 'harveyAnalyticsOwnerApiKey';
const ALLOWED_REDIRECT_PAGES = ['analytics', 'admin'];

function getRedirectTarget() {
  const requested = new URLSearchParams(window.location.search).get('redirect') || '';
  return ALLOWED_REDIRECT_PAGES.includes(requested) ? requested : '';
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashText(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
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

  const expectedUserHash = String(gate.dataset.userHash || '').trim().toLowerCase();
  const expectedPassHash = String(gate.dataset.ownerHash || '').trim().toLowerCase();
  const usernameInput = document.getElementById('loginUsername');
  const passcodeInput = document.getElementById('loginPasscode');
  const apiKeyInput = document.getElementById('loginApiKey');

  if (expectedUserHash.length !== 64 || expectedPassHash.length !== 64) {
    setLoginMessage('Login is not configured. Update data-user-hash / data-owner-hash in login.html.', true);
    return;
  }

  const username = String(usernameInput?.value || '');
  const passcode = String(passcodeInput?.value || '');
  if (!username || !passcode) {
    setLoginMessage('Enter your username and passcode to continue.', true);
    return;
  }

  const [candidateUserHash, candidatePassHash] = await Promise.all([hashText(username), hashText(passcode)]);
  if (candidateUserHash !== expectedUserHash || candidatePassHash !== expectedPassHash) {
    setLoginMessage('Invalid username or passcode.', true);
    return;
  }

  sessionStorage.setItem(LOGIN_UNLOCKED_KEY, '1');

  const apiKey = String(apiKeyInput?.value || '').trim();
  if (apiKey) {
    sessionStorage.setItem(LOGIN_API_KEY_STORAGE, apiKey);
    window.HARVEY_ANALYTICS_OWNER_KEY = apiKey;
  }

  setLoginMessage('Login successful.');

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
  window.HARVEY_ANALYTICS_OWNER_KEY = sessionStorage.getItem(LOGIN_API_KEY_STORAGE) || '';

  if (unlocked) {
    const redirectTarget = getRedirectTarget();
    window.location.replace(`./${redirectTarget || 'analytics'}`);
    return;
  }

  bindLoginActions();
}

document.addEventListener('DOMContentLoaded', bootstrapLogin);
