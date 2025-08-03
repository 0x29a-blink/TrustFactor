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
                reasonText = "Acquired points via <emoji> reaction";
            }
            
            // Validate point range
            if (Math.abs(points) > serverConfig.max_points_per_award || 
                Math.abs(points) < 1) {
                logger.vote(`Invalid point amount: ${points} (max: ${serverConfig.max_points_per_award})`, 'MESSAGE');
                // Add a reaction to indicate invalid point amount
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
                    logger.vote(`User ${message.author.displayName} is on cooldown`, 'MESSAGE');
                    await message.react('⏰');
                    return;
                }
            }
            
            // Create a pending vote for this reply-based award
            const voteData = {
                messageId: message.id,
                originalMessageId: originalMessage.id,
                channelId: message.channel.id,
                proposerId: message.author.id,
                targetUserId: originalMessage.author.id,
                serverId: message.guild.id,
                pointChange: points,
                reason: reasonText,
                votesNeeded: VotingUtils.calculateRequiredVotes(serverConfig, points),
                expiresAt: new Date(Date.now() + (serverConfig.voting_timeout * 60 * 1000))
            };
            
            const pendingVote = await DatabaseUtils.createPendingVote(voteData);
            
            logger.vote(`Created pending vote from reply: ${message.author.displayName} wants to award ${points} points to ${originalMessage.author.displayName}`, 'MESSAGE');
            
            // Add confirmation reaction to show the bot detected the award request
            await message.react('👀');
            
            // Add voting reactions for community voting
            await message.react('👍');
            await message.react('👎');
            
            // Note: No auto-approval for reply-based voting - let users vote manually with reactions
            
            // Always set up vote expiration timer (even if already approved, for cleanup)
            setTimeout(async () => {
                try {
                    const currentVote = await DatabaseUtils.getPendingVote(message.id);
                    if (currentVote && currentVote.status === 'pending') {
                        await DatabaseUtils.updateVoteStatus(currentVote.id, 'expired');
                        await VotingUtils.handleExpiredVote(currentVote, message);
                    }
                } catch (error) {
                    console.error('Error handling vote expiration:', error);
                }
            }, serverConfig.voting_timeout * 60 * 1000);
            
        } catch (error) {
            console.error('Error processing reply-based point award:', error);
            // Add error reaction
            await message.react('❌');
        }
    }
};
