const { renderHtmlToImage } = require('./htmlRenderer');
const logger = require('./logger');

const WIDTH = 500;
const HEIGHT = 400;

const COLORS = {
  bg: '#090b10',         // Very dark blue/black
  cardBg: '#161b2e',     // Main card background
  accent: '#5865F2',     // Discord Blurple
  success: '#2ecc71',
  danger: '#e74c3c',
  warning: '#f1c40f',
  textTitle: '#ffffff',
  textLabel: '#8b9bb4',  // Muted blue-grey
  textValue: '#ffffff',
  border: 'rgba(255,255,255,0.08)',
  divider: 'rgba(255,255,255,0.04)',
  systemBg: 'rgba(0, 0, 0, 0.2)'
};

function formatNumber(n) {
  try {
    return Number(n).toLocaleString();
  } catch (_) {
    return String(n);
  }
}

async function renderStatsImage(stats, options = {}) {
  try {
    const width = options.width || WIDTH;
    const height = options.height || HEIGHT;

    const {
      shards, serverCount, uptime, cpuPct, memPct,
      pointsGranted, pointsRemovedAbs, totalVotes
    } = stats;

    const safe = {
      shards: formatNumber(shards ?? 1),
      servers: formatNumber(serverCount ?? 0),
      uptime: uptime || '0s',
      cpu: Math.min(100, Number(cpuPct || 0)),
      mem: Math.min(100, Number(memPct || 0)),
      granted: formatNumber(pointsGranted ?? 0),
      removed: formatNumber(pointsRemovedAbs ?? 0),
      votes: formatNumber(totalVotes ?? 0),
      timestamp: new Date().toLocaleString(),
    };

    const html = `
      <style>
        body {
          font-family: 'Segoe UI', Roboto, sans-serif;
          background-color: ${COLORS.cardBg};
          color: ${COLORS.textValue};
          width: ${width}px;
          height: ${height}px;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        /* Background Gradients */
        .bg-gradient-1 {
          position: absolute;
          top: 0; right: 0;
          width: 400px; height: 400px;
          background: radial-gradient(circle at center, rgba(88, 101, 242, 0.06) 0%, transparent 70%);
          transform: translate(30%, -30%);
          pointer-events: none;
        }
        .bg-gradient-2 {
          position: absolute;
          bottom: 0; left: 0;
          width: 300px; height: 300px;
          background: radial-gradient(circle at center, rgba(46, 204, 113, 0.04) 0%, transparent 70%);
          transform: translate(-30%, 30%);
          pointer-events: none;
        }

        /* Header */
        .header {
          text-align: center;
          padding-top: 20px;
          z-index: 1;
        }
        .title {
          font-size: 22px;
          font-weight: 900;
          color: ${COLORS.textTitle};
        }
        .subtitle {
          font-size: 12px;
          font-weight: 500;
          color: ${COLORS.textLabel};
          margin-top: 2px;
        }

        /* Meta Stats */
        .meta-stats {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-top: 20px;
          gap: 20px;
          position: relative;
          z-index: 1;
        }
        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .meta-label {
          font-size: 11px;
          font-weight: 600;
          color: ${COLORS.textLabel};
        }
        .meta-value {
          font-size: 12px;
          font-weight: 600;
          color: ${COLORS.textValue};
        }
        .meta-left { text-align: right; }
        .meta-right { text-align: left; }
        
        .divider {
          height: 1px;
          background: ${COLORS.divider};
          margin: 10px 40px;
        }

        /* Grid Layout for Hero & Points */
        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          padding: 10px 0;
          z-index: 1;
        }
        .stat-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 10px 0;
        }
        
        /* Hero Stats */
        .hero-label {
          font-size: 11px;
          font-weight: 700;
          color: ${COLORS.accent};
          margin-bottom: 4px;
        }
        .hero-value {
          font-size: 36px;
          font-weight: 800;
          color: ${COLORS.textValue};
          line-height: 1;
        }

        /* Points Stats */
        .point-label {
          font-size: 10px;
          font-weight: 600;
          color: ${COLORS.textLabel};
          margin-bottom: 4px;
        }
        .point-value {
          font-size: 20px;
          font-weight: 700;
        }

        /* System Footer */
        .footer-section {
          margin-top: auto;
          height: 110px;
          background: ${COLORS.systemBg};
          border-top: 1px solid ${COLORS.border};
          padding: 20px 50px;
          display: flex;
          flex-direction: column;
          gap: 15px;
          z-index: 1;
        }

        .progress-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .progress-header {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          font-weight: 600;
        }
        .progress-label { color: ${COLORS.textLabel}; text-transform: uppercase; }
        .progress-percent { color: ${COLORS.textValue}; }
        
        .progress-track {
          height: 6px;
          width: 100%;
          background: rgba(255,255,255,0.05);
          border-radius: 3px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          border-radius: 3px;
        }

        .timestamp {
          text-align: center;
          color: ${COLORS.textLabel};
          font-size: 9px;
          margin-top: 6px;
        }
      </style>

      <div class="bg-gradient-1"></div>
      <div class="bg-gradient-2"></div>

      <div class="header">
        <div class="title">TRUSTFACTOR</div>
        <div class="subtitle">SYSTEM ANALYTICS</div>
      </div>

      <div class="meta-stats">
        <div class="meta-item meta-left">
          <div class="meta-label">UPTIME:</div>
          <div class="meta-value">${safe.uptime}</div>
        </div>
        <div class="meta-item meta-right">
          <div class="meta-label">SHARDS:</div>
          <div class="meta-value">${safe.shards}</div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="stats-grid">
        <div class="stat-cell">
          <div class="hero-label">ACTIVE SERVERS</div>
          <div class="hero-value">${safe.servers}</div>
        </div>
        <div class="stat-cell">
          <div class="hero-label">TOTAL VOTES</div>
          <div class="hero-value">${safe.votes}</div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-cell">
          <div class="point-label">POINTS GRANTED</div>
          <div class="point-value" style="color: ${COLORS.success}">+${safe.granted}</div>
        </div>
        <div class="stat-cell">
          <div class="point-label">POINTS REMOVED</div>
          <div class="point-value" style="color: ${COLORS.danger}">-${safe.removed}</div>
        </div>
      </div>

      <div class="footer-section">
        <div class="progress-row">
          <div class="progress-header">
            <span class="progress-label">CPU Load</span>
            <span class="progress-percent">${safe.cpu.toFixed(1)}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${safe.cpu}%; background-color: ${COLORS.accent}"></div>
          </div>
        </div>

        <div class="progress-row">
          <div class="progress-header">
            <span class="progress-label">Memory Usage</span>
            <span class="progress-percent">${safe.mem.toFixed(1)}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${safe.mem}%; background-color: ${COLORS.warning}"></div>
          </div>
        </div>

        <div class="timestamp">Generated at: ${safe.timestamp}</div>
      </div>
    `;

    return await renderHtmlToImage(html, width, height);
  } catch (error) {
    logger.errorWithStack('Failed to render stats image', error, 'RENDER');
    throw error;
  }
}

// Shims - these are no longer needed with htmlRenderer, but kept for API compatibility
async function warmStatsRenderer() { return true; }
async function shutdownStatsRenderer() { return true; }

module.exports = {
  renderStatsImage,
  warmStatsRenderer,
  shutdownStatsRenderer,
};
