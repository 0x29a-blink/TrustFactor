const { applySyncIfPriority, cleanupExpiredRequests } = require('../utils/syncUtils');
const logger = require('../utils/logger');

/**
 * Event handler for sync-related operations
 * This handles automatic sync propagation when priority servers change settings
 */

// This module provides sync initialization functions
// The ready event handler is now integrated into ready.js to avoid duplicates

/**
 * Initialize the sync system - called from ready.js
 */
async function initializeSyncSystem() {
    logger.sync('Setting up sync system...', 'STARTUP');
    
    // Clean up expired sync requests on startup
    await cleanupExpiredRequests();
    
    // Set up periodic cleanup (every hour)
    setInterval(async () => {
        await cleanupExpiredRequests();
    }, 60 * 60 * 1000); // 1 hour
    
    logger.sync('Sync system initialized', 'STARTUP');
}

module.exports = {
    initializeSyncSystem
};

/**
 * Function to be called when server settings are updated
 * This should be called from config commands and other places where settings change
 * @param {string} serverId - Server ID that had settings changed
 * @param {Object} changes - Object describing what changed
 */
async function handleServerSettingsChange(serverId, changes = {}) {
    try {
        logger.sync(`Server ${serverId} settings changed`, 'SETTINGS');
        logger.object('Settings changes', changes, 'SETTINGS');
        
        // Apply sync if this server is a priority server
        const syncApplied = await applySyncIfPriority(serverId);
        
        if (syncApplied) {
            logger.sync(`Sync settings applied from priority server ${serverId}`, 'SETTINGS');
        }
        
        return syncApplied;
    } catch (error) {
        logger.errorWithStack('Error handling server settings change', error, 'SETTINGS');
        return false;
    }
}

// Export the handler function for use in other modules
module.exports.handleServerSettingsChange = handleServerSettingsChange;
