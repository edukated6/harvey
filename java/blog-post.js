const blogPostApiBase = (window.HARVEY_ANALYTICS_API_BASE || '').replace(/\/$/, '');

function escapePostHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function formatPostDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function getSlugFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const querySlug = params.get('slug');
  if (querySlug) return querySlug;

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const blogIndex = pathParts.indexOf('blog');
  return blogIndex >= 0 ? decodeURIComponent(pathParts[blogIndex + 1] || '') : '';
}

// DOMPurify strips data: URIs by default; allow them only for <img> so embedded post images render.
if (window.DOMPurify) {
  window.DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'src' && node.nodeName === 'IMG' && /^data:image\//i.test(data.attrValue)) {
      data.forceKeepAttr = true;
    }
  });
}

function renderMarkdown(bodyMd) {
  if (window.marked && window.DOMPurify) {
    const rawHtml = window.marked.parse(bodyMd || '');
    return window.DOMPurify.sanitize(rawHtml);
  }
  // Fallback if the CDN libraries fail to load: escape and preserve line breaks.
  return `<p>${escapePostHtml(bodyMd).replace(/\n/g, '<br>')}</p>`;
}

const postArticle = document.getElementById('postArticle');
const postLoadingState = document.getElementById('postLoadingState');
const commentsHeading = document.getElementById('commentsHeading');
const commentForm = document.getElementById('commentForm');
const commentAuthorNameInput = document.getElementById('commentAuthorName');
const commentBodyInput = document.getElementById('commentBody');
const commentWebsiteInput = document.getElementById('commentWebsite');
const commentFormMessage = document.getElementById('commentFormMessage');
const commentList = document.getElementById('commentList');
const commentsEmptyState = document.getElementById('commentsEmptyState');

let currentPostId = null;

function renderPost(post) {
  if (!postArticle) return;

  document.title = `${post.title} \u2022 The Harvey Effect`;
  const description = post.excerpt || String(post.bodyMd || '').replace(/[*_>#`~-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const canonicalUrl = `${window.location.origin}/blog/${encodeURIComponent(post.slug)}/`;
  const descriptionMeta = document.querySelector('meta[name="description"]');
  const canonicalLink = document.querySelector('link[rel="canonical"]');
  if (descriptionMeta) descriptionMeta.setAttribute('content', description);
  if (canonicalLink) canonicalLink.setAttribute('href', canonicalUrl);

  const coverHtml = post.coverImage
    ? `<div class="post-cover"><img src="${escapePostHtml(post.coverImage)}" alt="" decoding="async"></div>`
    : '';

  const tagsHtml = post.tags && post.tags.length
    ? `<ul class="post-tags">${post.tags.map((tag) => `<li>${escapePostHtml(tag)}</li>`).join('')}</ul>`
    : '';

  const relatedCtaHtml = post.relatedServiceId
    ? `<div class="section-cta"><a class="btn btn-primary" href="./services">Book This Service</a></div>`
    : '';

  postArticle.innerHTML = `
    ${coverHtml}
    <div class="post-header">
      <p class="post-kicker">${escapePostHtml(post.category || 'Insight')}</p>
      <h1>${escapePostHtml(post.title)}</h1>
      <p class="post-meta">${formatPostDate(post.publishedAt)}</p>
    </div>
    <div class="post-body">${renderMarkdown(post.bodyMd)}</div>
    ${tagsHtml}
    ${relatedCtaHtml}
  `;
}

function renderNotFound() {
  if (!postArticle) return;
  postArticle.innerHTML = `
    <p class="blog-empty">This post could not be found. It may have been unpublished or the link is incorrect.</p>
    <div class="section-cta"><a class="btn btn-ghost" href="./blog">Back to Blog</a></div>
  `;
  if (commentForm) commentForm.hidden = true;
}

function renderComments(comments) {
  if (!commentList) return;

  if (!comments.length) {
    commentList.innerHTML = '<p class="blog-empty" id="commentsEmptyState">No comments yet. Be the first to join the conversation.</p>';
  } else {
    commentList.innerHTML = comments.map((comment) => `
      <div class="comment-item">
        <p class="comment-author">${escapePostHtml(comment.authorName)}</p>
        <p class="comment-body">${escapePostHtml(comment.body)}</p>
        <p class="comment-meta">${formatPostDate(comment.createdAt)}</p>
      </div>
    `).join('');
  }

  if (commentsHeading) {
    commentsHeading.textContent = comments.length ? `Comments (${comments.length})` : 'Comments';
  }
}

async function loadComments(postId) {
  if (!blogPostApiBase) return;
  try {
    const response = await fetch(`${blogPostApiBase}/comments?postId=${postId}`);
    if (!response.ok) throw new Error('Unable to load comments');
    const data = await response.json();
    renderComments(Array.isArray(data.comments) ? data.comments : []);
  } catch (error) {
    if (commentsEmptyState) {
      commentsEmptyState.textContent = 'Comments could not be loaded right now.';
    }
  }
}

async function loadPost() {
  const slug = getSlugFromQuery();
  if (!slug || !blogPostApiBase) {
    renderNotFound();
    return;
  }

  try {
    const response = await fetch(`${blogPostApiBase}/posts/${encodeURIComponent(slug)}`);
    if (!response.ok) throw new Error('Post not found');
    const data = await response.json();
    if (!data.post) throw new Error('Post not found');

    currentPostId = data.post.id;
    renderPost(data.post);
    await loadComments(currentPostId);
  } catch (error) {
    renderNotFound();
  }
}

function setCommentFormMessage(message, isError = false) {
  if (!commentFormMessage) return;
  commentFormMessage.textContent = message;
  commentFormMessage.style.color = isError ? '#ffc7c7' : '';
}

if (commentForm) {
  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!currentPostId) {
      setCommentFormMessage('This post is not available for comments.', true);
      return;
    }

    const payload = {
      postId: currentPostId,
      authorName: commentAuthorNameInput.value.trim(),
      body: commentBodyInput.value.trim(),
      website: commentWebsiteInput.value,
      visitorId: localStorage.getItem('harveyAnalyticsVisitor') || '',
    };

    if (!payload.authorName || !payload.body) {
      setCommentFormMessage('Please add your name and a comment.', true);
      return;
    }

    try {
      setCommentFormMessage('Submitting...');
      const response = await fetch(`${blogPostApiBase}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to submit comment');

      setCommentFormMessage('Thanks! Your comment was submitted and will appear once approved.');
      commentForm.reset();
    } catch (error) {
      setCommentFormMessage(error.message, true);
    }
  });
}

loadPost();
