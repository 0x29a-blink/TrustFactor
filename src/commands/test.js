const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../utils/database');
const { isTestingMode } = require('../utils/permissions');
const { supabase } = require('../config/database');

// Get owner ID from environment variable
const OWNER_ID = process.env.OWNER_ID || '160853902726660096';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Owner-exclusive testing utilities and admin override controls')
        .setDefaultMemberPermissions(0) // Restricts to server administrators by default
        .setContexts([0]) // Guild only
        .setIntegrationTypes([0]) // Guild install only
        .addSubcommand(subcommand =>
            subcommand
                .setName('award')
                .setDescription('Instantly award points (admin bypass)')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to award points to')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('points')
                        .setDescription('Points to award (can be negative)')
                        .setRequired(true)
                        .setMinValue(-100)
                        .setMaxValue(100)
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason for the award')
                        .setRequired(false)
                        .setMaxLength(256)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check testing mode status and permissions')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('override')
                .setDescription('Toggle owner-exclusive admin override mode')
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Enable/disable instant /award execution for bot owner only')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset a user\'s score (owner only)')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User whose score to reset')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset-database')
                .setDescription('🚨 DANGER: Reset entire database to initial state (Owner Only)')
                .addBooleanOption(option =>
                    option.setName('confirm')
                        .setDescription('Confirm you want to PERMANENTLY DELETE ALL DATA')
                        .setRequired(true))
        ),

    async execute(interaction) {
        const member = interaction.member;
        const serverId = interaction.guild.id;
        
        // Check if user is the bot owner (using environment variable)
        if (member.user.id !== OWNER_ID) {
            return await interaction.reply({
                content: '❌ This command is restricted to the bot owner only!',
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = interaction.options.getSubcommand();
        
        // Only get server config for subcommands that need it
        let serverConfig, testingMode, permissionLevel;
        if (subcommand !== 'reset-database') {
            serverConfig = await DatabaseUtils.getServerConfig(serverId);
            testingMode = isTestingMode(member, serverConfig.testing_mode);
            // permissionLevel = getPermissionLevel(member); // Removed unused import
        }

        try {
            switch (subcommand) {
                case 'award':
                    await handleTestAward(interaction, serverConfig, testingMode, permissionLevel);
                    break;
                case 'status':
                    await handleTestStatus(interaction, serverConfig, testingMode, permissionLevel);
                    break;
                case 'override':
                    await handleAdminOverride(interaction, serverConfig, permissionLevel);
                    break;
                case 'reset':
                    await handleTestReset(interaction, serverConfig, testingMode, permissionLevel);
                    break;
                case 'reset-database':
                    await handleDatabaseReset(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error in test command:', error);
            
            // Only reply if interaction hasn't been replied to yet
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ An error occurred while executing the test command.',
                        flags: MessageFlags.Ephemeral
                    });
                } catch (replyError) {
                    console.error('Error sending error reply:', replyError);
                }
            }
        }
    }
};

async function handleTestAward(interaction, serverConfig, testingMode, permissionLevel) {
    const targetUser = interaction.options.getUser('user');
    const points = interaction.options.getInteger('points');
    const reason = interaction.options.getString('reason') || 'Test award';
    const proposer = interaction.user;
    const serverId = interaction.guild.id;

    // Prevent self-awarding
    if (targetUser.id === proposer.id) {
        return await interaction.reply({
            content: '❌ You cannot award points to yourself!',
            flags: MessageFlags.Ephemeral
        });
    }

    // Prevent awarding bots
    if (targetUser.bot) {
        return await interaction.reply({
            content: '❌ You cannot award points to bots!',
            flags: MessageFlags.Ephemeral
        });
    }

    // Apply points instantly (admin bypass)
    await DatabaseUtils.applyScoreChange(
        targetUser.id,
        serverId,
        points,
        reason,
        proposer.id,
        null, // no pending vote ID for test commands
        interaction.id, // use interaction ID as message ID for test commands
        interaction.channelId // channel where the test command was used
    );

    // Get updated score
    const userScore = await DatabaseUtils.getUserScore(serverId, targetUser.id);
    
    // Create success embed
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🧪 Test Award Applied!')
        .setDescription(`**${targetUser}** has ${points > 0 ? 'received' : 'lost'} **${Math.abs(points)}** point${Math.abs(points) !== 1 ? 's' : ''}!`)
        .addFields([
            { name: 'Reason', value: reason, inline: false },
            { name: 'Applied By', value: `${proposer} (${permissionLevel.toUpperCase()})`, inline: true },
            { name: 'New Score', value: `${userScore.total_score} points`, inline: true },
            { name: 'Mode', value: '🧪 Testing Mode', inline: true }
        ])
        .setFooter({ text: 'Test command - No voting required' })
        .setTimestamp();

    console.log(`🧪 Test award: ${proposer.displayName} awarded ${points} points to ${targetUser.displayName}`);
    
    await interaction.reply({
        embeds: [embed]
    });
}

