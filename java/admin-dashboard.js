const apiBase = (window.HARVEY_ANALYTICS_API_BASE || 'https://harvey-analytics-api.harvey-analytics-worker.workers.dev').replace(/\/$/, '');

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function adminFetch(path, options = {}) {
  const sessionToken = sessionStorage.getItem('harveyAdminSessionToken') || '';
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error('The blog service could not be reached. Check your connection and try again.');
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.dispatchEvent(new Event('harvey-session-expired'));
    throw new Error('Your dashboard session has expired.');
  }
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

async function ensureAdminSession() {
  return true;
}

const postForm = document.getElementById('postForm');
const postIdInput = document.getElementById('postId');
const postTitleInput = document.getElementById('postTitle');
const postSlugInput = document.getElementById('postSlug');
const postExcerptInput = document.getElementById('postExcerpt');
const postCoverImageInput = document.getElementById('postCoverImage');
const thumbDropzone = document.getElementById('thumbDropzone');
const thumbDropzoneText = document.getElementById('thumbDropzoneText');
const thumbPreview = document.getElementById('thumbPreview');
const postCoverImageFileInput = document.getElementById('postCoverImageFile');
const removeThumbButton = document.getElementById('removeThumbButton');
const postCategoryInput = document.getElementById('postCategory');
const postTagsInput = document.getElementById('postTags');
const postRelatedServiceInput = document.getElementById('postRelatedService');
const postBodyInput = document.getElementById('postBody');
const BODY_IMAGE_MAX_DIMENSION = 1600;
const BODY_IMAGE_JPEG_QUALITY = 0.76;

function insertBodyImage(editor) {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPostFormMessage('Please choose an image file.', true);
      return;
    }
    try {
      const rawDataUrl = await readImageAsDataUrl(file);
      const imageDataUrl = await resizeImageDataUrl(rawDataUrl, BODY_IMAGE_MAX_DIMENSION, BODY_IMAGE_JPEG_QUALITY);
      const altText = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Blog image';
      const imageMarkdown = `![${altText}](${imageDataUrl})`;
      const cursor = editor.codemirror.getCursor();
      editor.codemirror.replaceSelection(`${imageMarkdown}\n`);
      editor.codemirror.setCursor({ line: cursor.line + 1, ch: 0 });
      editor.codemirror.save();
      setPostFormMessage('Image added to the post.');
    } catch (error) {
      setPostFormMessage(error.message, true);
    }
  });
  fileInput.click();
}

const postBodyEditor = postBodyInput && window.EasyMDE ? new EasyMDE({
  element: postBodyInput,
  autofocus: false,
  spellChecker: true,
  status: ['lines', 'words', 'cursor'],
  toolbar: ['bold', 'italic', 'heading', '|', 'quote', 'unordered-list', 'ordered-list', '|', 'link', { name: 'image', action: insertBodyImage, title: 'Insert image from your computer', className: 'fa fa-picture-o' }, 'code', 'preview', 'side-by-side', 'fullscreen', '|', 'guide'],
  minHeight: '260px',
}) : null;
if (postBodyEditor) {
  postBodyEditor.codemirror.on('change', () => postBodyEditor.codemirror.save());
}
const postStatusInput = document.getElementById('postStatus');
const postFormTitle = document.getElementById('postFormTitle');
const postFormMessage = document.getElementById('postFormMessage');
const resetPostFormButton = document.getElementById('resetPostForm');
const adminPostsList = document.getElementById('adminPostsList');
const adminCommentsList = document.getElementById('adminCommentsList');
const commentFilterButtons = document.querySelectorAll('[data-comment-filter]');
let activeCommentFilter = 'pending';

function setPostFormMessage(message, isError = false) {
  if (!postFormMessage) return;
  postFormMessage.textContent = message;
  postFormMessage.style.color = isError ? '#ffc7c7' : '';
}

const THUMB_MAX_DIMENSION = 1280;
const THUMB_JPEG_QUALITY = 0.78;

function showThumbPreview(src) {
  if (!thumbPreview) return;
  if (src) {
    thumbPreview.src = src;
    thumbPreview.hidden = false;
    if (thumbDropzoneText) thumbDropzoneText.hidden = true;
    if (removeThumbButton) removeThumbButton.hidden = false;
  } else {
    thumbPreview.hidden = true;
    thumbPreview.removeAttribute('src');
    if (thumbDropzoneText) thumbDropzoneText.hidden = false;
    if (removeThumbButton) removeThumbButton.hidden = true;
  }
}

