const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const DatabaseUtils = require('./database');
const AuditLogger = require('./logging');
const logger = require('./logger');

/**
 * Voting system utilities for TrustFactor bot
 */
class VotingUtils {
    /**
     * Handle vote reaction interactions
     * @param {MessageReaction} reaction - The reaction
     * @param {User} user - The user who reacted
     */
    static async handleReactionVote(reaction, user) {
        // Ignore bot reactions
        if (user.bot) return;
        
        const { message } = reaction;
        const isApproval = reaction.emoji.name === '👍';
        const isRejection = reaction.emoji.name === '👎';
        
        // Only handle thumbs up/down reactions
        if (!isApproval && !isRejection) return;
        
        const userLabel = user.globalName || user.username;
        logger.debug(`Reaction: ${reaction.emoji.name}, isApproval: ${isApproval}, user: ${userLabel}`, 'VOTE');

        try {
            // Get pending vote
            const pendingVote = await DatabaseUtils.getPendingVote(message.id);
            
            if (!pendingVote) {
                logger.debug('No pending vote found for this message', 'VOTE');
                return;
            }
            
            // Check if server has reaction mode enabled OR if this is a reply-based vote
            const serverConfig = await DatabaseUtils.getServerConfig(pendingVote.server_id);
            const isReplyBasedVote = message.reference !== null;
            
            if (!serverConfig.reaction_mode && !isReplyBasedVote) {
                logger.debug('Reaction mode not enabled for this server and this is not a reply-based vote', 'VOTE');
                // Remove user's reaction since reaction voting is not enabled
                await this.removeUserReaction(reaction, user, 'Reaction voting not enabled');
                return;
            }

            // Check if vote has expired
            if (new Date() > new Date(pendingVote.expires_at)) {
                await DatabaseUtils.updateVoteStatus(pendingVote.id, 'expired');
                logger.vote('Vote has expired', 'REACTION');
                // Remove user's reaction since the vote has expired
                await this.removeUserReaction(reaction, user, 'Vote has expired');
                return;
            }

            // Prevent recipient from voting on their own poll (proposers are allowed to vote)
            if (user.id === pendingVote.target_user_id) {
                logger.vote('Target user cannot vote on their own proposal', 'REACTION');
                // Remove user's reaction since they can't vote on their own proposal
                await this.removeUserReaction(reaction, user, 'Cannot vote on your own proposal');
                return;
            }

            // Record the vote
            const voteType = isApproval ? 'approve' : 'reject';
            await DatabaseUtils.recordVote(pendingVote.id, user.id, voteType);
            
            logger.vote(`Recorded ${voteType} vote from ${userLabel}`, 'REACTION');
            
            // Get updated vote counts
            const voteCounts = await DatabaseUtils.getVoteCount(pendingVote.id);
            
            // Calculate required votes based on threshold mode
            const requiredVotes = this.calculateRequiredVotes(serverConfig, pendingVote.point_change);
            
            // Check if threshold is met
            if (voteCounts.approveCount >= requiredVotes) {
                const wasApproved = await this.approveVote(pendingVote, null, message);
                if (!wasApproved) {
                    // Vote was already processed by another user (race condition)
                    logger.vote(`Vote ${pendingVote.id} was already processed by another user`, 'REACTION');
                    return; // Exit early since vote is already handled
                }
            } else {
                // Update the embed with current vote counts
                await this.updateVoteEmbedForReaction(message, pendingVote, voteCounts, requiredVotes);
            }
            
            // Send feedback to the user about their vote
            try {
                const voteTypeText = isApproval ? 'approval' : 'rejection';
                const serverName = message.guild ? message.guild.name : 'Unknown Server';
                const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
                const progressText = `(${voteCounts.approveCount}/${requiredVotes} approvals, ${voteCounts.rejectCount} rejections)`;
                const feedbackMessage = `Your ${voteTypeText} vote in **${serverName}** has been recorded successfully! ${progressText}\n${messageLink}`;
                
                // Check if user wants DM notifications before sending
                const allowDMs = await DatabaseUtils.getUserDMPreference(user.id);
                if (allowDMs) {
                    // Try to send a DM to the user
                    await user.send(feedbackMessage);
                } else {
                    // User has disabled DMs, send fallback message in channel
                    throw new Error('User has disabled DM notifications');
                }
            } catch (dmError) {
                // If DM fails, send a public reply in the channel tagging the user (if possible)
                logger.debug(`Could not send DM feedback to ${userLabel}: ${dmError.message}`, 'VOTE');
                try {
                    if (message.channel && message.channel.send) {
                        await message.channel.send({
                            content: `${user}, your ${voteTypeText} vote has been recorded successfully! (DMs are closed)`
                        });
                    }
                } catch (chanErr) {
                    logger.debug(`Could not send fallback feedback in channel: ${chanErr.message}`, 'VOTE');
                }
            }

        } catch (error) {
            logger.errorWithStack('Error handling reaction vote', error, 'VOTE');
        }
    }

