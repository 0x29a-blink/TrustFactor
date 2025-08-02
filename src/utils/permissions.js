/**
 * Permission utilities for TrustFactor bot
 */

// Get owner ID from environment variable
const OWNER_ID = process.env.OWNER_ID || '160853902726660096';

/**
 * Utility functions for permission checking and role management
 */

/**
 * Check if user has admin permissions
 * @param {GuildMember} member - Discord guild member
 * @returns {boolean} True if user has admin permissions
 */
function isAdmin(member) {
    return member.permissions.has('Administrator') || member.permissions.has('ManageGuild');
}

/**
 * Get permission level for user
 * @param {GuildMember} member - Discord guild member
 * @returns {string} Permission level: 'owner', 'admin', or 'user'
 */
function getPermissionLevel(member) {
    if (member.user.id === OWNER_ID) return 'owner';
    if (isAdmin(member)) return 'admin';
    return 'user';
}

/**
 * Check if testing mode applies to a user
 * @param {GuildMember} member - Discord guild member
 * @param {boolean} serverTestingMode - Server's testing mode setting
 * @returns {boolean} True if testing mode applies
 */
function isTestingMode(member, serverTestingMode) {
    // Bot owner bypasses voting when admin override is enabled
    const userIsOwner = member.user.id === OWNER_ID;
    
    // If server has admin override enabled, only the owner bypasses voting
    if (serverTestingMode) {
        return userIsOwner; // Only owner gets testing mode when override is enabled
    }
    
    // If admin override is disabled, everyone (including owner) uses normal voting
    return false;
}

/**
 * Get permission level for user
 * @param {GuildMember} member - Discord guild member
 * @returns {string} - Permission level: 'owner', 'admin', or 'user'
 */
function getPermissionLevel(member) {
    if (member.user.id === OWNER_ID) return 'owner';
    if (isAdmin(member)) return 'admin';
    return 'user';
}

module.exports = {
    isAdmin,
    isTestingMode,
    getPermissionLevel
};
