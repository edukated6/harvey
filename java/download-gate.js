const DOWNLOAD_EMAIL_KEY = 'harveyDownloadEmail';

function readStoredValue(storage, key) {
  try {
    return storage.getItem(key) || '';
  } catch (error) {
    return '';
  }
}

function storeValue(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch (error) {
    // Ignore storage write issues.
  }
}

function bindDownloadForm(form) {
  const emailInput = form.querySelector('input[name="email"]');
  const status = form.querySelector('.dl-status');
  const buttons = [...form.querySelectorAll('button[name="os"]')];
  const apiBase = String(window.HARVEY_ANALYTICS_API_BASE || '').replace(/\/$/, '');

  emailInput.value = readStoredValue(localStorage, DOWNLOAD_EMAIL_KEY);

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('err', isError);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const os = event.submitter?.value || '';
    const email = emailInput.value.trim();

    if (!emailInput.checkValidity() || !email) {
      setStatus('Enter your email to download.', true);
      emailInput.focus();
      return;
    }

    buttons.forEach((button) => button.setAttribute('aria-busy', 'true'));
    setStatus('Preparing your download…');

    try {
      const response = await fetch(`${apiBase}/downloads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          os,
          tier: form.dataset.tier || 'free',
          website: form.querySelector('input[name="website"]')?.value || '',
          visitorId: readStoredValue(localStorage, 'harveyAnalyticsVisitor'),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.url) {
        setStatus(data.error || 'Download is unavailable right now. Please try again.', true);
        return;
      }

      storeValue(localStorage, DOWNLOAD_EMAIL_KEY, email);
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
      buttons.forEach((button) => button.removeAttribute('aria-busy'));
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('form.dl-form').forEach(bindDownloadForm);
});