    /**
     * Handle reaction removal (vote retraction)
     * @param {MessageReaction} reaction - The reaction that was removed
     * @param {User} user - The user who removed the reaction
     */
    static async handleReactionRemove(reaction, user) {
        if (user.bot) return;
        
        const isApproval = reaction.emoji.name === '👍';
        const message = reaction.message;
        
        const userLabel = user.globalName || user.username;
        logger.debug(`Reaction removed: ${reaction.emoji.name}, isApproval: ${isApproval}, user: ${userLabel}`, 'VOTE');
        
        try {
            // Get pending vote
            const pendingVote = await DatabaseUtils.getPendingVote(message.id);
            
            if (!pendingVote) {
                logger.debug('No pending vote found for this message', 'VOTE');
                return;
            }
            
            // Check if vote has expired
            if (new Date() > new Date(pendingVote.expires_at)) {
                logger.vote('Vote has expired', 'REACTION');
                return;
            }
            
            // Prevent recipient from retracting votes on their own poll
            if (user.id === pendingVote.target_user_id) {
                logger.vote('Target user cannot retract votes on their own proposal', 'REACTION');
                return;
            }
            
            // Check if user has a vote to retract
            const existingVote = await DatabaseUtils.getUserVote(pendingVote.id, user.id);
            if (!existingVote) {
                logger.vote('User has no vote to retract', 'REACTION');
                return;
            }
            
            // Only retract if the reaction type matches the vote type
            const voteType = isApproval ? 'approve' : 'reject';
            if (existingVote.vote_type !== voteType) {
                logger.vote('Reaction type does not match existing vote type', 'REACTION');
                return;
            }
            
            // Remove the vote
            await DatabaseUtils.removeVote(pendingVote.id, user.id);
            logger.vote(`Retracted ${voteType} vote from ${userLabel}`, 'REACTION');
            
            // Get server config for threshold calculation
            const serverConfig = await DatabaseUtils.getServerConfig(pendingVote.server_id);
            
            // Get updated vote counts
            const voteCounts = await DatabaseUtils.getVoteCount(pendingVote.id);
            
            // Calculate required votes based on threshold mode
            const requiredVotes = this.calculateRequiredVotes(serverConfig, pendingVote.point_change);
            
            // Update the embed with current vote counts
            await this.updateVoteEmbedForReaction(message, pendingVote, voteCounts, requiredVotes);
            
            // Send feedback to the user about their vote retraction
            try {
                const voteTypeText = isApproval ? 'approval' : 'rejection';
                const serverName = message.guild ? message.guild.name : 'Unknown Server';
                const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
                const feedbackMessage = `Your ${voteTypeText} vote in **${serverName}** has been retracted ${messageLink}`;
                
                // Check if user wants DM notifications before sending
                const allowDMs = await DatabaseUtils.getUserDMPreference(user.id);
                if (allowDMs) {
                    // Try to send a DM to the user
                    await user.send(feedbackMessage);
                }
            } catch (dmError) {
                // If DM fails, we'll just log it
                logger.debug(`Could not send DM feedback to ${userLabel}: ${dmError.message}`, 'VOTE');
            }
            
        } catch (error) {
            console.error('Error handling reaction removal:', error);
        }
    }

