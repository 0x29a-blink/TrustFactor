const { Events } = require('discord.js');
const VotingUtils = require('../utils/voting');
const DatabaseUtils = require('../utils/database');
const logger = require('../utils/logger');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        // Log reaction event
        logger.user(`Reaction added by ${user.tag} (${user.id})`, 'REACTION');
        logger.verbose(`Reaction details: ${reaction.emoji.name} on message ${reaction.message.id} in channel ${reaction.message.channel.id}`, 'REACTION');
        
        // Ignore bot reactions
        if (user.bot) return;
        
        // If the reaction is partial, fetch the full reaction
        if (reaction.partial) {
            try {
                await reaction.fetch();
                logger.verbose('Fetched partial reaction', 'REACTION');
            } catch (error) {
                logger.errorWithStack('Something went wrong when fetching the reaction', error, 'REACTION');
                return;
            }
        }

        const { message } = reaction;
        
        // Only process reactions in guild channels
        if (!message.guild) return;
        
        try {
            // Check if server is active
            const serverConfig = await DatabaseUtils.getServerConfig(message.guild.id);
            if (!serverConfig.is_active) {
                logger.verbose(`Server ${message.guild.id} is not active, ignoring reaction`, 'REACTION');
                return;
            }
            
            // Check if this channel is blocked for reaction point awards
            const blockedChannel = await DatabaseUtils.isChannelBlocked(message.guild.id, message.channel.id);
            if (blockedChannel) {
                logger.verbose(`Channel ${message.channel.id} is blocked for reaction point awards, ignoring reaction`, 'REACTION');
                return;
            }
            
            // First, check if this is a reply-based voting reaction (👍/👎 on reply messages)
            const isVotingReaction = reaction.emoji.name === '👍' || reaction.emoji.name === '👎';
            if (isVotingReaction) {
                logger.vote(`Voting reaction detected: ${reaction.emoji.name}`, 'REACTION');
                // Handle existing reply-based voting reactions
                await VotingUtils.handleReactionVote(reaction, user);
                return;
            }
            
            // If not a voting reaction, check if it's a reaction-based voting emoji
            // Don't process reactions on bot messages (to avoid conflicts with voting systems)
            // EXCEPTION: Allow reactions on config-related bot messages for emoji selection
            if (message.author.bot) {
                // Check if this is a config message by looking for config-related content
                const isConfigMessage = message.embeds.length > 0 && 
                    (message.embeds[0].title?.includes('Add Custom Emoji') || 
                     message.embeds[0].description?.includes('Step 1:') ||
                     message.embeds[0].description?.includes('emoji you want to configure'));
                
                if (isConfigMessage) {
                    logger.verbose('Reaction on config message, allowing for emoji selection', 'REACTION');
                    return; // Let the reaction collectors handle this
                }
                
                logger.verbose('Reaction on bot message, ignoring', 'REACTION');
                return;
            }
            
            // Get emoji string (handle both Unicode and custom emojis)
            // Use toString() for custom emojis to handle duplicate names properly
            const emojiString = reaction.emoji.id ? reaction.emoji.toString() : reaction.emoji.name;
            
            // Debug logging for custom emoji reactions
            if (reaction.emoji.id) {
                logger.verbose(`Custom emoji reaction: ${emojiString} (ID: ${reaction.emoji.id}, Name: ${reaction.emoji.name})`, 'REACTION');
            }
            
            // Only process custom emoji reactions for point awards (not Unicode emojis)
            if (!reaction.emoji.id) {
                logger.verbose(`Unicode emoji reaction ignored: ${emojiString}`, 'REACTION');
                return;
            }
            
            // Check if this emoji is configured for point awards
            const customReaction = await DatabaseUtils.getCustomReaction(message.guild.id, emojiString);
            if (!customReaction) {
                logger.verbose(`Custom emoji ${emojiString} not configured for point awards`, 'REACTION');
                // Not a configured reaction emoji
                return;
            }
            
            logger.vote(`Reaction-based vote detected: ${user.displayName} reacted ${emojiString} (${customReaction.point_value} points) to ${message.author.displayName}'s message`, 'REACTION');
            
            // Prevent self-reactions (users can't award points to themselves)
            if (user.id === message.author.id) {
                logger.vote('User cannot award points to themselves via reactions', 'REACTION');
                // Notify the user (check DM preference first)
                try {
                    const allowDMs = await DatabaseUtils.getUserDMPreference(user.id);
                    if (allowDMs) {
                        await user.send('❌ You cannot award points to yourself!');
                    } else {
                        // User has disabled DMs, send fallback message in channel
                        throw new Error('User has disabled DM notifications');
                    }
                } catch (dmErr) {
                    try {
                        if (message.channel && message.channel.send) {
                            await message.channel.send({ content: `${user}, ❌ you cannot award points to yourself!` });
                        }
                    } catch (chanErr) {
                        logger.debug(`Could not send self-award notification in channel: ${chanErr.message}`, 'REACTION');
                    }
                }
                return;
            }
            
            // Check user cooldown
            const lastAward = await DatabaseUtils.getUserLastAward(user.id, message.guild.id);
            if (lastAward) {
                const cooldownMs = serverConfig.user_cooldown_minutes * 60 * 1000;
                const timeSinceLastAward = Date.now() - new Date(lastAward.created_at).getTime();
                
                if (timeSinceLastAward < cooldownMs) {
                    logger.vote(`User ${user.displayName} is on cooldown for reaction-based voting`, 'REACTION');
                    // Add a temporary reaction to indicate cooldown
                    try {
                        await message.react('⏰');
                        setTimeout(async () => {
                            try {
                                await message.reactions.cache.get('⏰')?.remove();
                            } catch (e) {
                                // Ignore errors when removing cooldown reaction
                            }
                        }, 3000);
                    } catch (e) {
                        // Ignore reaction errors
                    }
                    return;
                }
            }
            
            // Create a pending vote for this reaction-based award
            const voteData = {
                messageId: message.id,
                originalMessageId: null, // No original message for reaction-based voting
                channelId: message.channel.id,
                proposerId: user.id,
                targetUserId: message.author.id,
                serverId: message.guild.id,
                pointChange: customReaction.point_value,
                reason: message.content && message.content.trim() 
                    ? `${emojiString} Reaction on: ${message.content}`
                    : `${emojiString} Reaction on image`,
                votesNeeded: VotingUtils.calculateRequiredVotes(serverConfig, customReaction.point_value),
                expiresAt: new Date(Date.now() + (serverConfig.voting_timeout * 60 * 1000))
            };
            
            const pendingVote = await DatabaseUtils.createPendingVote(voteData);
            
            console.log(`📝 Created pending reaction-based vote: ${user.displayName} wants to award ${customReaction.point_value} points to ${message.author.displayName}`);
            
            // --- DM or channel feedback to proposer ---
            const progressText = `(1/${voteData.votesNeeded} approvals, 0 rejections)`;
            const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
            const startFeedback = `You started a vote to award **${customReaction.point_value}** points to ${message.author.displayName} in **${message.guild.name}**!
${progressText}
${messageLink}`;
            try {
                // Check if user wants DM notifications before sending
                const allowDMs = await DatabaseUtils.getUserDMPreference(user.id);
                if (allowDMs) {
                    await user.send(startFeedback);
                }
                // If DMs are disabled, silently skip notification to avoid channel spam
                // The vote still works, user just doesn't get notified
            } catch (dmError) {
                // Only send fallback if the DM failed due to technical issues (not user preference)
                if (dmError.message !== 'User has disabled DM notifications') {
                    try {
                        if (message.channel && message.channel.send) {
                            await message.channel.send({
                                content: `${user}, you started a vote to award **${customReaction.point_value}** points to ${message.author.displayName}! ${progressText}\n${messageLink} (DMs are closed)`
                            });
                        }
                    } catch (chanErr) {
                        console.log('Could not send fallback feedback in channel:', chanErr.message);
                    }
                }
            }
            // --- end feedback ---
            
            // Auto-approve the proposer's vote if auto-approval is enabled (they initiated it by reacting)
            if (serverConfig.auto_approval !== false) {
                await DatabaseUtils.recordVote(pendingVote.id, user.id, 'approve');
            }
            
            // Check if threshold is met (might be 1 vote needed)
            const voteCounts = await DatabaseUtils.getVoteCount(pendingVote.id);
            const requiredVotes = VotingUtils.calculateRequiredVotes(serverConfig, customReaction.point_value);
            
            if (voteCounts.approveCount >= requiredVotes) {
                // Threshold met - approve immediately
                const wasApproved = await VotingUtils.approveVote(pendingVote, null, message);
                if (!wasApproved) {
                    // Vote was already processed by another user (race condition)
                    console.log(`Reaction-based vote ${pendingVote.id} was already processed by another user`);
                    return; // Exit early since vote is already handled
                }
            } else {
                // Need more votes - do not add 👍/👎 for metric (custom emoji) reaction-based votes
                // Only the metric reaction is used for voting
                
                // Set up vote expiration timer
                setTimeout(async () => {
                    try {
                        const currentVote = await DatabaseUtils.getPendingVote(message.id);
                        if (currentVote && currentVote.status === 'pending') {
                            await DatabaseUtils.updateVoteStatus(currentVote.id, 'expired');
                            await VotingUtils.handleExpiredVote(currentVote, message);
                        }
                    } catch (error) {
                        console.error('Error handling reaction-based vote expiration:', error);
                    }
                }, serverConfig.voting_timeout * 60 * 1000);
            }
            
        } catch (error) {
            console.error('Error processing reaction:', error);
        }
    },
};
