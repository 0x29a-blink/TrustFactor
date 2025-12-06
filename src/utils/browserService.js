const { chromium } = require('playwright');
const logger = require('./logger');

let browserInstance = null;

async function initBrowser() {
    if (browserInstance) return browserInstance;

    try {
        logger.lifecycle('Launching persistent Playwright browser...', 'BROWSER');
        browserInstance = await chromium.launch({
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--font-render-hinting=none',
                '--disable-dev-shm-usage', // Important for Docker/Linux limits
                '--disable-accelerated-2d-canvas',
                '--disable-gpu' // Often helps on headless servers
            ],
            headless: true
        });
        logger.lifecycle('Playwright browser launched successfully.', 'BROWSER');
        
        // Handle disconnects
        browserInstance.on('disconnected', () => {
            logger.warn('Playwright browser disconnected! clearing instance.', 'BROWSER');
            browserInstance = null;
        });

        return browserInstance;
    } catch (error) {
        logger.errorWithStack('Failed to launch Playwright browser', error, 'BROWSER');
        throw error;
    }
}

async function getBrowser() {
    if (!browserInstance) {
        return await initBrowser();
    }
    return browserInstance;
}

async function closeBrowser() {
    if (browserInstance) {
        try {
            await browserInstance.close();
            logger.lifecycle('Playwright browser closed.', 'BROWSER');
        } catch (error) {
            logger.errorWithStack('Error closing Playwright browser', error, 'BROWSER');
        } finally {
            browserInstance = null;
        }
    }
}

module.exports = {
    initBrowser,
    getBrowser,
    closeBrowser
};
