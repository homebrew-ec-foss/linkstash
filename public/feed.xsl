<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:atom="http://www.w3.org/2005/Atom">
  <xsl:output method="html" version="5.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml" lang="en">
      <head>
        <title><xsl:value-of select="/rss/channel/title"/> Web Feed</title>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
        <style type="text/css">
* {
  box-sizing: border-box;
}

:root {
  --bg: #fafafa;
  --text: #111827;
  --muted: #9ca3af;
  --card: #ffffff;
  --border: #e6e6e6;
  --brand: #ff6a00;
  --brand-text: #ffffff;
  --link: #4f46e5;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b1220;
    --text: #e6eef6;
    --muted: #9aa4b2;
    --card: #0f1724;
    --border: rgba(255, 255, 255, 0.06);
    --brand: #ff7a29;
    --brand-text: #0b1220;
    --link: #7c8fff;
  }
}

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
  line-height: 1.22;
  transition: background 150ms ease, color 150ms ease;
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 16px;
}

@media (min-width: 1024px) {
  .container {
    padding: 0 24px;
  }
}

a {
  color: var(--link);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

h1, h2, h3, h4, h5, h6 {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  line-height: 1.3;
}

h1 {
  font-size: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 0;
}

h2 {
  font-size: 18px;
}

h3 {
  font-size: 15px;
  margin: 0 0 8px 0;
}

p {
  margin: 8px 0;
}

strong {
  font-weight: 600;
}

hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 16px 0;
}

.info-banner {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  margin: 16px 0;
  font-size: 13px;
  line-height: 1.5;
}

header {
  padding: 24px 0;
  margin-bottom: 24px;
}

header h2 {
  margin-top: 0;
  margin-bottom: 8px;
  color: var(--brand);
}

header p {
  margin: 8px 0;
  color: var(--muted);
}

.head_link {
  display: inline-block;
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--brand);
  color: var(--brand-text);
  border-radius: 4px;
  font-weight: 500;
  text-decoration: none;
}

.head_link:hover {
  text-decoration: underline;
}

.item {
  padding: 16px 0;
  border-bottom: 1px solid var(--border);
}

.item:last-child {
  border-bottom: none;
}

.item h3 {
  margin: 0 0 8px 0;
  font-size: 15px;
  font-weight: 600;
}

.item a {
  color: var(--link);
}

.item a:hover {
  text-decoration: underline;
}

.item-meta {
  font-size: 12px;
  color: var(--muted);
  margin: 8px 0;
}

.item-description {
  font-size: 13px;
  color: var(--text);
  margin: 8px 0;
  line-height: 1.5;
}

.item-description p {
  margin: 4px 0;
}

.item-description a {
  color: var(--link);
}

.item-description strong {
  font-weight: 600;
}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="info-banner">
            <strong>This is a web feed,</strong> also known as an RSS feed. <strong>Subscribe</strong> by copying the URL from the address bar into your newsreader.
          </div>

          <h2>What is an RSS feed?</h2>
          <p>
            An RSS feed is a data format that contains the latest content from a website, blog, or podcast. You can use feeds to <strong>subscribe</strong> to websites and get the <strong>latest content in one place</strong>.
          </p>
          <p>
            All you need to do to get started is to add the URL (web address) for this feed to a special app called a newsreader. Visit <a href="https://aboutfeeds.com/">About Feeds</a> to get started with newsreaders and subscribing. It's free.
          </p>

          <hr />

          <header>
            <h1>
              <svg xmlns="http://www.w3.org/2000/svg" version="1.1" style="vertical-align: text-bottom; width: 1.2em; height: 1.2em;" id="RSSicon" viewBox="0 0 256 256">
                <defs>
                  <linearGradient x1="0.085" y1="0.085" x2="0.915" y2="0.915" id="RSSg">
                    <stop offset="0.0" stop-color="#E3702D"/><stop offset="0.1071" stop-color="#EA7D31"/>
                    <stop offset="0.3503" stop-color="#F69537"/><stop offset="0.5" stop-color="#FB9E3A"/>
                    <stop offset="0.7016" stop-color="#EA7C31"/><stop offset="0.8866" stop-color="#DE642B"/>
                    <stop offset="1.0" stop-color="#D95B29"/>
                  </linearGradient>
                </defs>
                <rect width="256" height="256" rx="55" ry="55" x="0" y="0" fill="#CC5D15"/>
                <rect width="246" height="246" rx="50" ry="50" x="5" y="5" fill="#F49C52"/>
                <rect width="236" height="236" rx="47" ry="47" x="10" y="10" fill="url(#RSSg)"/>
                <circle cx="68" cy="189" r="24" fill="#FFF"/>
                <path d="M160 213h-34a82 82 0 0 0 -82 -82v-34a116 116 0 0 1 116 116z" fill="#FFF"/>
                <path d="M184 213A140 140 0 0 0 44 73 V 38a175 175 0 0 1 175 175z" fill="#FFF"/>
              </svg>
              Web Feed
            </h1>
            <h2><xsl:value-of select="/rss/channel/title"/></h2>
            <p><xsl:value-of select="/rss/channel/description"/></p>
            <a class="head_link" target="_blank">
              <xsl:attribute name="href">
                <xsl:value-of select="/rss/channel/link"/>
              </xsl:attribute>
              Visit Website →
            </a>
          </header>

          <h2>Recent Items</h2>
          <xsl:for-each select="/rss/channel/item">
            <div class="item">
              <h3>
                <a target="_blank">
                  <xsl:attribute name="href">
                    <xsl:value-of select="link"/>
                  </xsl:attribute>
                  <xsl:value-of select="title"/>
                </a>
              </h3>
              <div class="item-meta">
                Published: <xsl:value-of select="pubDate"/>
              </div>
              <xsl:if test="author">
                <div class="item-meta">
                  By: <xsl:value-of select="author"/>
                </div>
              </xsl:if>
              <xsl:if test="description">
                <div class="item-description">
                  <xsl:value-of select="description" disable-output-escaping="yes"/>
                </div>
              </xsl:if>
            </div>
          </xsl:for-each>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
