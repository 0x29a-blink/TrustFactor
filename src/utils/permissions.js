/**
 * Permission utilities for TrustFactor bot
 */

const { PermissionFlagsBits } = require('discord.js');

// Get owner ID from environment variable
const OWNER_ID = process.env.OWNER_ID || '160853902726660096';

/**
 * Check if user has admin permissions
 * @param {GuildMember} member - Discord guild member
 * @returns {boolean} True if user has admin permissions
 */
function isAdmin(member) {
    return member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild);
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
    const userIsOwner = member.user.id === OWNER_ID;
    if (serverTestingMode) {
        return userIsOwner;
    }
    return false;
}

module.exports = {
    isAdmin,
    isTestingMode,
    getPermissionLevel
};
