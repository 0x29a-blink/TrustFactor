const { renderHtmlToImage } = require('./htmlRenderer');
const { formatTextWithEmojis } = require('./textFormatting');
const logger = require('./logger');

const WIDTH = 800;
const ROW_HEIGHT = 60;
const HEADER_HEIGHT = 100;
const FOOTER_HEIGHT = 60;

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
    rowEven: 'rgba(255,255,255,0.02)'
};

function formatNumber(n) {
    try {
        return Number(n).toLocaleString();
    } catch (_) {
        return String(n);
    }
}

async function renderLeaderboardImage(data, options = {}) {
    try {
        const { title, description, entries, filterType, totalUsers } = data;
        
        // Calculate dynamic height
        const minContentHeight = 300;
        const contentHeight = Math.max(entries.length * ROW_HEIGHT, minContentHeight);
        const height = HEADER_HEIGHT + contentHeight + FOOTER_HEIGHT;

        const badgeColor = filterType === 'positive' ? COLORS.success :
                          filterType === 'negative' ? COLORS.danger :
                          filterType === 'recent' ? COLORS.warning : COLORS.accent;

        const rowsHtml = entries.length === 0 
            ? `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <div class="empty-title">No users found for this filter</div>
                    <div class="empty-desc">Try adjusting the filter or page limit</div>
                </div>
            `
            : entries.map((entry, i) => {
                const rank = i + 1;
                let rankColor = COLORS.textLabel;
                if (rank === 1) rankColor = '#FFD700';
                else if (rank === 2) rankColor = '#C0C0C0';
                else if (rank === 3) rankColor = '#CD7F32';

                const scoreColor = entry.score > 0 ? COLORS.success : entry.score < 0 ? COLORS.danger : COLORS.textValue;
                const avatarSrc = entry.avatarUrl || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiMxNjFiMmUiLz48L3N2Zz4=';
                
                const safeDisplayName = formatTextWithEmojis(entry.displayName);

                return `
                    <div class="row ${i % 2 === 0 ? 'even' : ''}">
                        <div class="rank" style="color: ${rankColor}">#${rank}</div>
                        <div class="avatar-container">
                            <img src="${avatarSrc}" class="avatar" onerror="this.style.display='none'" />
                        </div>
                        <div class="name">${safeDisplayName}</div>
                        <div class="score-container">
                            <span class="score" style="color: ${scoreColor}">${entry.score > 0 ? '+' : ''}${formatNumber(entry.score)}</span>
                            <span class="pts">PTS</span>
                        </div>
                    </div>
                `;
            }).join('');

        const html = `
            <style>
                body {
                    background-color: ${COLORS.bg};
                    color: ${COLORS.textValue};
                    font-family: 'Noto Sans', 'Roboto', sans-serif;
                    display: flex;
                    flex-direction: column;
                    border-radius: 16px;
                    overflow: hidden;
                }
                .custom-emoji {
                    height: 1.2em;
                    width: auto;
                    vertical-align: -0.25em;
                }
                .header {
                    height: ${HEADER_HEIGHT}px;
                    background-color: ${COLORS.cardBg};
                    padding: 0 40px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    border-bottom: 1px solid ${COLORS.border};
                    position: relative;
                }
                .header-content {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    max-width: 600px;
                }
                .title {
                    font-size: 32px;
                    font-weight: 700;
                    color: ${COLORS.textTitle};
                    text-transform: uppercase;
                }
                .desc {
                    font-size: 16px;
                    color: ${COLORS.textLabel};
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .badge {
                    background: rgba(255,255,255,0.1);
                    padding: 8px 20px;
                    border-radius: 20px;
                    color: ${badgeColor};
                    font-weight: 700;
                    font-size: 14px;
                    text-transform: uppercase;
                }
                .content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: linear-gradient(180deg, rgba(88, 101, 242, 0.05) 0%, rgba(0,0,0,0) 100%);
                }
                .row {
                    height: ${ROW_HEIGHT}px;
                    display: flex;
                    align-items: center;
                    padding: 0 40px;
                }
                .row.even {
                    background-color: ${COLORS.rowEven};
                }
                .rank {
                    width: 60px;
                    font-size: 24px;
                    font-weight: 700;
                    text-align: center;
                }
                .avatar-container {
                    width: 60px;
                    display: flex;
                    justify-content: center;
                }
                .avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    object-fit: cover;
                }
                .name {
                    flex: 1;
                    font-size: 20px;
                    font-weight: 700;
                    padding: 0 20px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .score-container {
                    text-align: right;
                    min-width: 120px;
                }
                .score {
                    font-size: 24px;
                    font-weight: 700;
                }
                .pts {
                    font-size: 12px;
                    color: ${COLORS.textLabel};
                    margin-left: 8px;
                }
                .footer {
                    height: ${FOOTER_HEIGHT}px;
                    border-top: 1px solid ${COLORS.border};
                    background: rgba(0,0,0,0.2);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 40px;
                    font-size: 14px;
                    color: ${COLORS.textLabel};
                }
                .empty-state {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                }
                .empty-icon { font-size: 48px; }
                .empty-title { font-size: 20px; font-weight: 700; }
                .empty-desc { font-size: 14px; color: ${COLORS.textLabel}; }
            </style>

            <div class="header">
                <div class="header-content">
                    <div class="title">${title}</div>
                    <div class="desc">${description}</div>
                </div>
                <div class="badge">${filterType}</div>
            </div>

            <div class="content">
                ${rowsHtml}
            </div>

            <div class="footer">
                <div>Total tracked users: ${formatNumber(totalUsers)}</div>
                <div>Generated: ${new Date().toLocaleTimeString()}</div>
            </div>
        `;

        return await renderHtmlToImage(html, WIDTH, height);
    } catch (error) {
        logger.errorWithStack('Failed to render leaderboard image', error, 'RENDER');
        throw error;
    }
}

module.exports = { renderLeaderboardImage };

module.exports = { renderLeaderboardImage };
