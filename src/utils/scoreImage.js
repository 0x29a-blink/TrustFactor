const { renderHtmlToImage } = require('./htmlRenderer');
const { escapeHtml, formatTextWithEmojis } = require('./textFormatting');
const logger = require('./logger');

const WIDTH = 800;
const HEIGHT = 850;

const COLORS = {
  bg: '#090b10',
  cardBg: '#161b2e',
  accent: '#5865F2',
  success: '#2ecc71',
  danger: '#e74c3c',
  warning: '#f1c40f',
  textTitle: '#ffffff',
  textLabel: '#8b9bb4',
  textValue: '#ffffff',
  border: 'rgba(255,255,255,0.08)',
  divider: 'rgba(255,255,255,0.04)',
  rowBg: 'rgba(255,255,255,0.02)',
  rowBgAlt: 'rgba(255,255,255,0.04)',
};

function getTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds}s ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  }
}

async function renderScoreImage(data) {
  try {
    const { 
      targetUser, 
      currentScore, 
      totalChanges, 
      viewMode, 
      history, 
      page, 
      totalPages,
      syncStatus
    } = data;

    const safeUsername = formatTextWithEmojis(targetUser.globalName || targetUser.username);
    const avatarUrl = targetUser.displayAvatarURL({ extension: 'png', size: 128 });

    // Calculate score color
    let scoreColor = COLORS.textValue;
    if (currentScore > 0) scoreColor = COLORS.success;
    if (currentScore < 0) scoreColor = COLORS.danger;

    // Generate history rows
    const historyRowsHtml = history.map((entry, index) => {
      const isPositive = entry.point_change > 0;
      const changeColor = isPositive ? COLORS.success : COLORS.danger;
      const changeSign = isPositive ? '+' : '';
      const rowBg = index % 2 === 0 ? COLORS.rowBg : COLORS.rowBgAlt;
      
      const safeReason = formatTextWithEmojis(entry.reason || 'No reason provided');
      const timeAgo = getTimeAgo(entry.created_at);

      return `
        <div class="history-row" style="background: ${rowBg}">
          <div class="row-index">${index + 1}</div>
          <div class="row-change" style="color: ${changeColor}">${changeSign}${entry.point_change}</div>
          <div class="row-reason">${safeReason}</div>
          <div class="row-time">${timeAgo}</div>
        </div>
      `;
    }).join('');

    const viewModeLabel = viewMode.charAt(0).toUpperCase() + viewMode.slice(1);
    
    let syncHtml = '';
    if (syncStatus) {
      syncHtml = `
        <div class="sync-badge">
          SYNCED: ${escapeHtml(syncStatus.sync_groups.group_name)}
        </div>
      `;
    }

    const html = `
      <style>
        body {
          font-family: 'Segoe UI', Roboto, sans-serif;
          background-color: ${COLORS.bg};
          color: ${COLORS.textValue};
          width: ${WIDTH}px;
          height: ${HEIGHT}px;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .bg-gradient {
          position: absolute;
          top: -50%; right: -50%;
          width: 100%; height: 100%;
          background: radial-gradient(circle at center, rgba(88, 101, 242, 0.1) 0%, transparent 70%);
          transform: scale(2);
          pointer-events: none;
        }

        .header {
          padding: 30px 40px;
          display: flex;
          align-items: center;
          gap: 25px;
          background: ${COLORS.cardBg};
          border-bottom: 1px solid ${COLORS.border};
        }

        .avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 3px solid ${COLORS.border};
        }

        .user-info {
          flex: 1;
        }

        .username {
          font-size: 32px;
          font-weight: 800;
          color: ${COLORS.textTitle};
          margin-bottom: 6px;
        }

        .stats-mini {
          display: flex;
          gap: 20px;
          font-size: 14px;
          color: ${COLORS.textLabel};
          font-weight: 600;
        }

        .score-box {
          text-align: right;
        }

        .score-label {
          font-size: 13px;
          color: ${COLORS.textLabel};
          font-weight: 700;
          text-transform: uppercase;
        }

        .score-value {
          font-size: 48px;
          font-weight: 900;
          color: ${scoreColor};
          line-height: 1;
        }

        .content {
          flex: 1;
          padding: 30px 40px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .section-title {
          font-size: 14px;
          color: ${COLORS.textLabel};
          font-weight: 700;
          text-transform: uppercase;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .history-row {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          border-radius: 10px;
          gap: 16px;
        }

        .row-index {
          font-family: monospace;
          font-weight: 700;
          color: ${COLORS.textLabel};
          width: 24px;
          text-align: center;
          background: rgba(255,255,255,0.05);
          border-radius: 4px;
          padding: 2px 0;
          font-size: 14px;
        }

        .row-change {
          font-weight: 800;
          font-size: 20px;
          width: 60px;
          text-align: right;
        }

        .row-reason {
          flex: 1;
          font-size: 16px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .row-time {
          font-size: 14px;
          color: ${COLORS.textLabel};
          width: 70px;
          text-align: right;
        }

        .footer {
          padding: 20px 40px;
          background: rgba(0,0,0,0.2);
          border-top: 1px solid ${COLORS.border};
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 13px;
          color: ${COLORS.textLabel};
        }

        .sync-badge {
          background: rgba(88, 101, 242, 0.2);
          color: #8ea1e1;
          padding: 3px 10px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 12px;
        }

        .custom-emoji {
          height: 1.2em;
          width: auto;
          vertical-align: -0.25em;
          display: inline-block;
        }
        
        .empty-state {
          text-align: center;
          color: ${COLORS.textLabel};
          font-style: italic;
          margin-top: 60px;
          font-size: 16px;
        }
      </style>

      <div class="bg-gradient"></div>

      <div class="header">
        <img class="avatar" src="${avatarUrl}" />
        <div class="user-info">
          <div class="username">${safeUsername}</div>
          <div class="stats-mini">
             <span>TOTAL CHANGES: ${totalChanges}</span>
             <span>VIEW: ${viewModeLabel.toUpperCase()}</span>
          </div>
          ${syncHtml}
        </div>
        <div class="score-box">
          <div class="score-label">CURRENT SCORE</div>
          <div class="score-value">${currentScore}</div>
        </div>
      </div>

      <div class="content">
        <div class="section-title">
          <span>HISTORY</span>
          <span>PAGE ${page + 1}/${totalPages}</span>
        </div>
        
        ${history.length > 0 ? `
          <div class="history-list">
            ${historyRowsHtml}
          </div>
        ` : `
          <div class="empty-state">No score changes found for this view.</div>
        `}
      </div>

      <div class="footer">
        <div>${new Date().toLocaleString()}</div>
      </div>
    `;

    return await renderHtmlToImage(html, WIDTH, HEIGHT);
  } catch (error) {
    logger.errorWithStack('Failed to render score image', error, 'RENDER');
    throw error;
  }
}

module.exports = { renderScoreImage };
