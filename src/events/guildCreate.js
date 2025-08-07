const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.GuildCreate,
    async execute(guild) {
        try {
            // Log when bot is added to a new server - single comprehensive line
            const boostInfo = guild.premiumTier > 0 ? ` | Boost Level: ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boosts)` : '';
            logger.info(`🎉 Bot added to new server: "${guild.name}" (ID: ${guild.id}) | Members: ${guild.memberCount} | Owner: ${guild.ownerId} | Region: ${guild.preferredLocale || 'Unknown'} | Created: ${guild.createdAt.toLocaleDateString()}${boostInfo}`, 'GUILD');
            
        } catch (error) {
            logger.errorWithStack('Error handling guild create event', error, 'GUILD');
        }
    },
};
