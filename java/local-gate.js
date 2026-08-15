const LOCAL_GATE_KEY = 'harveyLocalDashboardUnlocked';
const LOCAL_SESSION_KEY = 'harveyAdminSessionToken';
const LOCAL_GATE_TARGETS = ['admin', 'analytics'];

function getTarget() {
  const target = new URLSearchParams(window.location.search).get('redirect') || '';
  return LOCAL_GATE_TARGETS.includes(target) ? target : 'admin';
}

function unlockDashboard() {
  const gate = document.getElementById('localGate');
  const dashboard = document.getElementById('analyticsMain');
  if (gate) {
    sessionStorage.setItem(LOCAL_GATE_KEY, '1');
    window.location.replace(`./${getTarget()}`);
    return;
  }
  if (dashboard) dashboard.hidden = false;
  window.dispatchEvent(new CustomEvent('harvey-local-gate-unlocked'));
}

function setGateMessage(message) {
  const element = document.getElementById('localGateMessage');
  if (element) element.textContent = message;
}

function clearDashboardSession() {
  sessionStorage.removeItem(LOCAL_GATE_KEY);
  sessionStorage.removeItem(LOCAL_SESSION_KEY);
}

function redirectToLogin() {
  const target = window.location.pathname.split('/').pop()?.replace(/\.html$/, '') || 'admin';
  window.location.replace(`./login?redirect=${encodeURIComponent(target)}`);
}

async function attemptLocalUnlock() {
  const username = document.getElementById('localGateUsername')?.value.trim() || '';
  const password = document.getElementById('localGatePassword')?.value || '';
  if (!username || !password) {
    setGateMessage('Enter your username and password.');
    return;
  }

  const apiBase = String(window.HARVEY_ANALYTICS_API_BASE || '').replace(/\/$/, '');
  if (!apiBase) {
    setGateMessage('Login service is not configured.');
    return;
  }

  let response;
  try {
    response = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    setGateMessage('Unable to reach the login service.');
    return;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok || !data.token) {
    setGateMessage(data.error || 'Invalid username or password.');
    return;
  }

  sessionStorage.setItem(LOCAL_SESSION_KEY, data.token);
  sessionStorage.setItem(LOCAL_GATE_KEY, '1');
  unlockDashboard();
}

async function signOut() {
  const token = sessionStorage.getItem(LOCAL_SESSION_KEY) || '';
  const apiBase = String(window.HARVEY_ANALYTICS_API_BASE || '').replace(/\/$/, '');
  try {
    if (token && apiBase) {
      await fetch(`${apiBase}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } finally {
    clearDashboardSession();
    window.location.replace('./login');
  }
}

function bootstrapLocalGate() {
  const gate = document.getElementById('localGate');
  const dashboard = document.getElementById('analyticsMain');

  document.querySelectorAll('[data-dashboard-logout]').forEach((button) => {
    button.addEventListener('click', () => {
      signOut();
    });
  });

  const hasSession = sessionStorage.getItem(LOCAL_GATE_KEY) === '1' && Boolean(sessionStorage.getItem(LOCAL_SESSION_KEY));
  if (hasSession) {
    if (gate) {
      window.location.replace(`./${getTarget()}`);
    } else if (dashboard) {
      dashboard.hidden = false;
      window.dispatchEvent(new CustomEvent('harvey-local-gate-unlocked'));
    }
    return;
  }

  if (!gate) {
    redirectToLogin();
    return;
  }

  document.getElementById('localGateSubmit')?.addEventListener('click', () => {
    attemptLocalUnlock().catch(() => setGateMessage('Unable to verify credentials in this browser.'));
  });

  document.getElementById('localGatePassword')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      attemptLocalUnlock().catch(() => setGateMessage('Unable to verify credentials in this browser.'));
    }
  });

}

document.addEventListener('DOMContentLoaded', bootstrapLocalGate);
window.addEventListener('harvey-session-expired', () => {
  clearDashboardSession();
  redirectToLogin();
});
