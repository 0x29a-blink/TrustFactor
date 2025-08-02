const { supabase } = require('../config/database');
const logger = require('./logger');

/**
 * Utility functions for server sync management
 */

/**
 * Check if a server is currently in an active sync group
 * @param {string} serverId - Discord server ID
 * @returns {Promise<Object|null>} Sync group info or null if not in a group
 */
async function getServerSyncStatus(serverId) {
    try {
        const { data, error } = await supabase
            .from('sync_group_members')
            .select(`
                sync_code,
                sync_groups!inner (
                    group_name,
                    priority_server::text,
                    is_active
                )
            `)
            .eq('server_id', String(serverId))
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        return data || null;
    } catch (error) {
        logger.errorWithStack('Error checking server sync status', error, 'SYNC');
        return null;
    }
}

/**
 * Get all servers in a sync group
 * @param {string} syncCode - Sync group code
 * @returns {Promise<Array>} Array of server IDs in the group
 */
async function getSyncGroupMembers(syncCode) {
    try {
        const { data, error } = await supabase
            .from('sync_group_members')
            .select('server_id::text, joined_at')
            .eq('sync_code', syncCode)
            .eq('is_active', true)
            .order('joined_at', { ascending: true });

        if (error) throw error;

        return data || [];
    } catch (error) {
        logger.errorWithStack('Error getting sync group members', error, 'SYNC');
        return [];
    }
}

/**
 * Check if a server has priority in its sync group
 * @param {string} serverId - Discord server ID
 * @returns {Promise<boolean>} True if server has priority
 */
async function isServerPriority(serverId) {
    try {
        const syncStatus = await getServerSyncStatus(serverId);
        if (!syncStatus) return false;
        
        return syncStatus.sync_groups.priority_server === String(serverId);
    } catch (error) {
        logger.errorWithStack('Error checking server priority status', error, 'SYNC');
        return false;
    }
}

/**
 * Apply sync group settings when a server configuration changes
 * This should be called whenever a priority server's settings are modified
 * @param {string} serverId - Server ID that had settings changed
 * @returns {Promise<boolean>} True if sync was applied successfully
 */
async function applySyncIfPriority(serverId) {
    try {
        const syncStatus = await getServerSyncStatus(serverId);
        if (!syncStatus) return false;

        // Only apply sync if this server is the priority server
        if (syncStatus.sync_groups.priority_server !== String(serverId)) {
            return false;
        }

        // Apply priority settings to all members
        const { error } = await supabase.rpc('apply_priority_settings', { 
            group_code: syncStatus.sync_code,
            exclude_server: String(serverId) 
        });

        if (error) throw error;

        logger.sync(`Applied sync settings from priority server ${serverId} to group ${syncStatus.sync_code}`, 'APPLY');
        return true;
    } catch (error) {
        logger.errorWithStack('Error applying sync settings', error, 'SYNC');
        return false;
    }
}

/**
 * Validate sync code format
 * @param {string} syncCode - Code to validate
 * @returns {boolean} True if valid format
 */
function isValidSyncCode(syncCode) {
    if (!syncCode || typeof syncCode !== 'string') return false;
    
    // Should be 8 characters, alphanumeric, uppercase
    const regex = /^[A-Z0-9]{8}$/;
    return regex.test(syncCode);
}

/**
 * Get sync group information by code
 * @param {string} syncCode - Sync group code
 * @returns {Promise<Object|null>} Sync group info or null if not found
 */
async function getSyncGroupInfo(syncCode) {
    try {
        const { data, error } = await supabase
            .from('sync_groups')
            .select('*')
            .eq('sync_code', syncCode)
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Error getting sync group info:', error);
        return null;
    }
}

/**
 * Clean up expired sync requests
 * This should be run periodically to maintain database cleanliness
 * @returns {Promise<number>} Number of expired requests cleaned up
 */
async function cleanupExpiredRequests() {
    try {
        const { data, error } = await supabase
            .from('sync_pending_requests')
            .delete()
            .lt('expires_at', new Date().toISOString())
            .select('id');

        if (error) throw error;

        const cleanedCount = data ? data.length : 0;
        if (cleanedCount > 0) {
            logger.sync(`Cleaned up ${cleanedCount} expired sync requests`, 'CLEANUP');
        }

        return cleanedCount;
    } catch (error) {
        logger.errorWithStack('Error cleaning up expired requests', error, 'SYNC');
        return 0;
    }
}

/**
 * Check if a server can join a specific sync group
 * @param {string} serverId - Server ID wanting to join
 * @param {string} syncCode - Sync group code
 * @returns {Promise<{canJoin: boolean, reason?: string}>} Join eligibility
 */
async function canServerJoinGroup(serverId, syncCode) {
    try {
        // Check if server is already in a sync group
        const currentSync = await getServerSyncStatus(serverId);
        if (currentSync) {
            return {
                canJoin: false,
                reason: `Already in sync group: ${currentSync.sync_groups.group_name}`
            };
        }

        // Check if sync group exists and is active
        const groupInfo = await getSyncGroupInfo(syncCode);
        if (!groupInfo) {
            return {
                canJoin: false,
                reason: 'Sync group not found or inactive'
            };
        }

        // Check if server is trying to join its own group
        if (groupInfo.created_by_server === String(serverId)) {
            return {
                canJoin: false,
                reason: 'Cannot join own sync group'
            };
        }

        return { canJoin: true };
    } catch (error) {
        console.error('Error checking server join eligibility:', error);
        return {
            canJoin: false,
            reason: 'Error checking eligibility'
        };
    }
}

/**
 * Get formatted server name for display
 * @param {Object} client - Discord client
 * @param {string} serverId - Server ID
 * @returns {Promise<string>} Server name or fallback
 */
async function getServerDisplayName(client, serverId) {
    try {
        const guild = await client.guilds.fetch(String(serverId));
        return guild ? guild.name : `Server ${serverId}`;
    } catch (error) {
        console.error(`Error fetching server name for ${serverId}:`, error);
        return `Server ${serverId}`;
    }
}

module.exports = {
    getServerSyncStatus,
    getSyncGroupMembers,
    isServerPriority,
    applySyncIfPriority,
    isValidSyncCode,
    getSyncGroupInfo,
    cleanupExpiredRequests,
    canServerJoinGroup,
    getServerDisplayName
};
