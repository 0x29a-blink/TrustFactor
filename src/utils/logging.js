const { EmbedBuilder } = require('discord.js');
const DatabaseUtils = require('./database');

/**
 * Audit logging utility for TrustFactor bot
 * Sends structured log messages to configured log channels
 */
class AuditLogger {

    /**
     * Log a point award/deduction event
     * @param {Client} client - Discord client
     * @param {string} serverId - Server ID
     * @param {Object} data - Award data
     */
    static async logPointAward(client, serverId, data) {
        try {
            const serverConfig = await DatabaseUtils.getServerConfig(serverId);
            if (!serverConfig.log_channel) return;

            const embed = new EmbedBuilder()
                .setColor(data.points > 0 ? '#00ff00' : '#ff6b6b')
                .setTitle(`${data.points > 0 ? '📈' : '📉'} Points ${data.points > 0 ? 'Awarded' : 'Deducted'}`)
                .addFields([
                    { name: 'Target User', value: `<@${data.targetUserId}>`, inline: true },
                    { name: 'Points', value: `${data.points > 0 ? '+' : ''}${data.points}`, inline: true },
                    { name: 'New Total', value: `${data.newTotal} points`, inline: true },
                    { name: 'Awarded By', value: `<@${data.awardedBy}>`, inline: true },
                    { name: 'Method', value: data.method || 'Voting', inline: true },
                    { name: 'Reason', value: data.reason || 'No reason provided', inline: false }
                ])
                .setTimestamp()
                .setFooter({ text: `Server: ${serverId}` });

            await this.sendLogMessage(client, serverConfig.log_channel, embed);
        } catch (error) {
            console.error('Error logging point award:', error);
        }
    }

    /**
     * Log a vote event (approval/rejection)
     * @param {Client} client - Discord client
     * @param {string} serverId - Server ID
     * @param {Object} data - Vote data
     */
    static async logVoteEvent(client, serverId, data) {
        try {
            const serverConfig = await DatabaseUtils.getServerConfig(serverId);
            if (!serverConfig.log_channel) return;

            const embed = new EmbedBuilder()
                .setColor(data.approved ? '#00ff00' : '#ff6b6b')
                .setTitle(`${data.approved ? '✅' : '❌'} Vote ${data.approved ? 'Approved' : 'Rejected'}`)
                .addFields([
                    { name: 'Proposal', value: `${data.points > 0 ? '+' : ''}${data.points} points for <@${data.targetUserId}>`, inline: false },
                    { name: 'Proposed By', value: `<@${data.proposedBy}>`, inline: true },
                    { name: 'Final Vote Count', value: `${data.approveCount}/${data.threshold} approvals`, inline: true },
                    { name: 'Status', value: data.approved ? 'Executed' : data.reason || 'Failed', inline: true },
                    { name: 'Reason', value: data.proposalReason || 'No reason provided', inline: false }
                ])
                .setTimestamp()
                .setFooter({ text: `Vote ID: ${data.voteId}` });

            await this.sendLogMessage(client, serverConfig.log_channel, embed);
        } catch (error) {
            console.error('Error logging vote event:', error);
        }
    }

    /**
     * Log a configuration change
     * @param {Client} client - Discord client
     * @param {string} serverId - Server ID
     * @param {Object} data - Config change data
     */
    static async logConfigChange(client, serverId, data) {
        try {
            const serverConfig = await DatabaseUtils.getServerConfig(serverId);
            if (!serverConfig.log_channel) return;

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('⚙️ Configuration Changed')
                .addFields([
                    { name: 'Changed By', value: `<@${data.changedBy}>`, inline: true },
                    { name: 'Setting', value: data.setting, inline: true },
                    { name: 'Old Value', value: data.oldValue || 'Not set', inline: true },
                    { name: 'New Value', value: data.newValue || 'Not set', inline: true }
                ])
                .setTimestamp()
                .setFooter({ text: `Server: ${serverId}` });

            await this.sendLogMessage(client, serverConfig.log_channel, embed);
        } catch (error) {
            console.error('Error logging config change:', error);
        }
    }

    /**
     * Log admin override usage
     * @param {Client} client - Discord client
     * @param {string} serverId - Server ID
     * @param {Object} data - Override data
     */
    static async logAdminOverride(client, serverId, data) {
        try {
            const serverConfig = await DatabaseUtils.getServerConfig(serverId);
            if (!serverConfig.log_channel) return;

            const embed = new EmbedBuilder()
                .setColor('#ff8c00')
                .setTitle('⚡ Admin Override Used')
                .addFields([
                    { name: 'Admin', value: `<@${data.adminId}>`, inline: true },
                    { name: 'Action', value: data.action, inline: true },
                    { name: 'Target', value: data.target ? `<@${data.target}>` : 'N/A', inline: true },
                    { name: 'Details', value: data.details || 'No details provided', inline: false }
                ])
                .setTimestamp()
                .setFooter({ text: `Server: ${serverId}` });

            await this.sendLogMessage(client, serverConfig.log_channel, embed);
        } catch (error) {
            console.error('Error logging admin override:', error);
        }
    }

