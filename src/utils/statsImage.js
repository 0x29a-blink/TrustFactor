const puppeteer = require('puppeteer');
const logger = require('./logger');

// Persistent renderer state
let browser = null;
let page = null;
let initPromise = null;
let queue = Promise.resolve();

async function ensureRenderer(options = {}) {
  if (page && typeof page.isClosed === 'function' && !page.isClosed()) {
    return page;
  }
  if (!initPromise) {
    initPromise = (async () => {
      try {
        if (!browser) {
          browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: 'new',
          });
        }
        page = await browser.newPage();
        const width = options.width || 1200;
        const height = options.height || 680;
        await page.setViewport({ width, height, deviceScaleFactor: 2 });
        return page;
      } catch (error) {
        // Reset state so next call can retry
        try { await browser?.close(); } catch (_) {}
        browser = null; page = null; initPromise = null;
        throw error;
      }
    })();
  }
  await initPromise;
  return page;
}

async function runExclusive(fn) {
  const task = queue.then(fn, fn);
  // Prevent unhandled rejections from breaking the chain
  queue = task.then(() => {}, () => {});
  return task;
}

function formatNumber(n) {
  try {
    return Number(n).toLocaleString();
  } catch (_) {
    return String(n);
  }
}

function buildHtml(stats) {
  const {
    shards,
    serverCount,
    uptime,
    cpuPct,
    memPct,
    pointsGranted,
    pointsRemovedAbs,
    totalVotes,
  } = stats;

  // Sanitize basic values
  const safe = {
    shards: formatNumber(shards ?? 1),
    servers: formatNumber(serverCount ?? 0),
    uptime: uptime || '0s',
    cpu: `${(cpuPct ?? 0).toFixed(1)}%`,
    mem: `${(memPct ?? 0).toFixed(1)}%`,
    granted: formatNumber(pointsGranted ?? 0),
    removed: formatNumber(pointsRemovedAbs ?? 0),
    votes: formatNumber(totalVotes ?? 0),
    timestamp: new Date().toLocaleString(),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TrustFactor Bot — Stats</title>
  <style>
    :root {
      --bg: #0b1020;
      --card: #121935;
      --muted: #9aa4bf;
      --primary: #5865F2; /* Discord blurple */
      --success: #2ecc71;
      --danger: #e74c3c;
      --warning: #f1c40f;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      width: 1200px; height: 680px;
      background:
        radial-gradient(1200px 800px at 1000px -100px, rgba(88,101,242,0.16), transparent),
        radial-gradient(900px 600px at 100px 780px, rgba(46,204,113,0.14), transparent),
        var(--bg);
      color: #fff; font-family: 'Segoe UI', Roboto, Inter, system-ui, -apple-system, Arial, sans-serif;
      display: flex; flex-direction: column; padding: 24px 26px; gap: 16px;
    }
    .board-title { text-align: center; font-size: 26px; font-weight: 900; letter-spacing: 0.4px; color: #e8ecff; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 1fr; gap: 14px; }
    .card { background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 18px; box-shadow: 0 12px 40px rgba(0,0,0,0.28) inset; display: flex; flex-direction: column; gap: 10px; justify-content: center; }
    .k { font-size: 12px; text-transform: uppercase; letter-spacing: 0.7px; color: var(--muted); font-weight: 800; }
    .v { font-size: 40px; font-weight: 900; letter-spacing: 0.2px; line-height: 1.05; }
    .row { display: flex; align-items: center; justify-content: space-between; }
    .progress { width: 100%; height: 12px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; }
    .progress .bar { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #6c77ff, #4c56e9); }
    .progress.mem .bar { background: linear-gradient(90deg, #f5c84b, #ff9f43); }
    .foot { display: flex; align-items: center; justify-content: space-between; color: var(--muted); font-size: 12px; margin-top: 8px; }
    .pair { display: flex; gap: 8px; align-items: baseline; }
    .pair .pos { color: var(--success); font-weight: 800; }
    .pair .neg { color: var(--danger); font-weight: 800; }
  </style>
  </head>
  <body>
    <div class="board-title">TrustFactor • Live Stats</div>
    <div class="grid">
      <!-- Row 1 -->
      <div class="card"><div class="k">Shards</div><div class="v">${safe.shards}</div></div>
      <div class="card"><div class="k">Server Count</div><div class="v">${safe.servers}</div></div>
      <div class="card"><div class="k">Uptime</div><div class="v">${safe.uptime}</div></div>
      <!-- Row 2 -->
      <div class="card"><div class="k">Total Votes Cast</div><div class="v">${safe.votes}</div></div>
      <div class="card"><div class="k">Points Granted</div><div class="v" style="color: var(--success);">+${safe.granted}</div></div>
      <div class="card"><div class="k">Points Removed</div><div class="v" style="color: var(--danger);">-${safe.removed}</div></div>
      <!-- Row 3 -->
      <div class="card">
        <div class="k">CPU Usage</div>
        <div class="v">${safe.cpu}</div>
        <div class="progress"><div class="bar" style="width:${Math.min(100, Number(stats.cpuPct || 0)).toFixed(1)}%"></div></div>
      </div>
      <div class="card">
        <div class="k">Memory Usage</div>
        <div class="v">${safe.mem}</div>
        <div class="progress mem"><div class="bar" style="width:${Math.min(100, Number(stats.memPct || 0)).toFixed(1)}%"></div></div>
      </div>
    </div>
    <div class="foot">
      <div class="pair"><span>Points</span><span class="pos">+${safe.granted}</span><span class="neg">-${safe.removed}</span></div>
      <div>Updated • ${safe.timestamp}</div>
    </div>
  </body>
  </html>`;
}

async function renderStatsImage(stats, options = {}) {
  const width = options.width || 1200;
  const height = options.height || 680;
  const html = buildHtml(stats);

  return runExclusive(async () => {
    try {
      const p = await ensureRenderer({ width, height });
      // Ensure viewport matches requested options
      const vp = p.viewport() || {};
      if (vp.width !== width || vp.height !== height) {
        await p.setViewport({ width, height, deviceScaleFactor: 2 });
      }
      await p.setContent(html, { waitUntil: 'load' });
      const buffer = await p.screenshot({ type: 'png' });
      return buffer;
    } catch (error) {
      logger.errorWithStack('Failed to render stats image', error, 'RENDER');
      // Try to reset renderer state for next call
      try { await page?.close(); } catch (_) {}
      try { await browser?.close(); } catch (_) {}
      browser = null; page = null; initPromise = null;
      throw error;
    }
  });
}

async function warmStatsRenderer(options = {}) {
  try {
    await ensureRenderer(options);
    return true;
  } catch (error) {
    logger.errorWithStack('Failed to warm stats renderer', error, 'RENDER');
    return false;
  }
}

async function shutdownStatsRenderer() {
  try {
    if (page) { try { await page.close(); } catch (_) {} }
    if (browser) { try { await browser.close(); } catch (_) {} }
  } finally {
    browser = null; page = null; initPromise = null; queue = Promise.resolve();
  }
}

module.exports = {
  renderStatsImage,
  warmStatsRenderer,
  shutdownStatsRenderer,
  buildHtml,
};