    /**
     * Handle vote button interactions
     * @param {ButtonInteraction} interaction - The button interaction
     */
    static async handleVoteButton(interaction) {
        const { customId, user, message } = interaction;
        const isApproval = customId.startsWith('vote_approve');
        
        logger.debug(`Button clicked: ${customId}, isApproval: ${isApproval}`, 'VOTE');

        try {
            // Get pending vote
            const pendingVote = await DatabaseUtils.getPendingVote(message.id);
            
            if (!pendingVote) {
                return await interaction.reply({
                    content: '❌ This vote is no longer active!',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if vote has expired
            if (new Date() > new Date(pendingVote.expires_at)) {
                await DatabaseUtils.updateVoteStatus(pendingVote.id, 'expired');
                return await interaction.reply({
                    content: '⏰ This vote has expired!',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Prevent recipient from voting on their own poll (proposers are allowed to vote)
            if (user.id === pendingVote.target_user_id) {
                return await interaction.reply({
                    content: '❌ You cannot vote on a proposal about yourself!',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if user already has a vote
            const existingVote = await DatabaseUtils.getUserVote(pendingVote.id, user.id);
            const voteType = isApproval ? 'approve' : 'reject';
            let actionMessage = '';
            
            if (existingVote) {
                if (existingVote.vote_type === voteType) {
                    // User clicked the same button - retract their vote
                    await DatabaseUtils.removeVote(pendingVote.id, user.id);
                    actionMessage = `❌ Your ${voteType}al has been retracted.`;
                } else {
                    // User clicked the opposite button - switch their vote
                    await DatabaseUtils.removeVote(pendingVote.id, user.id);
                    await DatabaseUtils.recordVote(pendingVote.id, user.id, voteType);
                    const oldType = existingVote.vote_type === 'approve' ? 'approval' : 'rejection';
                    const newType = voteType === 'approve' ? 'approval' : 'rejection';
                    actionMessage = `🔄 Your vote has been switched from ${oldType} to ${newType}.`;
                }
            } else {
                // User has no existing vote - record new vote
                await DatabaseUtils.recordVote(pendingVote.id, user.id, voteType);
                actionMessage = `✅ Your ${voteType === 'approve' ? 'approval' : 'rejection'} has been recorded!`;
            }
            
            // Get updated vote counts
            const voteCounts = await DatabaseUtils.getVoteCount(pendingVote.id);
            const serverConfig = await DatabaseUtils.getServerConfig(pendingVote.server_id);
            
            // Calculate required votes based on threshold mode
            const requiredVotes = this.calculateRequiredVotes(serverConfig, pendingVote.point_change);
            
            // Check if threshold is met
            if (voteCounts.approveCount >= requiredVotes) {
                const wasApproved = await this.approveVote(pendingVote, interaction);
                if (!wasApproved) {
                    // Vote was already processed by another user (race condition)
                    actionMessage = '⚡ This vote was just approved by another user!';
                }
            } else {
                // Update the embed with current vote counts
                await this.updateVoteEmbed(interaction, pendingVote, voteCounts, requiredVotes);
            }

            // Acknowledge the vote action (record/retract/switch)
            await interaction.reply({
                content: actionMessage,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.errorWithStack('Error handling vote button', error, 'VOTE');
            await interaction.reply({
                content: '❌ There was an error processing your vote!',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    /**
     * Calculate required votes based on server configuration
     * @param {Object} serverConfig - Server configuration
     * @param {number} pointChange - Point change amount
     * @returns {number} Required votes
     */
    static calculateRequiredVotes(serverConfig, pointChange) {
        if (serverConfig.threshold_mode === 'formula') {
            const calculated = serverConfig.formula_base + (Math.abs(pointChange) * serverConfig.formula_multiplier);
            return Math.max(1, Math.ceil(calculated)); // Round up to next whole number, minimum 1 vote required
        }
        return serverConfig.threshold;
    }

    /**
     * Update vote embed for reaction voting
     * @param {Message} message - The message to update
     * @param {Object} pendingVote - The pending vote data
     * @param {Object} voteCounts - Current vote counts
     * @param {number} requiredVotes - Required votes for approval
     */
    static async updateVoteEmbedForReaction(message, pendingVote, voteCounts, requiredVotes) {
        try {
            // Check if this is a reply-based vote (message has a reference to another message)
            // For reply-based voting, we don't update embeds since the message isn't bot-owned
            if (message.reference) {
                logger.debug(`Skipping embed update for reply-based vote (${voteCounts.approveCount}/${requiredVotes} approvals, ${voteCounts.rejectCount} rejections)`, 'VOTE');
                return;
            }
            
            // Check if the message is authored by the bot - only edit messages we own
            const client = message.client;
            if (message.author.id !== client.user.id) {
                logger.debug(`Skipping embed update for reaction-based vote on user message (${voteCounts.approveCount}/${requiredVotes} approvals, ${voteCounts.rejectCount} rejections)`, 'VOTE');
                // For user messages, we can't edit them, so we provide feedback through other means
                // The vote progress is still tracked in the database, just not displayed on the original message
                return;
            }
            
            const serverConfig = await DatabaseUtils.getServerConfig(pendingVote.server_id);
            
            // Get target user
            let targetUser;
            try {
                targetUser = await client.users.fetch(String(pendingVote.target_user_id));
            } catch (error) {
                logger.warn(`Could not fetch target user ${pendingVote.target_user_id}: ${error.message}`, 'VOTE');
                targetUser = { displayName: 'Unknown User', toString: () => '@Unknown' };
            }
            
            // Get proposer user
            let proposerUser;
            try {
                proposerUser = await message.client.users.fetch(String(pendingVote.proposer_id));
            } catch (error) {
                logger.warn(`Could not fetch proposer user ${pendingVote.proposer_id}: ${error.message}`, 'VOTE');
                proposerUser = { displayName: 'Unknown User' };
            }
            
            const embed = new EmbedBuilder()
                .setColor(serverConfig.embed_color || '#5865F2')
                .setTitle('🗳️ Point Award Proposal')
                .setDescription(`**${proposerUser.displayName}** wants to ${pendingVote.point_change > 0 ? 'award' : 'deduct'} **${Math.abs(pendingVote.point_change)}** point${Math.abs(pendingVote.point_change) !== 1 ? 's' : ''} ${pendingVote.point_change > 0 ? 'to' : 'from'} ${targetUser}`)
                .addFields([
                    { name: 'Reason', value: pendingVote.reason, inline: false },
                    { name: 'Progress', value: `${voteCounts.approveCount}/${requiredVotes} approvals`, inline: true },
                    { name: 'Rejections', value: `${voteCounts.rejectCount}`, inline: true }
                ])
                .setFooter({ text: 'Vote with 👍 or 👎 reactions' })
                .setTimestamp();
            
            await message.edit({ embeds: [embed] });
            
        } catch (error) {
            logger.errorWithStack('Error updating vote embed for reaction', error, 'VOTE');
        }
    }

    /**
     * Approve a vote and apply the score change
     * @param {Object} pendingVote - The pending vote data
     * @param {ButtonInteraction} interaction - The button interaction (optional for reactions)
     * @param {Message} message - The message (optional for reactions)
     */
    static async approveVote(pendingVote, interaction, message = null) {
        try {
            // Atomically approve the vote (race condition safe)
            // This will only succeed if the vote is still in 'pending' status
            const approvedVote = await DatabaseUtils.atomicApproveVote(pendingVote.id);
            
            if (!approvedVote) {
                // Vote was already processed by another user - this is normal with low thresholds
                logger.vote(`Vote ${pendingVote.id} was already processed by another user`, 'APPROVE');
                return false; // Indicate that this approval was not processed
            }

            // Apply score change (only if we successfully claimed the vote)
            // For reaction-based votes: use message_id (the message being reacted to)
            // For reply-based votes: use original_message_id (the message being replied to)
            const tracebackMessageId = pendingVote.original_message_id || pendingVote.message_id;
            
            await DatabaseUtils.applyScoreChange(
                pendingVote.target_user_id,
                pendingVote.server_id,
                pendingVote.point_change,
                pendingVote.reason,
                pendingVote.proposer_id,
                pendingVote.id, // pending vote ID for traceability
                tracebackMessageId, // Use original message ID for reply-based votes, or message ID for reaction-based votes
                pendingVote.channel_id // channel where the vote took place
            );

            // Assign leaderboard roles if configured
            try {
                const client = interaction ? interaction.client : message.client;
                const guild = client.guilds.cache.get(pendingVote.server_id);
                if (guild) {
                    await DatabaseUtils.assignLeaderboardRoles(pendingVote.server_id, guild);
                }
            } catch (roleError) {
                console.error('Error assigning leaderboard roles:', roleError);
                // Don't fail the vote if role assignment fails
            }

            // Get updated user score for feedback
            const newScore = await DatabaseUtils.getUserScore(pendingVote.target_user_id, pendingVote.server_id);
            const client = interaction ? interaction.client : message.client;
            const targetUser = await client.users.fetch(pendingVote.target_user_id);

            // Create success embed
            const serverConfig = await DatabaseUtils.getServerConfig(pendingVote.server_id);
            const successEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Vote Approved!')
                .setDescription(`${targetUser} has received **${pendingVote.point_change > 0 ? '+' : ''}${pendingVote.point_change}** point${Math.abs(pendingVote.point_change) !== 1 ? 's' : ''}`)
                .addFields([
                    { name: 'Reason', value: pendingVote.reason, inline: false },
                    { name: 'New Score', value: `${newScore} point${Math.abs(newScore) !== 1 ? 's' : ''}`, inline: true }
                ])
                .setTimestamp();

            // Update the message if possible (for slash commands and reaction voting)
            // For reply-based voting, we can't edit the original message, so we'll send a new message instead
            const messageToEdit = interaction ? interaction.message : message;
            
            try {
                // Check if this is a reply-based vote by checking if the message has a reference
                const isReplyBasedVote = message && message.reference;
                // Check if this is a reaction-based vote (message exists but no interaction)
                const isReactionBasedVote = message && !interaction && !isReplyBasedVote;
                
                if (isReplyBasedVote) {
                    // For reply-based voting, send a new message instead of editing
                    await message.reply({
                        embeds: [successEmbed]
                    });
                    
                    // Remove voting reactions from the reply message
                    try {
                        await message.reactions.removeAll();
                    } catch (reactionError) {
                        console.warn('Could not remove reactions:', reactionError.message);
                    }
                    
                    // Add success reaction to the reply message
                    await message.react('✅');
                } else if (isReactionBasedVote) {
                    // For reaction-based voting, reply to the original message with the success embed
                    // Check if the message is authored by our bot - if not, we can't edit it, so we reply
                    const client = message.client;
                    const isBotMessage = message.author.id === client.user.id;
                    
                    if (isBotMessage) {
                        // If it's our bot's message, we can edit it
                        await message.edit({
                            embeds: [successEmbed],
                            components: [] // Remove buttons/reactions
                        });
                    } else {
                        // If it's a user's message, reply with the success embed
                        await message.reply({
                            embeds: [successEmbed]
                        });
                    }
                } else {
                    // For slash commands, edit the original voting message
                    await messageToEdit.edit({
                        embeds: [successEmbed],
                        components: [] // Remove buttons/reactions
                    });
                }
            } catch (editError) {
                console.warn('Could not edit message, sending new message instead:', editError.message);
                // Fallback: send a new message if editing fails
                const channel = messageToEdit.channel;
                await channel.send({
                    embeds: [successEmbed]
                });
            }

            // Log the vote approval (includes all point information)
            const voteCounts = await DatabaseUtils.getVoteCount(pendingVote.id);
            await AuditLogger.logVoteEvent(client, pendingVote.server_id, {
                approved: true,
                voteId: pendingVote.id,
                targetUserId: pendingVote.target_user_id,
                proposedBy: pendingVote.proposer_id,
                points: pendingVote.point_change,
                approveCount: voteCounts.approveCount,
                threshold: voteCounts.requiredVotes || serverConfig.threshold,
                proposalReason: pendingVote.reason
            });

            // Note: Success feedback is already handled above via the success embed
            // No need to call sendFeedbackMessage again as it would create duplicate messages

            logger.vote(`Vote approved: ${(targetUser.globalName || targetUser.username || targetUser.displayName || 'Unknown User')} received ${pendingVote.point_change} points`, 'APPROVE');

        } catch (error) {
            logger.errorWithStack('Error approving vote', error, 'VOTE');
            throw error;
        }
    }



    /**
     * Update vote embed with current vote counts
     * @param {ButtonInteraction} interaction - The button interaction
     * @param {Object} pendingVote - The pending vote data
     * @param {Object} voteCounts - Current vote counts
     * @param {number} requiredVotes - Required votes for approval
     */
    static async updateVoteEmbed(interaction, pendingVote, voteCounts, requiredVotes) {
        try {
            // Add comprehensive null checks to prevent Discord API errors
            logger.object('Debug - pendingVote object', pendingVote, 'VOTE');
            
            if (!pendingVote.target_user_id || pendingVote.target_user_id === 'null' || 
                !pendingVote.proposer_id || pendingVote.proposer_id === 'null') {
                logger.error('Missing or invalid user IDs in pending vote', 'VOTE');
                logger.object('Invalid vote data', {
                    target_user_id: pendingVote.target_user_id,
                    proposer_id: pendingVote.proposer_id,
                    full_object: pendingVote
                }, 'VOTE');
                return;
            }
            
            // Convert to strings to prevent JavaScript number precision loss with Discord snowflakes
            const targetUserId = String(pendingVote.target_user_id);
            const proposerUserId = String(pendingVote.proposer_id);
            
            // Try to get users from guild members first (more reliable), then fallback to API fetch
            let targetUser = interaction.guild.members.cache.get(targetUserId)?.user;
            let proposerUser = interaction.guild.members.cache.get(proposerUserId)?.user;
            
            // If not in cache, try Discord API as fallback
            if (!targetUser) {
                try {
                    targetUser = await interaction.client.users.fetch(targetUserId);
                } catch (error) {
                    logger.warn(`Could not fetch target user ${targetUserId}: ${error.message}`, 'VOTE');
                    targetUser = { displayName: 'Unknown User', toString: () => '@Unknown' };
                }
            }
            
            if (!proposerUser) {
                try {
                    proposerUser = await interaction.client.users.fetch(proposerUserId);
                } catch (error) {
                    logger.warn(`Could not fetch proposer user ${proposerUserId}: ${error.message}`, 'VOTE');
                    proposerUser = { displayName: 'Unknown User', toString: () => '@Unknown' };
                }
            }
            const serverConfig = await DatabaseUtils.getServerConfig(pendingVote.server_id);

            const embed = new EmbedBuilder()
                .setColor(serverConfig.embed_color || '#5865F2')
                .setTitle('🗳️ Point Award Proposal')
                .setDescription(`**${proposerUser.displayName}** wants to ${pendingVote.point_change > 0 ? 'award' : 'deduct'} **${Math.abs(pendingVote.point_change)}** point${Math.abs(pendingVote.point_change) !== 1 ? 's' : ''} ${pendingVote.point_change > 0 ? 'to' : 'from'} ${targetUser}`)
                .addFields([
                    { name: 'Reason', value: pendingVote.reason, inline: false },
                    { name: 'Progress', value: `${voteCounts.approveCount}/${requiredVotes} approval${requiredVotes !== 1 ? 's' : ''}`, inline: true },
                    { name: 'Rejections', value: `${voteCounts.rejectCount}`, inline: true }
                ])
                .setFooter({ text: 'Vote with the buttons below' })
                .setTimestamp();

            await interaction.message.edit({ embeds: [embed] });

        } catch (error) {
            logger.errorWithStack('Error updating vote embed', error, 'VOTE');
        }
    }

    /**
     * Handle expired vote - update message and send feedback
     * @param {Object} pendingVote - The pending vote data
     * @param {Client} client - Discord client
     */
    static async handleExpiredVote(pendingVote, client) {
        try {
            // Get the channel and message
            const channel = await client.channels.fetch(pendingVote.channel_id);
            const message = await channel.messages.fetch(pendingVote.message_id);
            
            // Get target user for display
            const targetUserId = String(pendingVote.target_user_id);
            let targetUser;
            try {
                targetUser = await client.users.fetch(targetUserId);
            } catch (error) {
                console.warn(`Could not fetch target user ${targetUserId}:`, error.message);
                targetUser = { displayName: 'Unknown User', toString: () => '@Unknown' };
            }
            
            // Create timeout embed
            const serverConfig = await DatabaseUtils.getServerConfig(pendingVote.server_id);
            const timeoutEmbed = new EmbedBuilder()
                .setColor('#ff6b6b')
                .setTitle('⏰ Vote Expired')
                .setDescription(`Vote timed out - ${targetUser} did not receive **${pendingVote.point_change > 0 ? '+' : ''}${pendingVote.point_change}** point${Math.abs(pendingVote.point_change) !== 1 ? 's' : ''}`)  
                .addFields([
                    { name: 'Reason', value: pendingVote.reason, inline: false },
                    { name: 'Status', value: 'Expired - insufficient votes', inline: true },
                    { name: 'Time Limit', value: `${serverConfig.voting_timeout} minute${serverConfig.voting_timeout !== 1 ? 's' : ''}`, inline: true }
                ])
                .setTimestamp();
            
            // Only edit the original message if it was authored by the bot
            if (message.author.id === client.user.id) {
                await message.edit({
                    embeds: [timeoutEmbed],
                    components: [] // Remove buttons
                });
            } else {
                // Otherwise, send a new timeout message in the channel
                if (message.channel && message.channel.send) {
                    await message.channel.send({
                        embeds: [timeoutEmbed]
                    });
                }
            }
            
            // Log the vote expiration
            const voteCounts = await DatabaseUtils.getVoteCount(pendingVote.id);
            await AuditLogger.logVoteEvent(client, pendingVote.server_id, {
                approved: false,
                voteId: pendingVote.id,
                targetUserId: pendingVote.target_user_id,
                proposedBy: pendingVote.proposer_user_id,
                points: pendingVote.point_change,
                approveCount: voteCounts.approveCount,
                threshold: this.calculateRequiredVotes(serverConfig, pendingVote.point_change),
                proposalReason: pendingVote.reason,
                reason: 'Vote expired - time limit exceeded'
            });
            
            // Send feedback message if enabled
            if (serverConfig.failed_feedback) {
                await message.reply(`❌ Vote expired for ${targetUser} - insufficient votes within the time limit`);
            }
            
            logger.vote(`Vote expired: ${(targetUser.globalName || targetUser.username || targetUser.displayName || 'Unknown User')} did not receive ${pendingVote.point_change} points`, 'EXPIRE');
            
        } catch (error) {
            logger.errorWithStack('Error handling expired vote', error, 'VOTE');
        }
    }

    /**
     * Send feedback message for vote completion
     * @param {ButtonInteraction|null} interaction - The button interaction (null for reaction mode)
     * @param {Object} pendingVote - The pending vote data
     * @param {User} targetUser - The target user
     * @param {boolean} success - Whether the vote was successful
     * @param {Message|null} message - The message (for reaction mode)
     */
    static async sendFeedbackMessage(interaction, pendingVote, targetUser, success, message = null) {
        try {
            // Get channel from interaction (button mode) or message (reaction mode)
            const channel = interaction ? interaction.channel : message?.channel;
            
            if (!channel) {
                logger.warn('No channel available for feedback message', 'VOTE');
                return;
            }
            
            const pointText = `${pendingVote.point_change > 0 ? '+' : ''}${pendingVote.point_change}`;
            
            let feedbackMessage;
            if (success) {
                feedbackMessage = `🎉 ${targetUser} has received **${pointText}** point${Math.abs(pendingVote.point_change) !== 1 ? 's' : ''} - ${pendingVote.reason}`;
            } else {
                const voteCounts = await DatabaseUtils.getVoteCount(pendingVote.id);
                const serverConfig = await DatabaseUtils.getServerConfig(pendingVote.server_id);
                const requiredVotes = this.calculateRequiredVotes(serverConfig, pendingVote.point_change);
                feedbackMessage = `❌ Vote failed for ${targetUser} (${voteCounts.approveCount}/${requiredVotes} votes)`;
            }

            // Reply to the original voting message to create a notification and help users find the result
            const messageToReply = interaction ? interaction.message : message;
            await messageToReply.reply(feedbackMessage);

        } catch (error) {
            logger.errorWithStack('Error sending feedback message', error, 'VOTE');
        }
    }

    /**
     * Remove a user's reaction and optionally send them a DM explaining why
     * @param {MessageReaction} reaction - The reaction to remove
     * @param {User} user - The user whose reaction to remove
     * @param {string} reason - Reason for removal
     */
    static async removeUserReaction(reaction, user, reason) {
        try {
            // Remove the user's reaction
            await reaction.users.remove(user.id);
            logger.vote(`Removed reaction from ${userLabel}: ${reason}`, 'REACTION');
            
            // Check if user wants DM notifications
            const allowDMs = await DatabaseUtils.getUserDMPreference(user.id);
            
            if (allowDMs) {
                // Send DM explaining why their vote didn't register
                const embed = new EmbedBuilder()
                    .setColor('#ff8c00')
                    .setTitle('⚠️ Vote Not Registered')
                    .setDescription(`Your reaction vote was not registered and has been removed.`)
                    .addFields([
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'What you can do', value: 'You can try voting again if the issue has been resolved, or use slash commands instead of reactions.', inline: false }
                    ])
                    .setFooter({ text: 'You can disable these notifications with /preferences dm-notifications false' })
                    .setTimestamp();

                try {
                    await user.send({ embeds: [embed] });
                } catch (dmError) {
                    // User has DMs disabled or blocked the bot
                    logger.debug(`Could not send DM to ${userLabel}: ${dmError.message}`, 'VOTE');
                }
            }
        } catch (error) {
            logger.errorWithStack(`Error removing reaction from ${userLabel}`, error, 'VOTE');
        }
    }
}

module.exports = VotingUtils;
