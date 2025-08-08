const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../utils/database');
const AuditLogger = require('../utils/logging');
const { supabase } = require('../config/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin commands for score management')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset a user\'s score to zero')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to reset score for')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('adjust')
                .setDescription('Manually adjust a user\'s score (bypass voting)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to adjust score for')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('points')
                        .setDescription('Points to add/subtract (use negative for deduction)')
                        .setRequired(true)
                        .setMinValue(-100)
                        .setMaxValue(100))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the adjustment')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a user\'s score to a specific value (bypass voting)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to set score for')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('score')
                        .setDescription('New score value to set')
                        .setRequired(true)
                        .setMinValue(-1000)
                        .setMaxValue(1000))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for setting the score')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear-history')
                .setDescription('Clear a user\'s score history (keeps current score)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to clear history for')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset-leaderboard')
                .setDescription('Reset ALL scores on the server (DESTRUCTIVE - requires confirmation)')
                .addStringOption(option =>
                    option.setName('confirm')
                        .setDescription('Type "CONFIRM" to proceed with server-wide reset')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('assign-leaderboard-roles')
                .setDescription('Manually trigger leaderboard role assignment for all users')),

    async execute(interaction) {
        const serverId = interaction.guild.id;
        
        // Check if bot is active on this server
        const serverConfig = await DatabaseUtils.getServerConfig(serverId);
        if (!serverConfig.is_active) {
            return await interaction.reply({
                content: '❌ TrustFactor bot is currently disabled on this server. Use `/config` to enable it.',
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'reset':
                    await handleUserReset(interaction, serverId);
                    break;
                case 'adjust':
                    await handleScoreAdjust(interaction, serverId);
                    break;
                case 'set':
                    await handleScoreSet(interaction, serverId);
                    break;
                case 'clear-history':
                    await handleClearHistory(interaction, serverId);
                    break;
                case 'reset-leaderboard':
                    await handleLeaderboardReset(interaction, serverId);
                    break;
                case 'assign-leaderboard-roles':
                    await handleAssignLeaderboardRoles(interaction, serverId);
                    break;
            }
        } catch (error) {
            console.error('Error in admin command:', error);
            await interaction.reply({
                content: '❌ There was an error executing the admin command. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

/**
 * Handle user score reset
 */
async function handleUserReset(interaction, serverId) {
    const targetUser = interaction.options.getUser('user');
    
    // Get current score (getUserScore returns a number, not an object)
    const currentScore = await DatabaseUtils.getUserScore(targetUser.id, serverId);
    
    // Check if user already has 0 points
    if (currentScore === 0) {
        return await interaction.reply({
            content: `❌ ${(targetUser.globalName || targetUser.username)} already has 0 points!`,
            flags: MessageFlags.Ephemeral
        });
    }

    // Reset score by applying negative points (ensure it's not 0)
    const resetPoints = -currentScore;
    
    // Double-check that we're not applying a 0-point change
    if (resetPoints === 0) {
        return await interaction.reply({
            content: `❌ Cannot reset ${(targetUser.globalName || targetUser.username)}'s score - they already have 0 points!`,
            flags: MessageFlags.Ephemeral
        });
    }
    
    await DatabaseUtils.applyScoreChange(
        targetUser.id,
        serverId,
        resetPoints,
        'Score reset by admin',
        interaction.user.id,
        null, // no pending vote ID for admin actions
        interaction.id, // use interaction ID as message ID for admin actions
        interaction.channelId // channel where the admin command was used
    );

    // Log the score reset
    await AuditLogger.logScoreReset(interaction.client, serverId, {
        targetUserId: targetUser.id,
        previousScore: currentScore,
        resetBy: interaction.user.id
    });

    const embed = new EmbedBuilder()
        .setColor('#ff6600')
        .setTitle('🔄 Score Reset')
        .setDescription(`**${targetUser}**'s score has been reset to 0!`)
        .addFields([
            { name: 'Previous Score', value: `${currentScore} points`, inline: true },
            { name: 'New Score', value: '0 points', inline: true },
            { name: 'Reset By', value: `${interaction.user}`, inline: true }
        ])
        .setFooter({ text: 'Admin command' })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * Handle manual score adjustment
 */
async function handleScoreAdjust(interaction, serverId) {
    const targetUser = interaction.options.getUser('user');
    const points = interaction.options.getInteger('points');
    const reason = interaction.options.getString('reason') || 'Manual admin adjustment';

    // Validate that points is not 0
    if (points === 0) {
        return await interaction.reply({
            content: '❌ Cannot adjust score by 0 points! Use `/admin set` to set a specific score value, or use a non-zero adjustment.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Get current score (getUserScore returns a number, not an object)
    const currentScore = await DatabaseUtils.getUserScore(targetUser.id, serverId);
    
    // Apply score change
    await DatabaseUtils.applyScoreChange(
        targetUser.id,
        serverId,
        points,
        reason,
        interaction.user.id,
        null, // no pending vote ID for admin actions
        interaction.id, // use interaction ID as message ID for admin actions
        interaction.channelId // channel where the admin command was used
    );

    // Assign leaderboard roles if configured
    try {
        const guild = interaction.guild;
        if (guild) {
            await DatabaseUtils.assignLeaderboardRoles(serverId, guild);
        }
    } catch (roleError) {
        console.error('Error assigning leaderboard roles:', roleError);
        // Don't fail the admin command if role assignment fails
    }

    // Get updated score (getUserScore returns a number, not an object)
    const newScore = await DatabaseUtils.getUserScore(targetUser.id, serverId);

    // Log the admin override and point award
    await AuditLogger.logAdminOverride(interaction.client, serverId, {
        adminId: interaction.user.id,
        action: 'Manual Score Adjustment',
        target: targetUser.id,
        details: `${points > 0 ? 'Added' : 'Deducted'} ${Math.abs(points)} point${Math.abs(points) !== 1 ? 's' : ''} - ${reason}`
    });

    await AuditLogger.logPointAward(interaction.client, serverId, {
        targetUserId: targetUser.id,
        points: points,
        newTotal: newScore, // newScore is already a number
        awardedBy: interaction.user.id,
        method: 'Admin Adjustment',
        reason: reason
    });

    const embed = new EmbedBuilder()
        .setColor(points > 0 ? '#00ff00' : '#ff6b6b')
        .setTitle(`${points > 0 ? '📈' : '📉'} Score Adjusted`)
        .setDescription(`**${targetUser}**'s score has been manually adjusted!`)
        .addFields([
            { name: 'Points Changed', value: `${points > 0 ? '+' : ''}${points}`, inline: true },
            { name: 'Previous Score', value: `${currentScore} points`, inline: true }, // currentScore is already a number
            { name: 'New Score', value: `${newScore} points`, inline: true }, // newScore is already a number
            { name: 'Reason', value: reason, inline: false },
            { name: 'Adjusted By', value: `${interaction.user}`, inline: true }
        ])
        .setFooter({ text: 'Admin command - bypassed voting' })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * Handle setting user score to a specific value
 */
async function handleScoreSet(interaction, serverId) {
    const targetUser = interaction.options.getUser('user');
    const newScore = interaction.options.getInteger('score');
    const reason = interaction.options.getString('reason') || 'Score set by admin';

    // Use the new setUserScore method for accurate absolute score setting
    const result = await DatabaseUtils.setUserScore(
        targetUser.id,
        serverId,
        newScore,
        reason,
        interaction.user.id
    );
    
    // If no change was needed, inform the user
    if (result.point_change === 0) {
        return await interaction.reply({
            content: `❌ ${(targetUser.globalName || targetUser.username)} already has ${newScore} points!`,
            flags: MessageFlags.Ephemeral
        });
    }

    // Assign leaderboard roles if configured
    try {
        const guild = interaction.guild;
        if (guild) {
            await DatabaseUtils.assignLeaderboardRoles(serverId, guild);
        }
    } catch (roleError) {
        console.error('Error assigning leaderboard roles:', roleError);
        // Don't fail the admin command if role assignment fails
    }

    // Log the admin override and point award
    await AuditLogger.logAdminOverride(interaction.client, serverId, {
        adminId: interaction.user.id,
        action: 'Set User Score',
        target: targetUser.id,
        details: `Set score to ${newScore} (was ${result.previous_score}) - ${reason}`
    });

    await AuditLogger.logPointAward(interaction.client, serverId, {
        targetUserId: targetUser.id,
        points: result.point_change,
        newTotal: newScore,
        awardedBy: interaction.user.id,
        method: 'Admin Set Score',
        reason: reason
    });

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📊 Score Set')
        .setDescription(`**${targetUser}**'s score has been set to ${newScore}!`)
        .addFields([
            { name: 'Previous Score', value: `${result.previous_score} points`, inline: true },
            { name: 'New Score', value: `${newScore} points`, inline: true },
            { name: 'Change', value: `${result.point_change > 0 ? '+' : ''}${result.point_change} points`, inline: true },
            { name: 'Reason', value: reason, inline: false },
            { name: 'Set By', value: `${interaction.user}`, inline: true }
        ])
        .setFooter({ text: 'Admin command - bypassed voting' })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * Handle clearing user score history
 */
async function handleClearHistory(interaction, serverId) {
    const targetUser = interaction.options.getUser('user');

    // Clear score history but keep current total
    const { error } = await supabase
        .from('score_history')
        .delete()
        .eq('user_id', String(targetUser.id))
        .eq('server_id', String(serverId));

    if (error) {
        console.error('Error clearing score history:', error);
        return await interaction.reply({
            content: '❌ There was an error clearing the score history. Please try again.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Log the action
    await AuditLogger.logCustomEvent(interaction.client, serverId, {
        title: '🗑️ Score History Cleared',
        description: `Score history cleared for ${targetUser}`,
        fields: [
            { name: 'Target User', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Cleared By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Action', value: 'History cleared (score preserved)', inline: true }
        ],
        color: '#ff8c00'
    });

    const embed = new EmbedBuilder()
        .setColor('#ff8c00')
        .setTitle('🗑️ History Cleared')
        .setDescription(`**${targetUser}**'s score history has been cleared!`)
        .addFields([
            { name: 'Action', value: 'All historical entries removed', inline: true },
            { name: 'Current Score', value: 'Preserved (unchanged)', inline: true },
            { name: 'Cleared By', value: `${interaction.user}`, inline: true }
        ])
        .setFooter({ text: 'Admin command - history only' })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * Handle server-wide leaderboard reset
 */
async function handleLeaderboardReset(interaction, serverId) {
    const confirmation = interaction.options.getString('confirm');

    if (confirmation !== 'CONFIRM') {
        return await interaction.reply({
            content: '❌ Server-wide reset cancelled. You must type "CONFIRM" exactly to proceed with this destructive action.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Get count of affected users before deletion
    const { count: userCount } = await supabase
        .from('scores')
        .select('*', { count: 'exact', head: true })
        .eq('server_id', String(serverId));

    const { count: historyCount } = await supabase
        .from('score_history')
        .select('*', { count: 'exact', head: true })
        .eq('server_id', String(serverId));

    // Clear all scores and history for this server
    const { error: scoresError } = await supabase
        .from('scores')
        .delete()
        .eq('server_id', String(serverId));

    const { error: historyError } = await supabase
        .from('score_history')
        .delete()
        .eq('server_id', String(serverId));

    if (scoresError || historyError) {
        console.error('Error resetting leaderboard:', scoresError || historyError);
        return await interaction.reply({
            content: '❌ There was an error resetting the leaderboard. Please try again.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Log the critical action
    await AuditLogger.logCustomEvent(interaction.client, serverId, {
        title: '🚨 LEADERBOARD RESET',
        description: '**CRITICAL ACTION: All user scores and history permanently deleted**',
        fields: [
            { name: 'Reset By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Users Affected', value: `${userCount || 0} users`, inline: true },
            { name: 'History Entries', value: `${historyCount || 0} entries`, inline: true },
            { name: 'Status', value: 'Complete', inline: true }
        ],
        color: '#ff0000'
    }, {
        channel: interaction.channel,
        user: interaction.user
    });

    const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🚨 Leaderboard Reset Complete')
        .setDescription('**ALL user scores and history have been permanently deleted!**')
        .addFields([
            { name: '👥 Users Affected', value: `${userCount || 0} users`, inline: true },
            { name: '📊 History Entries', value: `${historyCount || 0} entries`, inline: true },
            { name: '🔄 Status', value: 'Complete', inline: true },
            { name: '⚠️ Warning', value: 'This action cannot be undone', inline: false },
            { name: 'Reset By', value: `${interaction.user}`, inline: true }
        ])
        .setFooter({ text: 'Admin command - DESTRUCTIVE ACTION' })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * Handle manual leaderboard role assignment
 */
async function handleAssignLeaderboardRoles(interaction, serverId) {
    try {
        // Defer reply since this might take a moment
        await interaction.deferReply({ ephemeral: true });

        // Get server configuration to check if leaderboard roles are configured
        const serverConfig = await DatabaseUtils.getServerConfig(serverId);
        const leaderboardRoles = serverConfig.leaderboard_roles || {};
        
        if (Object.keys(leaderboardRoles).length === 0) {
            return await interaction.editReply({
                content: '❌ No leaderboard roles are configured for this server. Use `/config` → Leaderboard Roles to configure them first.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Assign leaderboard roles
        const results = await DatabaseUtils.assignLeaderboardRoles(serverId, interaction.guild);

        // Log the action
        await AuditLogger.logCustomEvent(interaction.client, serverId, {
            title: '🥇 Leaderboard Roles Assigned',
            description: 'Manual leaderboard role assignment triggered',
            fields: [
                { name: 'Triggered By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Roles Assigned', value: `${results.assigned} users`, inline: true },
                { name: 'Roles Removed', value: `${results.removed} users`, inline: true },
                { name: 'Errors', value: results.errors.length > 0 ? `${results.errors.length} errors` : 'None', inline: true }
            ],
            color: '#00ff00'
        });

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🥇 Leaderboard Roles Updated')
            .setDescription('Leaderboard role assignment completed successfully!')
            .addFields([
                { name: '✅ Roles Assigned', value: `${results.assigned} users`, inline: true },
                { name: '🗑️ Roles Removed', value: `${results.removed} users`, inline: true },
                { name: '❌ Errors', value: results.errors.length > 0 ? `${results.errors.length} errors` : 'None', inline: true }
            ])
            .setFooter({ text: 'Manual assignment triggered by admin' })
            .setTimestamp();

        if (results.errors.length > 0) {
            embed.addFields([
                {
                    name: '⚠️ Error Details',
                    value: results.errors.slice(0, 5).join('\n') + (results.errors.length > 5 ? '\n...and more' : ''),
                    inline: false
                }
            ]);
        }

        await interaction.editReply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        console.error('Error assigning leaderboard roles:', error);
        await interaction.editReply({
            content: '❌ There was an error assigning leaderboard roles. Please check the console for details.',
            flags: MessageFlags.Ephemeral
        });
    }
}