function setThumbFromValue(value) {
  postCoverImageInput.value = value || '';
  showThumbPreview(value || '');
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

// Resizes/compresses the image client-side so it stores compactly as a data URL.
function resizeImageDataUrl(dataUrl, maxDimension = THUMB_MAX_DIMENSION, quality = THUMB_JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('That file could not be loaded as an image.'));
    img.src = dataUrl;
  });
}

async function handleThumbFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    setPostFormMessage('Please choose an image file.', true);
    return;
  }
  try {
    const rawDataUrl = await readImageAsDataUrl(file);
    const resizedDataUrl = await resizeImageDataUrl(rawDataUrl);
    setThumbFromValue(resizedDataUrl);
  } catch (error) {
    setPostFormMessage(error.message, true);
  }
}

if (thumbDropzone) {
  thumbDropzone.addEventListener('click', () => postCoverImageFileInput?.click());
  thumbDropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      postCoverImageFileInput?.click();
    }
  });
  ['dragenter', 'dragover'].forEach((eventName) => {
    thumbDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      thumbDropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
    thumbDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      thumbDropzone.classList.remove('is-dragover');
    });
  });
  thumbDropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) handleThumbFile(file);
  });
}

if (postCoverImageFileInput) {
  postCoverImageFileInput.addEventListener('change', () => {
    const file = postCoverImageFileInput.files?.[0];
    if (file) handleThumbFile(file);
    postCoverImageFileInput.value = '';
  });
}

if (removeThumbButton) {
  removeThumbButton.addEventListener('click', () => setThumbFromValue(''));
}

if (postCoverImageInput) {
  postCoverImageInput.addEventListener('input', () => showThumbPreview(postCoverImageInput.value.trim()));
}

function fillPostForm(post) {
  postIdInput.value = post.id;
  postTitleInput.value = post.title || '';
  postSlugInput.value = post.slug || '';
  postExcerptInput.value = post.excerpt || '';
  setThumbFromValue(post.coverImage || '');
  postCategoryInput.value = post.category || '';
  postTagsInput.value = Array.isArray(post.tags) ? post.tags.join(', ') : '';
  postRelatedServiceInput.value = post.relatedServiceId || '';
  if (postBodyEditor) postBodyEditor.value(post.bodyMd || '');
  else postBodyInput.value = post.bodyMd || '';
  postStatusInput.value = post.status || 'draft';
  postFormTitle.textContent = `Editing: ${post.title}`;
}

function clearPostForm() {
  postForm.reset();
  if (postBodyEditor) postBodyEditor.value('');
  postIdInput.value = '';
  postFormTitle.textContent = 'New Post';
  setPostFormMessage('');
  showThumbPreview('');
}

function formatAdminDate(isoString) {
  if (!isoString) return 'Not published';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderPostsList(posts) {
  if (!adminPostsList) return;

  if (!posts.length) {
    adminPostsList.innerHTML = '<p class="analytics-subtitle">No posts yet. Use the form above to create your first one.</p>';
    return;
  }

  adminPostsList.innerHTML = '';
  posts.forEach((post) => {
    const row = document.createElement('div');
    row.className = 'analytics-row';
    row.innerHTML = `
      <p class="analytics-row-event">${escapeHtml(post.title)} <span style="color: var(--muted); font-weight: 500;">(${escapeHtml(post.status)})</span></p>
      <p class="analytics-row-meta">/${escapeHtml(post.slug)} &middot; ${formatAdminDate(post.publishedAt)}</p>
      <div class="booking-actions" style="margin-top: 0.5rem;">
        <button class="btn btn-ghost" type="button" data-edit-post="${post.id}">Edit</button>
        <button class="btn btn-ghost" type="button" data-delete-post="${post.id}">Delete</button>
      </div>
    `;
    adminPostsList.appendChild(row);
  });

  adminPostsList.querySelectorAll('[data-edit-post]').forEach((button) => {
    button.addEventListener('click', () => {
      const post = posts.find((item) => String(item.id) === button.dataset.editPost);
      if (post) {
        fillPostForm(post);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });

  adminPostsList.querySelectorAll('[data-delete-post]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Delete this post and all of its comments? This cannot be undone.')) return;
      try {
        await adminFetch(`/admin/posts/${button.dataset.deletePost}`, { method: 'DELETE' });
        await loadPosts();
      } catch (error) {
        window.alert(error.message);
      }
    });
  });
}

