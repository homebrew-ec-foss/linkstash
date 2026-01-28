export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Lightweight Markdown -> HTML renderer
    const mdToHtml = (md) => {
      if (!md) return '';
      const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Code fences
      md = md.replace(/```([\s\S]*?)```/g, (m, code) => '<pre><code>' + escapeHtml(code) + '</code></pre>');

      // Inline code
      md = md.replace(/`([^`]+)`/g, (m, c) => '<code>' + escapeHtml(c) + '</code>');

      // Nested image inside link: [![alt](img)](link) -> <a><img></a>
      md = md.replace(/\[!\[([^\]]*?)\]\(([^)]+)\)\]\(([^)]+)\)/g, (m, alt, imgUrl, linkUrl) => '\n\n<a href="' + linkUrl + '" target="_blank" rel="noopener"><img alt="' + escapeHtml(alt) + '" src="' + imgUrl + '" /></a>\n\n');

      // Images (ensure block separation)
      md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => '\n\n<img alt="' + escapeHtml(alt) + '" src="' + src + '" />\n\n');

      // Video embeds (YouTube, Vimeo) and direct media (.mp4/.webm)
      const youtubeEmbed = (url) => {
        const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        if (!m) return null;
        const id = m[1];
        return '\n\n<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '" frameborder="0" allowfullscreen sandbox="allow-same-origin allow-scripts"></iframe></div>\n\n';
      };
      const vimeoEmbed = (url) => {
        const m = url.match(/vimeo\.com\/(\d+)/);
        if (!m) return null;
        return '\n\n<div class="video"><iframe src="https://player.vimeo.com/video/' + m[1] + '" frameborder="0" allowfullscreen sandbox="allow-same-origin allow-scripts"></iframe></div>\n\n';
      };

      // markdown links that point to videos -> embed
      md = md.replace(/\[([^\]]+)\]\((https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^)]+)\)/g, (m, text, url) => youtubeEmbed(url) || '<a href="' + url + '" target="_blank" rel="noopener">' + escapeHtml(text) + '</a>');
      md = md.replace(/\[([^\]]+)\]\((https?:\/\/(?:www\.)?vimeo\.com\/[0-9]+)\)/g, (m, text, url) => vimeoEmbed(url) || '<a href="' + url + '" target="_blank" rel="noopener">' + escapeHtml(text) + '</a>');

      // direct urls to video files
      md = md.replace(/\n?(https?:\/\/[\w\-._~:\/?#\[\]@!$&'()*+,;=%]+\.(?:mp4|webm))(?:\n|$)/g, (m, url) => '\n\n<video controls src="' + url + '"></video>\n\n');

      // plain youtube/vimeo urls -> embed
      md = md.replace(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/[A-Za-z0-9_-]{11})[^\s]*/g, (m) => youtubeEmbed(m) || m);
      md = md.replace(/https?:\/\/(?:www\.)?vimeo\.com\/[0-9]+/g, (m) => vimeoEmbed(m) || m);

      // Links
      md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

      // Bold & Italic
      md = md.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      md = md.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      md = md.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      md = md.replace(/_([^_]+)_/g, '<em>$1</em>');

      // Ensure headings on their own line even if written inline after text/link
      md = md.replace(/([^\n])\s+(#{1,6}\s+)/gim, '$1\n\n$2');

      // Headings
      md = md.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
      md = md.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
      md = md.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
      md = md.replace(/^### (.*$)/gim, '<h3>$1</h3>');
      md = md.replace(/^## (.*$)/gim, '<h2>$1</h2>');
      md = md.replace(/^# (.*$)/gim, '<h1>$1</h1>');

      // Blockquotes
      md = md.replace(/(^|\n)>\s?(.*)/g, (m, p1, p2) => p1 + '<blockquote>' + p2 + '</blockquote>');

      // Unordered lists
      md = md.replace(/(^|\n)((?:[ \t]*[-*+] .*(?:\n|$))+)/g, (m, p1, block) => {
        const items = block.trim().split(/\n/).filter(Boolean).map(l => '<li>' + l.replace(/^[ \t]*[-*+] /, '') + '</li>').join('');
        return p1 + '<ul>' + items + '</ul>';
      });

      // Ordered lists
      md = md.replace(/(^|\n)((?:[ \t]*\d+\. .*(?:\n|$))+)/g, (m, p1, block) => {
        const items = block.trim().split(/\n/).filter(Boolean).map(l => '<li>' + l.replace(/^[ \t]*\d+\. /, '') + '</li>').join('');
        return p1 + '<ol>' + items + '</ol>';
      });

      // Horizontal rule
      md = md.replace(/^[-*_]{3,}$/gim, '<hr/>');

      // Paragraphs (wrap lines with text not already wrapped)
      md = md.split(/\n\n+/).map(block => {
        if (/^<(h\d|ul|ol|pre|blockquote|img|hr)/.test(block.trim())) return block;
        const trimmed = block.trim();
        if (!trimmed) return '';
        return '<p>' + trimmed.replace(/\n/g, '<br/>') + '</p>';
      }).join('\n\n');

      return md;
    };

    // Normalize URL for consistent deduping
    const normalizeUrl = (u) => {
      try {
        const nu = new URL(u);
        // strip trailing slashes from pathname
        const path = nu.pathname.replace(/\/+$/, '');
        // keep origin + path + search
        return nu.origin + (path || '/') + nu.search;
      } catch (e) {
        return u.replace(/\/+$/, '');
      }
    };

    // ---------------- ADD LINK ----------------
    if (req.method === "POST" && url.pathname === "/api/add") {
      // Check auth
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.slice(7) !== env.AUTH_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }

      const { link } = await req.json();
      if (!link) {
        return new Response("Missing link", { status: 400 });
      }

      // Forward to Linkstash API
      const headers = { "Content-Type": "application/json" };
      if (env.AUTH_KEY) {
        headers["Authorization"] = "Bearer " + env.AUTH_KEY;
      }
      const res = await fetch("https://lava-linkstash.onrender.com/api", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          links: [link],
          returnFormat: "json",
          parser: "jsdom",
          saveToDisk: false
        })
      });

      const data = await res.json(); // list of responses

      // Build a map of existing normalized URLs -> KV entry
      const existingMap = {};
      const existingKeys = await env.LINKS.list({ prefix: "link:" });
      for (const k of existingKeys.keys) {
        const val = await env.LINKS.get(k.name);
        if (!val) continue;
        try {
          const parsed = JSON.parse(val);
          existingMap[normalizeUrl(parsed.url)] = { keyName: k.name, data: parsed };
        } catch (e) {
          // ignore malformed entries
        }
      }

      for (const item of data) {
        const nurl = normalizeUrl(item.url);
        const now = Date.now();
        if (existingMap[nurl]) {
          // increment count (upvote) and update timestamp
          const entry = existingMap[nurl];
          entry.data.count = (entry.data.count || 1) + 1;
          entry.data.ts = now;
          // Optionally update meta if missing
          if (item.frontmatter && !entry.data.meta) {
            entry.data.meta = item.frontmatter;
          }
          await env.LINKS.put(entry.keyName, JSON.stringify(entry.data));
        } else {
          const key = "link:" + crypto.randomUUID();
          const obj = {
            url: item.url,
            domain: new URL(item.url).hostname,
            body: item.body,
            ts: now,
            count: 1,
            meta: item.frontmatter || {}
          };
          await env.LINKS.put(key, JSON.stringify(obj));
          existingMap[nurl] = { keyName: key, data: obj };
        }
      }

      return Response.json({ ok: true });
    }

    // ---------------- GET LINKS (JSON) ----------------
    if (req.method === "GET" && url.pathname === "/api/links") {
      const list = [];
      const keys = await env.LINKS.list({ prefix: "link:" });

      for (const k of keys.keys) {
        const val = await env.LINKS.get(k.name);
        if (val) list.push(JSON.parse(val));
      }

      list.sort((a, b) => b.ts - a.ts);
      return Response.json(list);
    }

    // ---------------- PREVIEW MARKDOWN ----------------
    if (req.method === "POST" && url.pathname === "/api/preview") {
      const ct = req.headers.get('Content-Type') || '';
      let md = '';
      if (ct.includes('application/json')) {
        const j = await req.json();
        md = j.md || '';
      } else {
        md = await req.text();
      }

      const html = mdToHtml(md);
      return new Response(JSON.stringify({ html }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ---------------- HEALTH CHECK ----------------
    if (req.method === "GET" && url.pathname === "/api/health") {
      try {
        const res2 = await fetch('https://lava-linkstash.onrender.com/ping', { method: 'GET', headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 10 } });
        const ping = await res2.json();
        // return remote ping payload under "remote"
        return new Response(JSON.stringify({ ok: true, remote: ping }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message, timestamp: new Date().toISOString() }), { headers: { 'Content-Type': 'application/json' }, status: 502 });
      }
    }

    // ---------------- HTML PAGE ----------------
    if (req.method === "GET" && url.pathname === "/") {
      const list = [];
      const keys = await env.LINKS.list({ prefix: "link:" });

      for (const k of keys.keys) {
        const val = await env.LINKS.get(k.name);
        if (val) list.push(JSON.parse(val));
      }

      list.sort((a, b) => b.ts - a.ts);

      const sanitizeHtml = (html) => {
        if (!html) return '';
        // remove script tags
        let s = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
        // remove inline event handlers like onclick=
        s = s.replace(/ on\w+=("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
        // neutralize javascript: hrefs
        s = s.replace(/href=("javascript:[^"]*"|'javascript:[^']*')/gi, 'href="#"');
        // strip out iframes and video tags from scraped HTML to avoid layout and security issues
        s = s.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '');
        s = s.replace(/<video[\s\S]*?>[\s\S]*?<\/video>/gi, '');
        return s;
      };

      // Group entries by domain and dedupe identical URLs; sum votes per domain and per-URL
      const esc = (s) => (s || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // Show one entry per link, not per domain
      const links = list.sort((a, b) => b.ts - a.ts);
      const entries = links.map(item => {
        const title = (item.meta && item.meta.title) ? item.meta.title : (item.domain || (item.url ? new URL(item.url).hostname : 'unknown'));
        const domain = item.domain || (item.url ? new URL(item.url).hostname : 'unknown');
        const rendered = sanitizeHtml(mdToHtml(item.body || ''));
        const encoded = encodeURIComponent(rendered);
        // YouTube video preview if applicable
        let videoEmbed = '';
        const ytMatch = item.url && item.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        if (ytMatch) {
          const ytId = ytMatch[1];
          videoEmbed = `<div class="video" style="margin-bottom:1rem"><iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/${ytId}" frameborder="0" allowfullscreen sandbox="allow-same-origin allow-scripts"></iframe></div>`;
        }
        return `
        <details>
          <summary class="ls-summary">
            <span class="ls-title"><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a></span>
            <span class="ls-domain">${esc(domain)}</span>
          </summary>
          <div style="margin-bottom:0.5rem">
            ${videoEmbed}
            <div class="lazy-content" data-html="${encoded}"><div class="lazy-placeholder">Click to load</div></div>
            <div class="meta"><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Visit</a></div>
          </div>
        </details>
        `;
      }).join('');

      return new Response(
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HSP Linkstash - Preview</title>
  <meta name="description" content="Collect and share interesting links and articles you find during the week!">
  <meta property="og:title" content="HSP Linkstash" />
  <meta property="og:description" content="Collect and share interesting links and articles you find during the week!" />
  <meta property="og:image" content="https://raw.githubusercontent.com/homebrew-ec-foss/linkstash/refs/heads/main/linkstash-preview.png" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://linkstash.hsp-ec.xyz/" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="HSP Linkstash" />
  <meta name="twitter:description" content="Collect and share interesting links and articles you find during the week!" />
  <meta name="twitter:image" content="https://raw.githubusercontent.com/homebrew-ec-foss/linkstash/refs/heads/main/linkstash-preview.png" />
<style>
/* Linkstash summary flex layout for desktop/mobile */
.ls-summary {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  line-height: 1.25;
  padding-bottom: 2px;
}
.ls-title {
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
}
.ls-domain {
  font-size: 13px;
  color: #9aa6bf;
  font-weight: 400;
  flex-shrink: 0;
  margin-left: auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 600px) {
  .ls-summary {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }
  .ls-domain {
    margin-left: 0;
    margin-top: 2px;
    white-space: normal;
  }
}
:root{
  --bg:#ffffff; --panel:#ffffff; --muted:#6a6a6a; --accent:#ff6600; --text:#111111; --link:#000000;
}
*{box-sizing:border-box}
html,body{height:100%}
body {
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
  background: var(--bg);
  color: var(--text);
  max-width: 800px;
  margin: 1rem auto;
  padding: 0;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
  font-size: 15px;
  line-height:1.4;
} 

/* Header (simple, HN-like) */
.header-bar{background:var(--accent); color:#fff; padding:10px 14px; display:flex; align-items:center; justify-content:space-between;}
.header-left{display:flex; align-items:center; gap:0.5rem; font-weight:700; font-size:18px}
.header-right{font-size:14px; color:rgba(255,255,255,0.95)}

/* Entries as compact numbered list */
.details-list{ counter-reset:item; border:1px solid #e9e9e9; border-radius:3px; overflow:hidden; }
.details-list details{ counter-increment:item; padding:12px 14px; display:block; border-top:1px solid #f2f2f2; background:transparent; }
.details-list details:first-child{ border-top:none; }
.details-list summary{ list-style:none; cursor:pointer; font-size:16px; color:var(--link); font-weight:700; display:block; padding:0; }
.details-list summary, .details-list a {
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .details-list summary, .details-list a {
    font-size: 15px;
    word-break: break-word;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.3;
    display: block;
  }
  .details-list summary {
    padding-right: 0;
  }
}
.details-list summary::before{ content: counter(item) '.'; display:inline-block; width:2rem; margin-right:8px; color:var(--muted); font-weight:600; }
.details-list a{ color:var(--link); text-decoration:none; }
.details-list a:hover{text-decoration:underline;}
.details-list .meta { color:var(--muted); font-size:13px; margin-top:6px }

/* Markdown body - compact */
.markdown-body{ color:var(--text); margin-top:8px; font-size:14px; line-height:1.45 }
.markdown-body p{ margin:0.35rem 0; color:var(--text); }
.markdown-body a{ color:#0645ad }
.markdown-body img{ max-width:100%; height:auto; display:block; margin:8px 0; }
.markdown-body pre{ background:#f6f6f6; padding:8px; border-radius:4px; overflow:auto; font-size:13px }
.markdown-body code{ background:#f2f2f2; padding:0.12rem 0.28rem; border-radius:3px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', monospace }

/* Lazy-load placeholder */
.lazy-placeholder{ color:var(--muted); font-size:13px; padding:6px 0; }

/* Keep styling consistent on all sizes (simple theming) */
@media (max-width:760px){
  body{ padding:0 10px; font-size:14px; }
  .header-left{font-size:16px}
  details{ padding:10px 8px }
  .markdown-body{ font-size:13px }
}

@media (max-width:420px){
  body{ padding:0 8px; font-size:13px }
  details{ padding:9px 8px }
  .markdown-body{ font-size:13px; }
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:#0f1115;
    --panel:#0b0d11;
    --muted:#9aa6bf;
    --accent:#ff6600;
    --text:#e6e6e6;
    --link:#8ab4ff;
  }
  body { background: var(--bg); color: var(--text); }
  .header-bar { background: var(--accent); color: #fff; }
  .details-list { border-color: rgba(255,255,255,0.05); }
  .details-list details { border-top-color: rgba(255,255,255,0.03); }
  .markdown-body pre { background:#050507; color: #e6e6e6; }
  .markdown-body code { background: rgba(255,255,255,0.03); color: #e6e6e6; }
  .header-right { color: rgba(255,255,255,0.95); }

}
</style>
</head>
<body>
<div class="header-bar">
  <div class="header-left">HSP-Linkstash</div>
  <div class="header-right"><small style="color:rgba(255,255,255,0.95)">API Status: <span id="health-status">checking…</span></small></div>
</div>

<h2 style="margin-top:2rem">Top Links this Week</h2>
<div class="details-list">
${entries}
</div>

<script>
(async function(){
  try {
    const res = await fetch('/api/health');
    const j = await res.json();
    const el = document.getElementById('health-status');
    if (!el) return;
    if (j.ok && j.remote && j.remote.status === 'ok') {
      el.innerHTML = '<span style="color:var(--accent)">●</span> OK — ' + new Date(j.remote.timestamp).toLocaleString();
    } else if (j.ok && j.remote) {
      el.innerHTML = '<span style="color:#ff6b6b">●</span> ' + (j.remote.status || 'unknown') + ' — ' + (j.remote.timestamp ? new Date(j.remote.timestamp).toLocaleString() : '');
    } else {
      el.innerHTML = '<span style="color:#ff6b6b">●</span> DOWN';
    }
  } catch (e) {
    const el = document.getElementById('health-status');
    if (el) el.innerHTML = '<span style="color:#ff6b6b">●</span> error';
  }
})();

// Lazy-load details content: populate .lazy-content when a details element is opened
(function(){
  function populateLazy(detail){
    const lazy = detail.querySelector('.lazy-content');
    if (!lazy) return;
    if (lazy.dataset.rendered) return;
    const enc = lazy.dataset.html || '';
    if (!enc) return;
    try {
      lazy.innerHTML = decodeURIComponent(enc);
      lazy.dataset.rendered = '1';
    } catch (e) {
      lazy.innerHTML = '<div class="lazy-placeholder">Error loading content</div>';
      lazy.dataset.rendered = '1';
    }
  }

  document.querySelectorAll('details').forEach(d => {
    d.addEventListener('toggle', (e) => {
      if (d.open) populateLazy(d);
    });
    // Also allow clicking summary to populate immediately on keyboard activation
    const s = d.querySelector('summary');
    if (s) s.addEventListener('click', () => { if (!d.open) return; populateLazy(d); });
  });
})();

</script>

</body>
</html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    return new Response("Not found", { status: 404 });
  }
};

