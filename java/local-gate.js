const LOCAL_GATE_KEY = 'harveyLocalDashboardUnlocked';

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashText(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(digest);
}

function unlockDashboard() {
  const gate = document.getElementById('localGate');
  const dashboard = document.getElementById('analyticsMain');
  if (gate) gate.hidden = true;
  if (dashboard) dashboard.hidden = false;
  window.dispatchEvent(new CustomEvent('harvey-local-gate-unlocked'));
}

function setGateMessage(message) {
  const element = document.getElementById('localGateMessage');
  if (element) element.textContent = message;
}

async function attemptLocalUnlock() {
  const gate = document.getElementById('localGate');
  const username = document.getElementById('localGateUsername')?.value || '';
  const password = document.getElementById('localGatePassword')?.value || '';
  const usernameHash = await hashText(username);
  const passwordHash = await hashText(password);

  if (usernameHash !== gate.dataset.usernameHash || passwordHash !== gate.dataset.passwordHash) {
    setGateMessage('Invalid username or password.');
    return;
  }

  sessionStorage.setItem(LOCAL_GATE_KEY, '1');
  unlockDashboard();
}

function bootstrapLocalGate() {
  const gate = document.getElementById('localGate');
  if (!gate) return;

  if (sessionStorage.getItem(LOCAL_GATE_KEY) === '1') {
    unlockDashboard();
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
