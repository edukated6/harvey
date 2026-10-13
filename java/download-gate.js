// forProducers downloads (forproducers.html): sign in or sign up with an
// emailed code, then pick an operating system. Sign-in goes to the
// forproducers-api Worker and shares its token with the account page; the
// download link comes from the analytics Worker, which checks that token.
const ACCOUNT_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
const ACCOUNT_API = ACCOUNT_LOCAL ? 'http://localhost:8787' : 'https://forproducers-api.harvey-analytics-worker.workers.dev';
const ACCOUNT_TOKEN_KEY = 'forProducers.accountToken';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readStoredValue(storage, key) {
  try {
    return storage.getItem(key) || '';
  } catch (error) {
    return '';
  }
}

function storeValue(storage, key, value) {
  try {
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
  } catch (error) {
    // Ignore storage write issues.
  }
}

// Calls the account API; resolves { ok, status, data, res }
async function accountApi(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = readStoredValue(localStorage, ACCOUNT_TOKEN_KEY);
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${ACCOUNT_API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (error) {
    return { ok: false, status: 0, data: { error: 'Can’t reach forProducers right now. Check your connection and try again.' } };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data || {}, res };
}

function bindDownloadForm(root) {
  const steps = {
    email: root.querySelector('[data-step="email"]'),
    code: root.querySelector('[data-step="code"]'),
    os: root.querySelector('[data-step="os"]'),
  };
  const emailInput = steps.email.querySelector('input[name="email"]');
  const codeInput = steps.code.querySelector('input[name="code"]');
  const status = root.querySelector('.dl-status');
  const details = root.closest('details');
  const apiBase = String(window.HARVEY_ANALYTICS_API_BASE || '').replace(/\/$/, '');
  let email = '';
  let busy = false;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('err', isError);
  };

  const showStep = (name) => {
    Object.entries(steps).forEach(([key, step]) => { step.hidden = key !== name; });
  };

  const setBusy = (step, on) => {
    busy = on;
    step.querySelectorAll('button').forEach((button) => {
      if (on) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    });
  };

  const showSignedIn = (accountEmail) => {
    email = accountEmail;
    steps.os.querySelector('[data-account-email]').textContent = accountEmail;
    showStep('os');
  };

  const signOut = () => {
    accountApi('/api/auth/sign-out', { method: 'POST', body: {} });
    storeValue(localStorage, ACCOUNT_TOKEN_KEY, '');
    email = '';
    setStatus('');
    showStep('email');
  };

  // Checks a saved session; a stale one goes back to the email step.
  const restore = async () => {
    if (!readStoredValue(localStorage, ACCOUNT_TOKEN_KEY)) {
      showStep('email');
      return;
    }
    const r = await accountApi('/v1/me');
    if (r.ok && r.data.email) {
      showSignedIn(r.data.email);
      return;
    }
    if (r.status === 401) storeValue(localStorage, ACCOUNT_TOKEN_KEY, '');
    showStep('email');
  };

  const sendCode = async () => {
    const value = emailInput.value.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(value)) {
      setStatus('Enter a valid email address.', true);
      emailInput.focus();
      return;
    }
    setBusy(steps.email, true);
    setStatus('Sending your code…');
    const r = await accountApi('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email: value, type: 'sign-in' }, auth: false });
    setBusy(steps.email, false);
    if (!r.ok) {
      setStatus(r.status === 429 ? 'Too many tries. Wait a minute, then try again.' : (r.data.error || r.data.message || 'Couldn’t send a code. Please try again.'), true);
      return;
    }
    email = value;
    steps.code.querySelector('[data-code-sub]').textContent = `We sent a 6-digit code to ${email}. It expires in 10 minutes.`;
    setStatus('');
    codeInput.value = '';
    showStep('code');
    codeInput.focus();
  };

  const signIn = async () => {
    if (busy) return;
    const otp = codeInput.value.replace(/\D/g, '');
    if (otp.length !== 6) {
      setStatus('Enter the 6-digit code from the email.', true);
      return;
    }
    setBusy(steps.code, true);
    setStatus('Signing in…');
    const r = await accountApi('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp }, auth: false });
    setBusy(steps.code, false);
    const token = r.res?.headers.get('set-auth-token');
    if (!r.ok || !token) {
      setStatus(r.status === 429 ? 'Too many tries. Wait a minute, then try again.' : 'That code didn’t work. Check it, or send a new one.', true);
      return;
    }
    storeValue(localStorage, ACCOUNT_TOKEN_KEY, token);
    setStatus('');
    showSignedIn(r.data.user?.email || email);
  };

  const download = async (os) => {
    if (busy) return;
    setBusy(steps.os, true);
    setStatus('Preparing your download…');

    try {
      const response = await fetch(`${apiBase}/downloads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${readStoredValue(localStorage, ACCOUNT_TOKEN_KEY)}`,
        },
        body: JSON.stringify({
          os,
          tier: root.dataset.tier || 'free',
          visitorId: readStoredValue(localStorage, 'harveyAnalyticsVisitor'),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        storeValue(localStorage, ACCOUNT_TOKEN_KEY, '');
        showStep('email');
        setStatus('Your sign-in expired. Sign in again to download.', true);
        return;
      }

      if (!response.ok || !data.url) {
        setStatus(data.error || 'Download is unavailable right now. Please try again.', true);
        return;
      }

      status.classList.remove('err');
      status.textContent = 'Your download is starting. ';
      const link = document.createElement('a');
      link.href = data.url;
      link.textContent = 'Click here if it doesn’t.';
      status.appendChild(link);
      window.location.assign(data.url);
    } catch (error) {
      setStatus('Download is unavailable right now. Please try again.', true);
    } finally {
      setBusy(steps.os, false);
    }
  };

  steps.email.addEventListener('submit', (event) => { event.preventDefault(); sendCode(); });
  steps.code.addEventListener('submit', (event) => { event.preventDefault(); signIn(); });
  steps.os.addEventListener('submit', (event) => {
    event.preventDefault();
    const os = event.submitter?.value;
    if (os) download(os);
  });
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    if (codeInput.value.length === 6) signIn();
  });
  root.querySelector('[data-action="resend"]').addEventListener('click', () => { emailInput.value = email; sendCode(); });
  root.querySelector('[data-action="change-email"]').addEventListener('click', () => {
    setStatus('');
    showStep('email');
    emailInput.focus();
  });
  root.querySelector('[data-action="sign-out"]').addEventListener('click', signOut);

  // Check the session when the menu first opens, so the right step shows.
  let restored = false;
  const restoreOnce = () => {
    if (restored) return;
    restored = true;
    restore();
  };
  if (details) {
    details.addEventListener('toggle', () => { if (details.open) restoreOnce(); });
    if (details.open) restoreOnce();
  } else {
    restoreOnce();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.dl-form').forEach(bindDownloadForm);
});
