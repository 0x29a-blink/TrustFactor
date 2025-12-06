const { getBrowser } = require('./browserService');
const logger = require('./logger');

// Cache browser instance if needed, but for stability in bots, per-request is often safer 
// unless volume is high. We'll start with per-request to ensure clean state.

async function renderHtmlToImage(htmlContent, width, height) {
    let context = null;
    let page = null;
    try {
        const browser = await getBrowser();

        context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: 2 // 2x for high DPI
        });

        page = await context.newPage();

        // Wrap content with complete HTML structure and Google Fonts
        // Noto Sans Math covers many mathematical symbols
        // Noto Sans Symbols covers many other symbols
        // Noto Color Emoji is usually system-level, but we can try to include it or rely on system
        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Math&family=Noto+Sans+Symbols&family=Noto+Sans:wght@400;600;700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        width: ${width}px;
                        height: ${height}px;
                        background: transparent;
                        font-family: 'Noto Sans', 'Roboto', 'Noto Sans Math', 'Noto Sans Symbols', sans-serif;
                        overflow: hidden;
                    }
                    * {
                        box-sizing: border-box;
                    }
                </style>
            </head>
            <body>
                ${htmlContent}
            </body>
            </html>
        `;

        await page.setContent(fullHtml, {
            waitUntil: 'networkidle', // Wait for fonts to load
            timeout: 10000 // 10s timeout
        });

        const screenshot = await page.screenshot({
            type: 'png',
            omitBackground: true
        });

        return screenshot;

    } catch (error) {
        logger.errorWithStack('Failed to render HTML to image', error, 'RENDER');
        throw error;
    } finally {
        if (page) {
            try { await page.close(); } catch (e) { /* ignore */ }
        }
        if (context) {
            try { await context.close(); } catch (e) { /* ignore */ }
        }
    }
}

module.exports = { renderHtmlToImage };
