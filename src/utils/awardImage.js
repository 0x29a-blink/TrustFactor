const { renderHtmlToImage } = require('./htmlRenderer');
const { escapeHtml, formatTextWithEmojis } = require('./textFormatting');
const logger = require('./logger');

const WIDTH = 700;
const HEIGHT = 350;

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
};

async function renderAwardImage(data, options = {}) {
    try {
        const { proposerName, targetName, points, reason, action, status = 'PROPOSAL', voteProgress } = data;
        
        // Sanitize and format inputs
        const safeProposerName = formatTextWithEmojis(proposerName);
        const safeTargetName = formatTextWithEmojis(targetName);
        const safeReason = formatTextWithEmojis(reason);
        const safeAction = escapeHtml(action);
        const safeStatus = escapeHtml(status);
        
        let statusColor = COLORS.textLabel;
        if (status === 'APPROVED' || status === 'EXECUTED') statusColor = COLORS.success;
        else if (status === 'REJECTED' || status === 'DENIED') statusColor = COLORS.danger;
        else if (status === 'ADMIN OVERRIDE' || status === 'EXPIRED') statusColor = 'orange';

        const pointsColor = points > 0 ? COLORS.success : COLORS.danger;
        const gradientColor = points > 0 ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)';

        const voteProgressHtml = voteProgress ? `
            <div class="vote-pill">
                ${voteProgress.approve} / ${voteProgress.needed} VOTES
            </div>
        ` : '';

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
                    background-image: radial-gradient(circle at 50% 0%, ${gradientColor}, transparent 70%);
                }
                .custom-emoji {
                    height: 1.2em;
                    width: auto;
                    vertical-align: -0.25em;
                }
                .header {
                    text-align: center;
                    padding-top: 30px;
                }
                .status {
                    font-size: 14px;
                    font-weight: 600;
                    color: ${statusColor};
                    letter-spacing: 1px;
                    text-transform: uppercase;
                }
                .title {
                    font-size: 24px;
                    font-weight: 700;
                    margin-top: 4px;
                    text-transform: uppercase;
                }
                .content {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    margin-top: 0px;
                }
                .user-box {
                    width: 200px;
                    display: flex;
                    flex-direction: column;
                    z-index: 2;
                }
                .user-box.left { text-align: right; align-items: flex-end; }
                .user-box.right { text-align: left; align-items: flex-start; }
                
                .label { font-size: 12px; color: ${COLORS.textLabel}; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; }
                .value { font-size: 20px; font-weight: 700; line-height: 1.2; }
                
                .center-badge {
                    width: 120px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    z-index: 2;
                    margin: 0 20px;
                }
                .points-circle {
                    width: 100px;
                    height: 100px;
                    border-radius: 50%;
                    background-color: ${COLORS.cardBg};
                    border: 3px solid ${pointsColor};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 36px;
                    font-weight: 700;
                    color: ${pointsColor};
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                }
                .points-label {
                    margin-top: 8px;
                    font-size: 10px;
                    color: ${COLORS.textLabel};
                    font-weight: 700;
                    letter-spacing: 1px;
                }
                
                .connector {
                    position: absolute;
                    top: 50%;
                    left: 180px;
                    right: 180px;
                    height: 2px;
                    background: ${COLORS.border};
                    z-index: 1;
                    transform: translateY(-15px); /* Adjust to align with text center roughly */
                }

                .vote-pill {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 4px 16px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 700;
                    margin-top: 8px;
                }

                .footer {
                    margin: 0 50px 40px 50px;
                    background: rgba(255,255,255,0.03);
                    border-radius: 8px;
                    padding: 16px 24px;
                    text-align: center;
                }
                .reason-label {
                    font-size: 12px;
                    color: ${COLORS.textLabel};
                    font-weight: 600;
                    margin-bottom: 4px;
                    text-transform: uppercase;
                }
                .reason-text {
                    font-size: 16px;
                    font-style: italic;
                    line-height: 1.4;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
            </style>

            <div class="header">
                <div class="status">${safeStatus}</div>
                <div class="title">${safeAction}</div>
            </div>

            <div class="content">
                <div class="connector"></div>
                
                <div class="user-box left">
                    <div class="label">Proposed By</div>
                    <div class="value">${safeProposerName}</div>
                </div>

                <div class="center-badge">
                    <div class="points-circle">
                        ${points > 0 ? '+' : ''}${points}
                    </div>
                    <div class="points-label">POINTS</div>
                    ${voteProgressHtml}
                </div>

                <div class="user-box right">
                    <div class="label">Target User</div>
                    <div class="value">${safeTargetName}</div>
                </div>
            </div>

            <div class="footer">
                <div class="reason-label">Reason</div>
                <div class="reason-text">"${safeReason}"</div>
            </div>
        `;

        return await renderHtmlToImage(html, WIDTH, HEIGHT);
    } catch (error) {
        logger.errorWithStack('Failed to render award image', error, 'RENDER');
        throw error;
    }
}

module.exports = { renderAwardImage };