    /**
     * Log user score reset
     * @param {Client} client - Discord client
     * @param {string} serverId - Server ID
     * @param {Object} data - Reset data
     */
    static async logScoreReset(client, serverId, data) {
        try {
            const serverConfig = await DatabaseUtils.getServerConfig(serverId);
            if (!serverConfig.log_channel) return;

            const embed = new EmbedBuilder()
                .setColor('#ff6b6b')
                .setTitle('🔄 User Score Reset')
                .addFields([
                    { name: 'Target User', value: `<@${data.targetUserId}>`, inline: true },
                    { name: 'Previous Score', value: `${data.previousScore} points`, inline: true },
                    { name: 'Reset By', value: `<@${data.resetBy}>`, inline: true }
                ])
                .setTimestamp()
                .setFooter({ text: `Server: ${serverId}` });

            await this.sendLogMessage(client, serverConfig.log_channel, embed);
        } catch (error) {
            console.error('Error logging score reset:', error);
        }
    }

    /**
     * Log database reset (critical action)
     * @param {Client} client - Discord client
     * @param {string} serverId - Server ID
     * @param {Object} data - Reset data
     */
    static async logDatabaseReset(client, serverId, data) {
        try {
            const serverConfig = await DatabaseUtils.getServerConfig(serverId);
            if (!serverConfig.log_channel) return;

            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🚨 DATABASE RESET')
                .setDescription('**CRITICAL ACTION: All user data has been permanently deleted**')
                .addFields([
                    { name: 'Reset By', value: `<@${data.resetBy}>`, inline: true },
                    { name: 'Tables Cleared', value: `${data.clearedTables}/${data.totalTables}`, inline: true },
                    { name: 'Status', value: data.status, inline: true }
                ])
                .setTimestamp()
                .setFooter({ text: `Server: ${serverId} | This action cannot be undone` });

            await this.sendLogMessage(client, serverConfig.log_channel, embed);
        } catch (error) {
            console.error('Error logging database reset:', error);
        }
    }

    /**
     * Send a log message to the configured log channel
     * @param {Client} client - Discord client
     * @param {string} channelId - Channel ID to send to
     * @param {EmbedBuilder} embed - Log embed
     * @param {Object} fallbackContext - Optional context for fallback notification
     * @param {Channel} fallbackContext.channel - Channel to send fallback message to
     * @param {User} fallbackContext.user - User who triggered the action
     */
    static async sendLogMessage(client, channelId, embed, fallbackContext = null) {
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) {
                console.warn(`Log channel ${channelId} not found or not text-based`);
                await this.handleLogChannelError(client, channelId, 'Channel not found or not text-based', fallbackContext);
                return;
            }

            await channel.send({ embeds: [embed] });
        } catch (error) {
            let errorReason = 'Unknown error';
            
            // Handle specific Discord API errors for missing/deleted channels
            if (error.code === 10003) { // Unknown Channel
                errorReason = 'Log channel was deleted or does not exist';
                console.warn(`Log channel ${channelId} no longer exists (deleted). Skipping log message.`);
            } else if (error.code === 50001) { // Missing Access
                errorReason = 'Bot does not have access to the log channel';
                console.warn(`No access to log channel ${channelId}. Skipping log message.`);
            } else if (error.code === 50013) { // Missing Permissions
                errorReason = 'Bot lacks permission to send messages in the log channel';
                console.warn(`Missing permissions for log channel ${channelId}. Skipping log message.`);
            } else {
                console.error(`Error sending log message to channel ${channelId}:`, error);
            }
            
            await this.handleLogChannelError(client, channelId, errorReason, fallbackContext);
        }
    }

    /**
     * Handle log channel error by sending a notification to the fallback channel/user
     * @param {Client} client - Discord client
     * @param {string} channelId - Channel ID that caused the error
     * @param {string} errorReason - Reason for the error
     * @param {Object} fallbackContext - Fallback context
     * @param {Channel} fallbackContext.channel - Channel to send fallback message to
     * @param {User} fallbackContext.user - User who triggered the action
     */
    static async handleLogChannelError(client, channelId, errorReason, fallbackContext) {
        if (!fallbackContext) return;

        const fallbackChannel = fallbackContext.channel;
        const fallbackUser = fallbackContext.user;

        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🚨 Log Channel Error')
            .setDescription(`Error sending log message to channel ${channelId}: ${errorReason}`)
            .addFields([
                { name: 'Channel ID', value: channelId, inline: true },
                { name: 'Error Reason', value: errorReason, inline: true }
            ])
            .setTimestamp()
            .setFooter({ text: `Server: ${fallbackChannel.guild.id}` });

        try {
            await fallbackChannel.send({ content: `${fallbackUser.toString()}, an error occurred while sending a log message to channel ${channelId}.`, embeds: [embed] });
        } catch (error) {
            console.error('Error sending fallback notification:', error);
        }
    }

    /**
     * Log a general event with custom data
     * @param {Client} client - Discord client
     * @param {string} serverId - Server ID
     * @param {Object} data - Custom log data
     * @param {Object} fallbackContext - Optional fallback context for error notifications
     * @param {Channel} fallbackContext.channel - Channel to send fallback message to
     * @param {User} fallbackContext.user - User who triggered the action
     */
    static async logCustomEvent(client, serverId, data, fallbackContext = null) {
        try {
            const serverConfig = await DatabaseUtils.getServerConfig(serverId);
            if (!serverConfig.log_channel) return;

            const embed = new EmbedBuilder()
                .setColor(data.color || '#5865F2')
                .setTitle(data.title || '📝 Custom Event')
                .setDescription(data.description || '')
                .setTimestamp()
                .setFooter({ text: `Server: ${serverId}` });

            if (data.fields && Array.isArray(data.fields)) {
                embed.addFields(data.fields);
            }

            await this.sendLogMessage(client, serverConfig.log_channel, embed, fallbackContext);
        } catch (error) {
            console.error('Error logging custom event:', error);
        }
    }
}

module.exports = AuditLogger;
