const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../utils/database');
const VotingUtils = require('../utils/voting');
const { isTestingMode, getPermissionLevel } = require('../utils/permissions');
const AuditLogger = require('../utils/logging');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('award')
        .setDescription('Award or deduct points from a user (requires community voting)')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to award points to')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('points')
                .setDescription('Points to award (positive) or deduct (negative)')
                .setRequired(true)
                .setMinValue(-100)
                .setMaxValue(100)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for awarding/deducting points')
                .setRequired(false)
                .setMaxLength(256)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const points = interaction.options.getInteger('points');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const proposer = interaction.user;
        const serverId = interaction.guild.id;

        // Log command execution
        logger.command(`Award command executed by ${proposer.tag}`, 'AWARD');
        logger.verbose(`Award details: ${points} points to ${targetUser.tag} (${targetUser.id})`, 'AWARD');
        logger.verbose(`Reason: ${reason}`, 'AWARD');

        // Prevent self-awarding
        if (targetUser.id === proposer.id) {
            logger.vote('User attempted to award points to themselves', 'AWARD');
            return await interaction.reply({
                content: '❌ You cannot award points to yourself!',
                flags: MessageFlags.Ephemeral
            });
        }

        // Prevent awarding bots
        if (targetUser.bot) {
            logger.vote('User attempted to award points to bot', 'AWARD');
            return await interaction.reply({
                content: '❌ You cannot award points to bots!',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            // Get server configuration
            const serverConfig = await DatabaseUtils.getServerConfig(serverId);
            
            // Check if bot is active for this server
            if (!serverConfig.is_active) {
                logger.config(`Bot is disabled for server ${serverId}`, 'AWARD');
                return await interaction.reply({
                    content: '🚫 **TrustFactor bot is currently disabled** for this server.\n\nServer administrators can re-enable it using `/config` → Advanced → Bot Status.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            // Check if points are within server limits
            if (points > serverConfig.max_points_per_award || points < serverConfig.min_points_per_award) {
                logger.vote(`Invalid point amount: ${points} (limits: ${serverConfig.min_points_per_award} to ${serverConfig.max_points_per_award})`, 'AWARD');
                return await interaction.reply({
                    content: `❌ Points must be between ${serverConfig.min_points_per_award} and ${serverConfig.max_points_per_award}!`,
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check minimum vote magnitude (absolute value constraint)
            if (Math.abs(points) < serverConfig.min_vote_magnitude) {
                logger.vote(`Invalid point amount: ${points} (minimum magnitude: ${serverConfig.min_vote_magnitude})`, 'AWARD');
                return await interaction.reply({
                    content: `❌ Point awards must have a minimum magnitude of ${serverConfig.min_vote_magnitude}! (You tried ±${Math.abs(points)})`,
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check for admin bypass/testing mode
            const member = interaction.member;
            const testingMode = isTestingMode(member, serverConfig.testing_mode);
            const permissionLevel = getPermissionLevel(member);
            
            if (testingMode) {
                // Admin bypass: instantly apply points without voting
                await DatabaseUtils.applyScoreChange(
                    targetUser.id,
                    serverId,
                    points,
                    reason,
                    proposer.id,
                    null, // no pending vote ID for admin bypass
                    interaction.id, // use interaction ID as message ID for admin awards
                    interaction.channelId // channel where the command was used
                );

                // Update roles immediately (leaderboard and auto roles)
                try {
                    const guild = interaction.guild;
                    if (guild) {
                        await DatabaseUtils.assignLeaderboardRoles(serverId, guild);
                        await DatabaseUtils.assignAutoRoles(serverId, guild);
                    }
                } catch (roleError) {
                    console.error('Error assigning roles:', roleError);
                }

                // Get updated score (returns a number)
                const userScore = await DatabaseUtils.getUserScore(targetUser.id, serverId);
                
                // Log admin override usage
                await AuditLogger.logAdminOverride(interaction.client, serverId, {
                    adminId: proposer.id,
                    action: 'Instant Point Award',
                    target: targetUser.id,
                    details: `${points > 0 ? 'Awarded' : 'Deducted'} ${Math.abs(points)} point${Math.abs(points) !== 1 ? 's' : ''} - ${reason}`
                });
                
                // Log the point award
                await AuditLogger.logPointAward(interaction.client, serverId, {
                    targetUserId: targetUser.id,
                    points: points,
                    newTotal: userScore,
                    awardedBy: proposer.id,
                    method: 'Admin Override',
                    reason: reason
                });
                
                // Create instant success embed
                const successEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('⚡ Admin Override - Points Applied!')
                    .setDescription(`**${targetUser}** has ${points > 0 ? 'received' : 'lost'} **${Math.abs(points)}** point${Math.abs(points) !== 1 ? 's' : ''}!`)
                    .addFields([
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'Applied By', value: `${proposer} (${permissionLevel.toUpperCase()})`, inline: true },
                        { name: 'New Score', value: `${userScore} points`, inline: true },
                        { name: 'Mode', value: '🧪 Testing Mode', inline: true }
                    ])
                    .setFooter({ text: 'No voting required - Admin override active' })
                    .setTimestamp();

                logger.security(`Admin override: ${(proposer.globalName || proposer.username)} instantly awarded ${points} points to ${(targetUser.globalName || targetUser.username)}`, 'AWARD');
                
                return await interaction.reply({
                    embeds: [successEmbed]
                });
            }

            // Calculate expiration time
            const expiresAt = new Date(Date.now() + (serverConfig.voting_timeout * 60 * 1000));
            
            // Calculate required votes based on threshold mode (fixed or formula)
            const votesNeeded = VotingUtils.calculateRequiredVotes(serverConfig, points);

            // Create confirmation embed (after votesNeeded calculation)
            const embed = new EmbedBuilder()
                .setColor(serverConfig.embed_color || '#5865F2')
                .setTitle('🗳️ Point Award Proposal')
                .setDescription(`**${proposer.globalName || proposer.username}** wants to ${points > 0 ? 'award' : 'deduct'} **${Math.abs(points)}** point${Math.abs(points) !== 1 ? 's' : ''} ${points > 0 ? 'to' : 'from'} ${targetUser}`)
                .addFields([
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Votes Needed', value: `${votesNeeded} approval${votesNeeded !== 1 ? 's' : ''}`, inline: true },
                    { name: 'Time Limit', value: `${serverConfig.voting_timeout} minute${serverConfig.voting_timeout !== 1 ? 's' : ''}`, inline: true }
                ])
                .setFooter({ text: 'Vote with the buttons below' })
                .setTimestamp();

            // Create voting buttons (only if reaction mode is disabled)
            let components = [];
            if (!serverConfig.reaction_mode) {
                const voteButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('vote_approve')
                            .setLabel('✅ Approve')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('vote_reject')
                            .setLabel('❌ Reject')
                            .setStyle(ButtonStyle.Danger)
                    );
                components = [voteButtons];
            }

            // Update embed footer based on voting mode
            if (serverConfig.reaction_mode) {
                embed.setFooter({ text: 'Vote with 👍 or 👎 reactions' });
            } else {
                embed.setFooter({ text: 'Vote with the buttons below' });
            }

            // Send confirmation message
            await interaction.reply({
                embeds: [embed],
                components: components
            });

            // Fetch the reply message to get its ID
            const confirmationMessage = await interaction.fetchReply();
            
            // Add reactions if reaction mode is enabled
            if (serverConfig.reaction_mode) {
                try {
                    await confirmationMessage.react('👍');
                    await confirmationMessage.react('👎');
                    logger.vote('Added voting reactions to message', 'AWARD');
                } catch (error) {
                    logger.errorWithStack('Error adding reactions to voting message', error, 'AWARD');
                }
            }
            
                        // Create pending vote record with explicit string conversion for all Discord IDs
            const voteData = {
                messageId: String(confirmationMessage.id),
                originalMessageId: null, // Command-based votes don't have an original message
                channelId: String(interaction.channel.id),
                proposerId: String(proposer.id),
                targetUserId: String(targetUser.id),
                serverId: String(serverId),
                pointChange: points,
                reason: reason,
                votesNeeded: votesNeeded,
                expiresAt: expiresAt
            };
            
            const pendingVote = await DatabaseUtils.createPendingVote(voteData);
            
            logger.vote(`Created pending vote: ${(proposer.globalName || proposer.username)} wants to award ${points} points to ${(targetUser.globalName || targetUser.username)}`, 'AWARD');
            
            // In reaction mode, don't auto-approve - let user manually react
            if (!serverConfig.reaction_mode && serverConfig.auto_approval !== false) {
                // Automatically record the proposer's approval vote (button mode only, if auto-approval is enabled)
                await DatabaseUtils.recordVote(pendingVote.id, proposer.id, 'approve');
                logger.vote(`Auto-approved by proposer: ${(proposer.globalName || proposer.username)}`, 'AWARD');
                
                // Send immediate ephemeral confirmation to the user
                await interaction.followUp({
                    content: `✅ **Award proposal created!** Your vote has been automatically approved on your behalf. ${votesNeeded === 1 ? 'Since only 1 vote is needed, your award will be processed immediately.' : `Waiting for ${votesNeeded - 1} more approval${votesNeeded - 1 !== 1 ? 's' : ''} from other members.`}`,
                    flags: MessageFlags.Ephemeral
                });
            } else if (!serverConfig.reaction_mode) {
                // Button mode but auto-approval disabled
                await interaction.followUp({
                    content: `✅ **Award proposal created!** Use the buttons below to vote on your proposal. ${votesNeeded === 1 ? 'Only 1 vote needed.' : `${votesNeeded} votes needed from members.`}`,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                // In reaction mode, just confirm proposal creation
                await interaction.followUp({
                    content: `✅ **Award proposal created!** Add your 👍 reaction to vote on your own proposal. ${votesNeeded === 1 ? 'Only 1 vote needed.' : `${votesNeeded} votes needed from members.`}`,
                    flags: MessageFlags.Ephemeral
                });
            }
            
            // Update the original message with current vote counts if auto-approval occurred
            if (!serverConfig.reaction_mode) {
                const updatedVoteCounts = await DatabaseUtils.getVoteCount(pendingVote.id);
                
                // Update the original message to show current vote progress
                const updatedEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('🏆 Point Award Proposal')
                    .setDescription(`${(proposer.globalName || proposer.username)} wants to award **${points} point${points !== 1 ? 's' : ''}** to ${(targetUser.globalName || targetUser.username)}`)
                    .addFields(
                        { name: 'Reason', value: reason || 'No reason provided', inline: false },
                        { name: 'Progress', value: `${updatedVoteCounts.approveCount}/${votesNeeded} approval${votesNeeded !== 1 ? 's' : ''}`, inline: true },
                        { name: 'Rejections', value: `${updatedVoteCounts.rejectCount}`, inline: true }
                    )
                    .setFooter({ text: 'Vote with the buttons below' })
                    .setTimestamp();
                
                // Update the original message with current vote counts
                await confirmationMessage.edit({
                    embeds: [updatedEmbed],
                    components: components // Keep the original buttons
                });
            }
            
            // Check if the vote threshold is met (only relevant in button mode with auto-approval)
            if (!serverConfig.reaction_mode && serverConfig.auto_approval !== false) {
                const voteCounts = await DatabaseUtils.getVoteCount(pendingVote.id);
                if (voteCounts.approveCount >= votesNeeded) {
                    logger.vote(`Vote threshold met (${voteCounts.approveCount}/${votesNeeded}) - executing proposal immediately`, 'AWARD');
                    
                    // Apply the score change
                    const result = await DatabaseUtils.applyScoreChange(
                        targetUser.id,
                        serverId,
                        points,
                        reason || 'No reason provided',
                        proposer.id,
                        pendingVote.id,
                        confirmationMessage.id, // message ID of the vote confirmation
                        confirmationMessage.channelId // channel where the vote took place
                    );

                    // Update roles after applying score change
                    try {
                        const guild = interaction.guild;
                        if (guild) {
                            await DatabaseUtils.assignLeaderboardRoles(serverId, guild);
                            await DatabaseUtils.assignAutoRoles(serverId, guild);
                        }
                    } catch (roleError) {
                        console.error('Error assigning roles:', roleError);
                    }
                    
                    // Mark vote as approved
                    await DatabaseUtils.updateVoteStatus(pendingVote.id, 'approved');
                
                // Create success embed without vote buttons
                const successEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Award Approved!')
                    .setDescription(`${(proposer.globalName || proposer.username)} awarded **${points} point${points !== 1 ? 's' : ''}** to ${(targetUser.globalName || targetUser.username)}`)
                    .addFields(
                        { name: 'Reason', value: reason || 'No reason provided', inline: false },
                        { name: 'New Score', value: `${result.total_score} points`, inline: true },
                        { name: 'Status', value: 'Approved automatically', inline: true }
                    )
                    .setTimestamp();
                
                // Edit the original message to remove vote buttons and show success
                await confirmationMessage.edit({ 
                    embeds: [successEmbed], 
                    components: [] // Remove vote buttons
                });
                
                // Send confirmation reply to the user
                await interaction.followUp({
                    content: `✅ **Award approved!** ${(targetUser.globalName || targetUser.username)} received ${points} point${points !== 1 ? 's' : ''} and now has ${result.total_score} points total.`,
                    flags: MessageFlags.Ephemeral
                });
                
                logger.vote(`Award executed: ${(targetUser.globalName || targetUser.username)} received ${points} points (new total: ${result.total_score})`, 'AWARD');
                }
            }

        } catch (error) {
            logger.errorWithStack('Error creating award proposal', error, 'AWARD');
            
            // Check if interaction has already been replied to
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: '❌ There was an error creating your proposal. Please try again.',
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    content: '❌ There was an error creating your proposal. Please try again.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },
};