async function loadPosts() {
  if (!adminPostsList) return;
  if (!(await ensureAdminSession())) return;
  try {
    const data = await adminFetch('/admin/posts');
    renderPostsList(Array.isArray(data.posts) ? data.posts : []);
  } catch (error) {
    adminPostsList.innerHTML = `<p class="analytics-subtitle">${escapeHtml(error.message)}</p>`;
  }
}

function renderCommentsList(comments) {
  if (!adminCommentsList) return;

  if (!comments.length) {
    adminCommentsList.innerHTML = `<p class="analytics-subtitle">No ${escapeHtml(activeCommentFilter)} comments.</p>`;
    return;
  }

  adminCommentsList.innerHTML = '';
  comments.forEach((comment) => {
    const row = document.createElement('div');
    row.className = 'analytics-row';
    const actions = activeCommentFilter === 'approved'
      ? `<button class="btn btn-ghost" type="button" data-reject-comment="${comment.id}">Reject</button>`
      : activeCommentFilter === 'rejected'
        ? `<button class="btn btn-ghost" type="button" data-approve-comment="${comment.id}">Approve</button>`
        : `
          <button class="btn btn-primary" type="button" data-approve-comment="${comment.id}">Approve</button>
          <button class="btn btn-ghost" type="button" data-reject-comment="${comment.id}">Reject</button>
        `;

    row.innerHTML = `
      <p class="analytics-row-event">${escapeHtml(comment.authorName)}</p>
      <p class="analytics-row-meta">${escapeHtml(comment.body)}</p>
      <p class="analytics-row-meta">Post #${comment.postId} &middot; ${formatAdminDate(comment.createdAt)}</p>
      <div class="booking-actions" style="margin-top: 0.5rem;">
        ${actions}
        <button class="btn btn-ghost" type="button" data-delete-comment="${comment.id}">Delete</button>
      </div>
    `;
    adminCommentsList.appendChild(row);
  });

  adminCommentsList.querySelectorAll('[data-approve-comment]').forEach((button) => {
    button.addEventListener('click', () => moderateComment(button.dataset.approveComment, 'approved'));
  });
  adminCommentsList.querySelectorAll('[data-reject-comment]').forEach((button) => {
    button.addEventListener('click', () => moderateComment(button.dataset.rejectComment, 'rejected'));
  });
  adminCommentsList.querySelectorAll('[data-delete-comment]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Delete this comment?')) return;
      try {
        await adminFetch(`/admin/comments/${button.dataset.deleteComment}`, { method: 'DELETE' });
        await loadComments();
      } catch (error) {
        window.alert(error.message);
      }
    });
  });
}

async function moderateComment(id, status) {
  try {
    await adminFetch(`/admin/comments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    await loadComments();
  } catch (error) {
    window.alert(error.message);
  }
}

async function loadComments() {
  if (!adminCommentsList) return;
  try {
    const data = await adminFetch(`/admin/comments?status=${encodeURIComponent(activeCommentFilter)}`);
    renderCommentsList(Array.isArray(data.comments) ? data.comments : []);
  } catch (error) {
    adminCommentsList.innerHTML = `<p class="analytics-subtitle">${escapeHtml(error.message)}</p>`;
  }
}

commentFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    commentFilterButtons.forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
    activeCommentFilter = button.dataset.commentFilter;
    loadComments();
  });
});

if (postForm) {
  postForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (postBodyEditor) postBodyEditor.codemirror.save();

    const id = postIdInput.value;
    const payload = {
      title: postTitleInput.value.trim(),
      slug: postSlugInput.value.trim() ? slugify(postSlugInput.value) : undefined,
      excerpt: postExcerptInput.value.trim(),
      coverImage: postCoverImageInput.value.trim(),
      category: postCategoryInput.value.trim(),
      tags: postTagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean),
      relatedServiceId: postRelatedServiceInput.value.trim(),
      bodyMd: postBodyInput.value,
      status: postStatusInput.value,
    };

    try {
      setPostFormMessage('Saving...');
      if (id) {
        await adminFetch(`/admin/posts/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setPostFormMessage('Post updated.');
      } else {
        await adminFetch('/admin/posts', { method: 'POST', body: JSON.stringify(payload) });
        setPostFormMessage('Post created.');
        clearPostForm();
      }
      await loadPosts();
    } catch (error) {
      setPostFormMessage(error.message, true);
    }
  });
}

if (resetPostFormButton) {
  resetPostFormButton.addEventListener('click', clearPostForm);
}

window.addEventListener('harvey-analytics-unlocked', () => {
  loadPosts();
  loadComments();
});

window.addEventListener('harvey-local-gate-unlocked', () => {
  loadPosts();
  loadComments();
});
