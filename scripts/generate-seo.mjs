import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const siteUrl = 'https://theharveyeffect.com';
const apiBase = (process.env.HARVEY_ANALYTICS_API_BASE || 'https://harvey-analytics-api.harvey-analytics-worker.workers.dev').replace(/\/$/, '');
const rootDir = process.cwd();

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripMarkdown(value = '') {
  return String(value)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_>#`~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Applies inline Markdown (images, links, bold, italic, code) to already-HTML-escaped text.
function renderInline(text) {
  return escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" decoding="async">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_m, a, b) => `<strong>${a ?? b}</strong>`)
    .replace(/\*([^*]+)\*|_([^_]+)_/g, (_m, a, b) => `<em>${a ?? b}</em>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderMarkdown(value = '') {
  return String(value).split(/\r?\n\s*\r?\n/).filter(Boolean).map((block) => {
    const text = block.trim();
    const lines = text.split('\n');

    if (/^#{1,6}\s/.test(text)) {
      const [, hashes, heading] = text.match(/^(#{1,6})\s+(.+)$/);
      const level = Math.min(hashes.length + 1, 4);
      return `<h${level}>${renderInline(heading)}</h${level}>`;
    }
    if (lines.every((line) => /^>\s?/.test(line))) {
      const quoted = lines.map((line) => line.replace(/^>\s?/, '')).join(' ');
      return `<blockquote><p>${renderInline(quoted)}</p></blockquote>`;
    }
    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      const items = lines.map((line) => `<li>${renderInline(line.replace(/^[-*]\s+/, ''))}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    if (lines.every((line) => /^\d+\.\s+/.test(line))) {
      const items = lines.map((line) => `<li>${renderInline(line.replace(/^\d+\.\s+/, ''))}</li>`).join('');
      return `<ol>${items}</ol>`;
    }
    return `<p>${lines.map(renderInline).join('<br>')}</p>`;
  }).join('\n');
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function pageTemplate(post) {
  const title = `${post.title} | The Harvey Effect`;
  const description = stripMarkdown(post.excerpt || post.bodyMd).slice(0, 160);
  const canonical = `${siteUrl}/blog/${encodeURIComponent(post.slug)}/`;
  const image = post.coverImage && /^https?:\/\//.test(post.coverImage) ? post.coverImage : `${siteUrl}/assets/images/Harvey%20poster.png`;
  const coverHtml = post.coverImage
    ? `<div class="post-cover"><img src="${escapeHtml(post.coverImage)}" alt="" decoding="async"></div>`
    : '';
  const body = renderMarkdown(post.bodyMd);
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description,
    datePublished: post.publishedAt,
    author: { '@type': 'Person', name: 'Ahmaad Harvey', url: siteUrl },
    image,
    mainEntityOfPage: canonical,
    publisher: { '@type': 'Person', name: 'Ahmaad Harvey', url: siteUrl },
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <link rel="icon" type="image/svg+xml" href="../../assets/images/harvey logo.svg">
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonical}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <meta name="theme-color" content="#0d121f">
  <link rel="stylesheet" href="../../css/styles.css?v=20260816-2">
  <script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js" defer crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js" defer crossorigin="anonymous"></script>
  <script src="../../java/analytics-config.js?v=20260816-2" defer></script>
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  <nav class="site-nav" aria-label="Primary">
    <span class="site-nav-brand">The Harvey Effect</span>
    <button class="nav-toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="navLinks" aria-label="Toggle navigation menu">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-links" id="navLinks">
      <a href="../../home">Home</a>
      <a href="../../work">Work</a>
      <a href="../../blog">Blog</a>
      <a href="../../services">Services</a>
      <a href="../../contact">Contact</a>
    </div>
  </nav>
  <main>
    <article class="post-article page-section-first" id="postArticle" aria-live="polite">
      ${coverHtml}
      <div class="post-header">
        <p class="post-kicker">${escapeHtml(post.category || 'Insight')}</p>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="post-meta">${escapeHtml(formatDate(post.publishedAt))}</p>
      </div>
      <div class="post-body">${body}</div>
    </article>

    <section class="comments-section" id="comments" aria-label="Comments">
      <div class="section-heading reveal-up">
        <p>Join The Conversation</p>
        <h2 id="commentsHeading">Comments</h2>
      </div>

      <form class="comment-form reveal-up" id="commentForm">
        <label class="brief-label" for="commentAuthorName">Name</label>
        <input class="brief-input" id="commentAuthorName" type="text" maxlength="80" placeholder="Your name" required>

        <label class="brief-label" for="commentBody">Comment</label>
        <textarea class="brief-input brief-textarea" id="commentBody" rows="4" maxlength="2000" placeholder="Share your thoughts..." required></textarea>

        <input type="text" id="commentWebsite" name="website" autocomplete="off" tabindex="-1" class="comment-honeypot" aria-hidden="true">

        <div class="booking-actions">
          <button class="btn btn-primary" type="submit">Post Comment</button>
        </div>
        <p id="commentFormMessage" class="analytics-gate-message"></p>
      </form>

      <div class="comment-list" id="commentList" aria-live="polite">
        <p class="blog-empty" id="commentsEmptyState">Loading comments&hellip;</p>
      </div>
    </section>
  </main>
  <footer>© 2026 Created and Designed by Ahmaad Harvey. All Rights Reserved.</footer>
  <script src="../../java/scripts.js?v=20260816-2" defer></script>
  <script src="../../java/blog-post.js?v=20260816-2" defer></script>
</body>
</html>
`;
}

async function fetchJson(path) {
  const response = await fetch(`${apiBase}${path}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

const { posts = [] } = await fetchJson('/posts?limit=50');
const generatedUrls = [];
for (const summary of posts) {
  const { post } = await fetchJson(`/posts/${encodeURIComponent(summary.slug)}`);
  if (!post) continue;
  const outputDir = join(rootDir, 'blog', post.slug);
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'index.html'), pageTemplate(post), 'utf8');
  generatedUrls.push({ loc: `${siteUrl}/blog/${encodeURIComponent(post.slug)}/`, lastmod: formatDate(post.updatedAt || post.publishedAt) });
}

const staticUrls = [
  { loc: `${siteUrl}/`, lastmod: '' },
  { loc: `${siteUrl}/work`, lastmod: '' },
  { loc: `${siteUrl}/blog`, lastmod: '' },
  { loc: `${siteUrl}/services`, lastmod: '' },
  { loc: `${siteUrl}/contact`, lastmod: '' },
  ...generatedUrls,
];
const urlEntries = staticUrls.map(({ loc, lastmod }) => `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`).join('\n');
await writeFile(join(rootDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`, 'utf8');
console.log(`Generated ${generatedUrls.length} blog pages and sitemap.xml`);
