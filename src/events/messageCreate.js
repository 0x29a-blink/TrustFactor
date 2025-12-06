const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const VotingUtils = require('../utils/voting');
const DatabaseUtils = require('../utils/database');
const logger = require('../utils/logger');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        // Log message creation
        logger.verbose(`Message created by ${message.author.tag} (${message.author.id}): ${message.content}`, 'MESSAGE');
        
        // Ignore bot messages
        if (message.author.bot) return;
        
        // Only process messages in guilds
        if (!message.guild) return;
        
        // Check if this is a reply to another message
        if (!message.reference || !message.reference.messageId) return;
        
        try {
            // Get server configuration to check if bot is active
            const serverConfig = await DatabaseUtils.getServerConfig(message.guild.id);
            if (!serverConfig.is_active) {
                logger.verbose(`Server ${message.guild.id} is not active, ignoring message`, 'MESSAGE');
                return;
            }
            
            // Check for point notation pattern: starts with +/- followed by digits
            const pointPattern = /^([+-])(\d+)(?:\s+(.*))?$/;
            const match = message.content.match(pointPattern);
            
            if (!match) {
                logger.verbose('Message does not match point pattern, ignoring', 'MESSAGE');
                return;
            }
            
            const [, sign, pointsStr, reason] = match;
            const points = parseInt(pointsStr) * (sign === '+' ? 1 : -1);
            
            // Get the original message being replied to
            const originalMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (!originalMessage) {
                logger.warn('Original message not found for reply', 'MESSAGE');
                return;
            }
            
            // Use provided reason, or original message content, or fallback to default message
            let reasonText;
            if (reason && reason.trim()) {
                reasonText = reason.trim();
            } else if (originalMessage.content && originalMessage.content.trim()) {
                reasonText = originalMessage.content;
            } else {
                reasonText = 'Reply to image';
            }
            
            // Validate point range
            if (Math.abs(points) > serverConfig.max_points_per_award || 
                Math.abs(points) < 1) {
                logger.vote(`Invalid point amount: ${points} (max: ${serverConfig.max_points_per_award})`, 'MESSAGE');
                await message.react('❌');
                return;
            }

            // Check minimum vote magnitude (absolute value constraint) for reply-based voting
            if (Math.abs(points) < serverConfig.min_vote_magnitude) {
                logger.vote(`Invalid point amount: ${points} (minimum magnitude: ${serverConfig.min_vote_magnitude})`, 'MESSAGE');
                await message.react('❌');
                return;
            }
            
            // Can't award points to bots
            if (originalMessage.author.bot) {
                logger.vote('Cannot award points to bot', 'MESSAGE');
                await message.react('❌');
                return;
            }
            
            // Can't award points to yourself
            if (message.author.id === originalMessage.author.id) {
                logger.vote('Cannot award points to yourself', 'MESSAGE');
                await message.react('❌');
                return;
            }
            
            // Check user cooldown
            const lastAward = await DatabaseUtils.getUserLastAward(message.author.id, message.guild.id);
            if (lastAward) {
                const cooldownMs = serverConfig.user_cooldown_minutes * 60 * 1000;
                const timeSinceLastAward = Date.now() - new Date(lastAward.created_at).getTime();
                
                if (timeSinceLastAward < cooldownMs) {
                    logger.vote(`User ${(message.author.globalName || message.author.username)} is on cooldown`, 'MESSAGE');
                    await message.react('⏰');
                    return;
                }
            }

            // Prepare the proposal Embed
            const targetMention = `<@${originalMessage.author.id}>`;
            const proposerMention = `<@${message.author.id}>`;
            const votesNeeded = VotingUtils.calculateRequiredVotes(serverConfig, points);
            
            const embed = new EmbedBuilder()
                .setColor(serverConfig.embed_color || '#5865F2')
                .setTitle('🗳️ Point Award Proposal')
                .setDescription(`**${proposerMention}** wants to ${points > 0 ? 'award' : 'deduct'} **${Math.abs(points)}** point${Math.abs(points) !== 1 ? 's' : ''} ${points > 0 ? 'to' : 'from'} ${targetMention}`)
                .addFields([
                    { name: 'Reason', value: reasonText, inline: false },
                    { name: 'Progress', value: `0/${votesNeeded} approval${votesNeeded !== 1 ? 's' : ''}`, inline: true },
                    { name: 'Rejections', value: '0', inline: true }
                ])
                .setFooter({ text: 'Vote with the buttons below' })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('vote_approve')
                        .setLabel('Approve')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId('vote_reject')
                        .setLabel('Reject')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌')
                );

            // Send the proposal as a reply
            const proposalMessage = await message.reply({ embeds: [embed], components: [row] });
            
            // Create a pending vote for this reply-based award, linking it to the proposal message
            // We track the proposal message ID so buttons on it work correctly
            const voteData = {
                messageId: proposalMessage.id, // The embed message ID
                originalMessageId: message.id, // The "+1" reply message ID (for traceback/history)
                channelId: message.channel.id,
                proposerId: message.author.id,
                targetUserId: originalMessage.author.id,
                serverId: message.guild.id,
                pointChange: points,
                reason: reasonText,
                votesNeeded: votesNeeded,
                expiresAt: new Date(Date.now() + (serverConfig.voting_timeout * 60 * 1000)),
                voteMethod: 'reply' // Treated like a command vote now essentially
            };
            
            await DatabaseUtils.createPendingVote(voteData);
            
            logger.vote(`Created pending vote from reply: ${(message.author.globalName || message.author.username)} wants to ${points > 0 ? 'award' : 'deduct'} ${Math.abs(points)} points ${points > 0 ? 'to' : 'from'} ${(originalMessage.author.globalName || originalMessage.author.username)}`, 'MESSAGE');
            
            // Always set up vote expiration timer
            setTimeout(async () => {
                try {
                    const currentVote = await DatabaseUtils.getPendingVote(proposalMessage.id);
                    if (currentVote && currentVote.status === 'pending') {
                        const expired = await DatabaseUtils.atomicExpireVote(currentVote.id);
                        if (expired) {
                            await VotingUtils.handleExpiredVote(currentVote, message.client);
                        }
                    }
                } catch (error) {
                    logger.errorWithStack('Error handling vote expiration', error, 'MESSAGE');
                }
            }, serverConfig.voting_timeout * 60 * 1000);
            
        } catch (error) {
            logger.errorWithStack('Error processing reply-based point award', error, 'MESSAGE');
            await message.react('❌');
        }
    }
};