async function handleTestStatus(interaction, serverConfig, testingMode, permissionLevel) {
    const embed = new EmbedBuilder()
        .setColor(testingMode ? '#00ff00' : '#ffaa00')
        .setTitle('🧪 Testing Mode Status')
        .addFields([
            { name: 'Your Permission Level', value: permissionLevel.toUpperCase(), inline: true },
            { name: 'Testing Mode Active', value: testingMode ? '✅ Yes' : '❌ No', inline: true },
            { name: 'Environment', value: process.env.NODE_ENV || 'production', inline: true },
            { name: 'Available Features', value: testingMode ? '• Instant point awards\n• Bypass voting requirements\n• Admin commands' : '• Standard functionality only', inline: false }
        ])
        .setFooter({ text: 'Testing mode allows admins to bypass normal restrictions' })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

async function handleTestReset(interaction, serverConfig, testingMode, permissionLevel) {
    const targetUser = interaction.options.getUser('user');
    const serverId = interaction.guild.id;

    // Get current score
    const currentScore = await DatabaseUtils.getUserScore(targetUser.id, serverId);
    
    if (currentScore.total_score === 0) {
        return await interaction.reply({
            content: `❌ ${targetUser.displayName} already has 0 points!`,
            flags: MessageFlags.Ephemeral
        });
    }

    // Reset score by applying negative points
    const resetPoints = -currentScore.total_score;
    await DatabaseUtils.applyScoreChange(
        targetUser.id,
        serverId,
        resetPoints,
        'Score reset by admin',
        interaction.user.id,
        null, // no pending vote ID for test commands
        interaction.id, // use interaction ID as message ID for test commands
        interaction.channelId // channel where the test command was used
    );

    const embed = new EmbedBuilder()
        .setColor('#ff6600')
        .setTitle('🔄 Score Reset')
        .setDescription(`**${targetUser}**'s score has been reset to 0!`)
        .addFields([
            { name: 'Previous Score', value: `${currentScore.total_score} points`, inline: true },
            { name: 'New Score', value: '0 points', inline: true },
            { name: 'Reset By', value: `${interaction.user} (${permissionLevel.toUpperCase()})`, inline: true }
        ])
        .setFooter({ text: 'Admin test command' })
        .setTimestamp();

    console.log(`🔄 Score reset: ${interaction.user.displayName} reset ${targetUser.displayName}'s score from ${currentScore.total_score} to 0`);
    
    await interaction.reply({
        embeds: [embed]
    });
}

/**
 * Handle admin override toggle (owner only)
 */
async function handleAdminOverride(interaction, serverConfig, permissionLevel) {
    const enabled = interaction.options.getBoolean('enabled');
    const serverId = interaction.guild.id;

    try {
        const { supabase } = require('../config/database');
        const { data, error } = await supabase
            .from('servers')
            .update({ 
                testing_mode: enabled,
                updated_at: new Date().toISOString()
            })
            .eq('server_id', serverId)
            .select('testing_mode')
            .single();

        if (error) throw error;

        const status = enabled ? 'enabled' : 'disabled';
        const emoji = enabled ? '⚡' : '🔒';
        
        const embed = new EmbedBuilder()
            .setColor(enabled ? '#00ff00' : '#ff6600')
            .setTitle(`${emoji} Admin Override ${enabled ? 'Enabled' : 'Disabled'}`)
            .setDescription(`Owner admin override has been **${status}** for this server.\n\n${enabled ? '⚡ /award commands will now execute instantly without voting for BOT OWNER ONLY.' : '🗳️ /award commands will now require community voting for EVERYONE (including owner).'}`)
            .addFields([
                { name: 'Changed By', value: `${interaction.user} (${permissionLevel.toUpperCase()})`, inline: true },
                { name: 'Status', value: enabled ? '✅ Active' : '❌ Inactive', inline: true },
                { name: 'Affects', value: 'All admin /award commands', inline: true }
            ])
            .setFooter({ text: 'Owner-exclusive command' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        console.log(`⚡ Admin override ${status}: ${interaction.user.displayName}`);
    } catch (error) {
        console.error('Error updating admin override:', error);
        await interaction.reply({
            content: '❌ There was an error updating admin override. Please try again.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * Handle database reset (owner only)
 */
async function handleDatabaseReset(interaction) {
    const confirm = interaction.options.getBoolean('confirm');
    
    if (!confirm) {
        return await interaction.reply({
            content: '❌ Database reset cancelled. You must set `confirm` to `true` to proceed.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Defer reply as this operation may take time
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        // Define tables to clear in dependency order (children first)
        const tablesToClear = [
            'admin_roles',
            'audit_log',
            'custom_reactions',
            'pending_votes',
            'rate_limits',
            'score_history',
            'scores',
            'server_stats',
            'servers',
            'user_achievements',
            'user_server_preferences',
            'users',
            'votes'
        ];

        let clearedTables = 0;
        let totalTables = tablesToClear.length;

        // Clear all data from tables (safer than dropping/recreating)
        for (const tableName of tablesToClear) {
            try {
                // Delete all rows from the table
                const { error } = await supabase
                    .from(tableName)
                    .delete()
                    .neq('id', 0); // Delete all rows (using a condition that's always true)
                
                if (error && !error.message.includes('does not exist')) {
                    console.warn(`Warning clearing ${tableName}:`, error.message);
                    // Continue with other tables even if one fails
                }
                clearedTables++;
            } catch (tableError) {
                console.warn(`Could not clear table ${tableName}:`, tableError.message);
                // Continue with other tables
            }
        }

        // Success response
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Database Reset Complete')
            .setDescription('All user data has been cleared from the database.')
            .addFields(
                { name: '🗑️ Tables Cleared', value: `${clearedTables}/${totalTables} tables`, inline: true },
                { name: '📊 Status', value: clearedTables === totalTables ? 'Complete' : 'Partial', inline: true },
                { name: '⚠️ Note', value: 'Schema structure preserved', inline: true }
            )
            .setColor('#00FF00')
            .setTimestamp()
            .setFooter({ text: 'All user data has been permanently deleted' });

        await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
        console.error('Database reset error:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Database Reset Failed')
            .setDescription('An error occurred while resetting the database.')
            .addFields(
                { name: '🚨 Error', value: error.message || 'Unknown error', inline: false }
            )
            .setColor('#FF0000')
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}
