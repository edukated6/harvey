const contactForm = document.getElementById('contactForm');
const contactFormStatus = document.getElementById('contactFormStatus');
const contactApiBase = (window.HARVEY_ANALYTICS_API_BASE || '').replace(/\/$/, '');

function setContactStatus(message, isError = false) {
  if (!contactFormStatus) return;
  contactFormStatus.textContent = message;
  contactFormStatus.classList.toggle('is-error', isError);
}

contactForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!contactApiBase) {
    setContactStatus('Messages are temporarily unavailable. Please try again later.', true);
    return;
  }

  const submitButton = contactForm.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(contactForm).entries());

  submitButton.disabled = true;
  setContactStatus('Sending...');

  try {
    const response = await fetch(`${contactApiBase}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || 'Unable to send your message.');
    }

    contactForm.reset();
    setContactStatus('Message sent. Thanks for reaching out.');
  } catch (error) {
    setContactStatus(error.message || 'Unable to send your message. Please try again later.', true);
  } finally {
    submitButton.disabled = false;
  }
});