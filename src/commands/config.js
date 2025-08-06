const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../utils/database');
const AuditLogger = require('../utils/logging');
const { supabase } = require('../config/database');
const { handleServerSettingsChange } = require('../utils/syncHandler');
const { getServerSyncStatus, isServerPriority } = require('../utils/syncUtils');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configure server settings for TrustFactor bot (interactive menu)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        logger.command(`Config command executed by ${interaction.user.tag}`, 'CONFIG');
        logger.verbose(`Config command for server: ${interaction.guild.name} (${interaction.guild.id})`, 'CONFIG');
        
        try {
            const serverId = String(interaction.guild.id);
            let serverConfig = await DatabaseUtils.getServerConfig(serverId);
            
            // Check if server is in sync but not priority - use priority server's config
            const syncStatus = await getServerSyncStatus(serverId);
            const isPriority = await isServerPriority(serverId);
            
            if (syncStatus && !isPriority) {
                logger.sync(`Using priority server config for ${serverId}`, 'CONFIG');
                // Get priority server's configuration
                const priorityServerId = syncStatus.sync_groups.priority_server;
                serverConfig = await DatabaseUtils.getServerConfig(priorityServerId);
                // Keep the original server ID for reference but use priority server's settings
                serverConfig.original_server_id = serverId;
                serverConfig.is_view_only = true;
            }
            
            await this.showMainConfigMenu(interaction, serverConfig);
            logger.command(`Config menu displayed successfully`, 'CONFIG');
        } catch (error) {
            logger.errorWithStack('Error handling config command', error, 'CONFIG');
            await interaction.reply({
                content: '❌ There was an error loading the configuration. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    },

    // Helper method to handle interaction updates consistently
    async updateInteraction(interaction, options) {
        try {
            // Check if this is a deferred interaction
            if (interaction.deferred) {
                // For select menus that used deferReply, we need to edit the reply
                // For buttons that used deferUpdate, we also use editReply
                await interaction.editReply(options);
            } else if (interaction.replied) {
                await interaction.editReply(options);
            } else {
                await interaction.reply(options);
            }
        } catch (error) {
            logger.errorWithStack('Error updating interaction', error, 'CONFIG');
            // Try to send a fallback error message
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ There was an error updating the interface. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                } else {
                    await interaction.followUp({
                        content: '❌ There was an error updating the interface. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (fallbackError) {
                logger.errorWithStack('Error sending fallback error message', fallbackError, 'CONFIG');
            }
        }
    },

    async showMainConfigMenu(interaction, serverConfig) {
        // Load custom reaction count
        const customReactions = await DatabaseUtils.getCustomReactions(interaction.guild.id);
        const reactionCount = customReactions.length;
        
        // Check sync status to determine if buttons should be disabled
        const serverId = String(interaction.guild.id);
        const syncStatus = await getServerSyncStatus(serverId);
        const isPriority = await isServerPriority(serverId);
        const isInSyncButNotPriority = Boolean(syncStatus && !isPriority);
        
        let description = 'Configure all aspects of your TrustFactor bot settings using the interactive menu below.';
        
        if (isInSyncButNotPriority) {
            description = `🔒 **View-Only Mode**: This server is part of sync group "**${syncStatus.sync_groups.group_name}**" but is not the priority server.\n\nConfiguration changes can only be made on the priority server and will automatically sync to all group members.`;
        }
        
        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('⚙️ TrustFactor Server Configuration')
            .setDescription(description)
            .addFields([
                { 
                    name: '🗳️ Voting Settings', 
                    value: `Mode: ${serverConfig.threshold_mode === 'formula' ? 'Formula-based' : 'Fixed'}${serverConfig.threshold_mode === 'fixed' ? ` (${serverConfig.threshold} votes)` : ` (base: ${serverConfig.formula_base}, mult: ${serverConfig.formula_multiplier}x)`}\nTimeout: ${serverConfig.voting_timeout} minutes\nReaction Mode: ${serverConfig.reaction_mode ? '✅' : '❌'}\nAuto-Approval: ${serverConfig.auto_approval !== false ? '✅' : '❌'}`, 
                    inline: true 
                },
                { 
                    name: '📊 Point Settings', 
                    value: `Range: ${serverConfig.min_points_per_award} to ${serverConfig.max_points_per_award}\nMin Vote Size: ±${serverConfig.min_vote_magnitude || 1}\nDaily Limit: ${serverConfig.daily_point_limit || 'None'}\nCooldown: ${serverConfig.user_cooldown_minutes} min`, 
                    inline: true 
                },
                { 
                    name: '🔔 Feedback Settings', 
                    value: `Success: ${serverConfig.success_feedback ? '✅' : '❌'}\nFailed: ${serverConfig.failed_feedback ? '✅' : '❌'}`, 
                    inline: true 
                },
                { 
                    name: '🎨 Appearance', 
                    value: `Color: ${serverConfig.embed_color || '#5865F2'}\nTimezone: ${serverConfig.timezone || 'UTC'}`, 
                    inline: true 
                },
                { 
                    name: '🤖 Advanced', 
                    value: `Status: ${serverConfig.is_active ? '✅ Active' : '❌ Inactive'}\nLog Channel: ${serverConfig.log_channel ? 'Set' : 'None'}\nSync Group: ${serverConfig.sync_group || 'None'}\nTesting Mode: ${serverConfig.testing_mode ? '✅' : '❌'}`, 
                    inline: true 
                },
                { 
                    name: '🏆 Auto Roles', 
                    value: `Configured: ${Object.keys(serverConfig.auto_role_thresholds || {}).length} roles`, 
                    inline: true 
                },
                { 
                    name: '😀 Reaction Voting', 
                    value: `Custom Emojis: ${reactionCount}\nDirect point awards via reactions`, 
                    inline: true 
                },
                { 
                    name: '🥇 Leaderboard Roles', 
                    value: `Configured: ${Object.keys(serverConfig.leaderboard_roles || {}).length} roles`, 
                    inline: true 
                }
            ])
            .setFooter({ text: 'Select a category to configure specific settings' })
            .setTimestamp();

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_voting')
                    .setLabel('🗳️ Voting')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(isInSyncButNotPriority),
                new ButtonBuilder()
                    .setCustomId('config_points')
                    .setLabel('📊 Points')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(isInSyncButNotPriority),
                new ButtonBuilder()
                    .setCustomId('config_feedback')
                    .setLabel('🔔 Feedback')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(isInSyncButNotPriority),
                new ButtonBuilder()
                    .setCustomId('config_appearance')
                    .setLabel('🎨 Appearance')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(isInSyncButNotPriority)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_advanced')
                    .setLabel('🤖 Advanced')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(isInSyncButNotPriority),
                new ButtonBuilder()
                    .setCustomId('config_autoroles')
                    .setLabel('🏆 Auto Roles')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(isInSyncButNotPriority),
                new ButtonBuilder()
                    .setCustomId('config_reactions')
                    .setLabel('😀 Reactions')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(isInSyncButNotPriority),
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles')
                    .setLabel('🥇 Leaderboard Roles')
                    .setStyle(ButtonStyle.Secondary)
                    // Note: Leaderboard roles are always available, even when synced
            );

        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_refresh')
                    .setLabel('🔄 Refresh')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(false) // Always allow refresh
            );

        // Include row3 (refresh button) in the components
        const components = isInSyncButNotPriority ? [row1, row2, row3] : [row1, row2];
        await this.updateInteraction(interaction, { embeds: [embed], components });
    },

    async showVotingConfig(interaction, serverConfig, page = 1) {
        // Determine total pages based on threshold mode
        const totalPages = serverConfig.threshold_mode === 'formula' ? 3 : 2;
        
        // Validate page number - redirect to page 2 if trying to access page 3 in fixed mode
        if (page === 3 && serverConfig.threshold_mode !== 'formula') {
            page = 2;
        }
        
        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle(`🗳️ Voting Configuration (Page ${page}/${totalPages})`)
            .setFooter({ text: `Page ${page} of ${totalPages} • Use navigation buttons to explore all options` });

        if (page === 1) {
            // Page 1: Basic voting settings
            embed.setDescription('Configure basic voting settings and thresholds.')
                .addFields([
                    { name: 'Current Threshold', value: serverConfig.threshold_mode === 'formula' ? `Formula-based (base: ${serverConfig.formula_base}, mult: ${serverConfig.formula_multiplier}x)` : `${serverConfig.threshold} votes required`, inline: true },
                    { name: 'Voting Timeout', value: `${serverConfig.voting_timeout} minutes`, inline: true },
                    { name: 'Threshold Mode', value: serverConfig.threshold_mode === 'formula' ? 'Formula-based' : 'Fixed', inline: true },
                    { name: 'Reaction Mode', value: serverConfig.reaction_mode ? '✅ Enabled (vote with 👍/👎)' : '❌ Disabled (vote with buttons)', inline: false }
                ]);
        } else if (page === 2) {
            // Page 2: Advanced voting settings
            embed.setDescription('Configure advanced voting features and behavior.')
                .addFields([
                    { name: 'Auto-Approval', value: serverConfig.auto_approval !== false ? '✅ Enabled (proposers automatically approve their own proposals)' : '❌ Disabled (proposers must wait for others to vote)', inline: false }
                ]);
        } else if (page === 3) {
            // Page 3: Formula settings (only available in formula mode)
            embed.setDescription('Configure formula-based threshold calculations.')
                .addFields([
                    { name: 'Formula Base', value: `${serverConfig.formula_base || 2}`, inline: true },
                    { name: 'Formula Multiplier', value: `${serverConfig.formula_multiplier || 1}x`, inline: true },
                    { name: 'Formula Preview', value: `For 5 points: ${Math.ceil((serverConfig.formula_base || 2) + (5 * (serverConfig.formula_multiplier || 1)))} votes needed`, inline: false },
                    { name: 'How it Works', value: 'Required votes = Base + (Point Value × Multiplier)', inline: false }
                ]);
        }

        const row1 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('config_threshold_select')
                    .setPlaceholder('Set voting threshold...')
                    .addOptions([
                        { label: '1 vote', value: '1', description: 'Minimal threshold' },
                        { label: '2 votes', value: '2', description: 'Light moderation' },
                        { label: '3 votes', value: '3', description: 'Standard threshold' },
                        { label: '4 votes', value: '4', description: 'Moderate threshold' },
                        { label: '5 votes', value: '5', description: 'High threshold' },
                        { label: 'Custom...', value: 'custom', description: 'Enter custom value' }
                    ])
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('config_timeout_select')
                    .setPlaceholder('Set voting timeout...')
                    .addOptions([
                        { label: '5 minutes', value: '5', description: 'Quick voting' },
                        { label: '15 minutes', value: '15', description: 'Standard timeout' },
                        { label: '30 minutes', value: '30', description: 'Extended voting' },
                        { label: '60 minutes', value: '60', description: 'Long voting period' },
                        { label: '2 hours', value: '120', description: 'Very long period' },
                        { label: 'Custom...', value: 'custom', description: 'Enter custom value' }
                    ])
            );

        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_threshold_mode_toggle')
                    .setLabel(`Mode: ${serverConfig.threshold_mode === 'formula' ? 'Formula-based' : 'Fixed Threshold'}`)
                    .setStyle(serverConfig.threshold_mode === 'formula' ? ButtonStyle.Secondary : ButtonStyle.Primary)
                    .setEmoji(serverConfig.threshold_mode === 'formula' ? '📊' : '🔢'),
                new ButtonBuilder()
                    .setCustomId('config_reaction_mode_toggle')
                    .setLabel(`Reactions: ${serverConfig.reaction_mode ? 'ON' : 'OFF'}`)
                    .setStyle(serverConfig.reaction_mode ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setEmoji(serverConfig.reaction_mode ? '👍' : '🔘')
            );

        // Create navigation row with dynamic buttons based on current page
        const navigationButtons = [];
        
        // Previous page button (if not on page 1)
        if (page > 1) {
            navigationButtons.push(
                new ButtonBuilder()
                    .setCustomId(`config_voting_page_${page - 1}`)
                    .setLabel(`← Page ${page - 1}`)
                    .setStyle(ButtonStyle.Secondary)
            );
        }
        
        // Next page button (if not on last page)
        if (page < totalPages) {
            navigationButtons.push(
                new ButtonBuilder()
                    .setCustomId(`config_voting_page_${page + 1}`)
                    .setLabel(`Page ${page + 1} ➡️`)
                    .setStyle(ButtonStyle.Secondary)
            );
        }
        
        // Back to main button (always present)
        navigationButtons.push(
            new ButtonBuilder()
                .setCustomId('config_back_main')
                .setLabel('← Back to Main')
                .setStyle(ButtonStyle.Primary)
        );
        
        const navigationRow = new ActionRowBuilder().addComponents(...navigationButtons);

        const row4 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('config_formula_base_select')
                    .setPlaceholder('Set formula base...')
                    .setDisabled(serverConfig.threshold_mode !== 'formula')
                    .addOptions([
                        { label: '1 (Minimum)', value: '1', description: 'Base threshold of 1' },
                        { label: '2 (Standard)', value: '2', description: 'Base threshold of 2' },
                        { label: '3 (Moderate)', value: '3', description: 'Base threshold of 3' },
                        { label: 'Custom...', value: 'custom', description: 'Enter custom base value' }
                    ])
            );

        const row5 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('config_formula_multiplier_select')
                    .setPlaceholder('Set formula multiplier...')
                    .setDisabled(serverConfig.threshold_mode !== 'formula')
                    .addOptions([
                        { label: '0.5x (Half)', value: '0.5', description: 'Half point value' },
                        { label: '1x (Equal)', value: '1', description: 'Equal to point value' },
                        { label: '1.5x (Higher)', value: '1.5', description: '1.5x point value' },
                        { label: '2x (Double)', value: '2', description: 'Double point value' },
                        { label: 'Custom...', value: 'custom', description: 'Enter custom multiplier' }
                    ])
            );

        // Build components array based on page (max 5 rows)
        let components;
        
        if (page === 1) {
            // Page 1: Basic voting settings (always includes navigation)
            components = [row1, row2, row3, navigationRow];
        } else if (page === 2) {
            // Page 2: Advanced settings with auto-approval toggle
            const autoApprovalRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_auto_approval_toggle')
                        .setLabel(`Auto-Approval: ${serverConfig.auto_approval !== false ? 'ON' : 'OFF'}`)
                        .setStyle(serverConfig.auto_approval !== false ? ButtonStyle.Success : ButtonStyle.Danger)
                        .setEmoji('⚡')
                );
            
            components = [autoApprovalRow, navigationRow];
        } else if (page === 3) {
            // Page 3: Formula settings (only available in formula mode)
            components = [row4, row5, navigationRow];
        }

        await this.updateInteraction(interaction, { embeds: [embed], components });
    },

    async showPointsConfig(interaction, serverConfig) {
        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('📊 Points Configuration')
            .setDescription('Configure point limits, vote restrictions, and cooldowns')
            .addFields([
                { name: 'Point Range', value: `${serverConfig.min_points_per_award} to ${serverConfig.max_points_per_award}`, inline: true },
                { name: 'Minimum Vote Size', value: `±${serverConfig.min_vote_magnitude || 1}`, inline: true },
                { name: 'Daily Limit', value: serverConfig.daily_point_limit ? `${serverConfig.daily_point_limit} points` : 'No limit', inline: true },
                { name: 'User Cooldown', value: `${serverConfig.user_cooldown_minutes} minutes`, inline: false }
            ])
            .setFooter({ text: 'Minimum vote size applies to /award and reply voting (not reactions)' });

        const row1 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('config_point_range_select')
                    .setPlaceholder('Set point range...')
                    .addOptions([
                        { label: '±5 points', value: '5', description: 'Conservative range (-5 to +5)' },
                        { label: '±10 points', value: '10', description: 'Standard range (-10 to +10)' },
                        { label: '±25 points', value: '25', description: 'Wide range (-25 to +25)' },
                        { label: '±50 points', value: '50', description: 'Very wide range (-50 to +50)' },
                        { label: 'Custom...', value: 'custom', description: 'Enter custom min/max values' }
                    ])
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('config_min_vote_magnitude_select')
                    .setPlaceholder('Set minimum vote size...')
                    .addOptions([
                        { label: '±1 (allow any)', value: '1', description: 'Allow +1/-1 votes (no restriction)' },
                        { label: '±2 minimum', value: '2', description: 'Require at least ±2 points' },
                        { label: '±3 minimum', value: '3', description: 'Require at least ±3 points' },
                        { label: '±5 minimum', value: '5', description: 'Require at least ±5 points' },
                        { label: '±10 minimum', value: '10', description: 'Require at least ±10 points' },
                        { label: 'Custom...', value: 'custom', description: 'Enter custom minimum vote size' }
                    ])
            );

        const row3 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('config_daily_limit_select')
                    .setPlaceholder('Set daily point limit...')
                    .addOptions([
                        { label: 'No limit', value: 'none', description: 'Unlimited daily points' },
                        { label: '50 points/day', value: '50', description: 'Conservative daily limit' },
                        { label: '100 points/day', value: '100', description: 'Standard daily limit' },
                        { label: '250 points/day', value: '250', description: 'High daily limit' },
                        { label: 'Custom...', value: 'custom', description: 'Enter custom daily limit' }
                    ])
            );

        const row4 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('config_cooldown_select')
                    .setPlaceholder('Set user cooldown...')
                    .addOptions([
                        { label: 'No cooldown', value: '0', description: 'Users can award immediately' },
                        { label: '15 minutes', value: '15', description: 'Short cooldown' },
                        { label: '30 minutes', value: '30', description: 'Medium cooldown' },
                        { label: '60 minutes', value: '60', description: 'Standard cooldown' },
                        { label: '2 hours', value: '120', description: 'Long cooldown' },
                        { label: 'Custom...', value: 'custom', description: 'Enter custom value' }
                    ])
            );

        const row5 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_points_next')
                    .setLabel('➡️ Next Section')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('config_back_main')
                    .setLabel('← Back to Main')
                    .setStyle(ButtonStyle.Primary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2, row3, row4, row5] });
    },

    async showFeedbackConfig(interaction, serverConfig) {
        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('🔔 Feedback Configuration')
            .setDescription('Configure when and how the bot provides feedback')
            .addFields([
                { name: 'Success Feedback', value: serverConfig.success_feedback ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'Failed Feedback', value: serverConfig.failed_feedback ? '✅ Enabled' : '❌ Disabled', inline: true }
            ])
            .setFooter({ text: 'Toggle feedback settings' });

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_success_feedback_toggle')
                    .setLabel(`Success Feedback: ${serverConfig.success_feedback ? 'ON' : 'OFF'}`)
                    .setStyle(serverConfig.success_feedback ? ButtonStyle.Success : ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('config_failed_feedback_toggle')
                    .setLabel(`Failed Feedback: ${serverConfig.failed_feedback ? 'ON' : 'OFF'}`)
                    .setStyle(serverConfig.failed_feedback ? ButtonStyle.Success : ButtonStyle.Danger)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_back_main')
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Primary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
    },

    async showAppearanceConfig(interaction, serverConfig) {
        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('🎨 Appearance Configuration')
            .setDescription('Customize the visual appearance of bot messages')
            .addFields([
                { name: 'Embed Color', value: serverConfig.embed_color || '#5865F2', inline: true }
            ])
            .setFooter({ text: 'Customize appearance settings' });

        const row1 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('config_color_select')
                    .setPlaceholder('Choose embed color...')
                    .addOptions([
                        { label: 'Discord Blue', value: '#5865F2', description: 'Default Discord blue' },
                        { label: 'Green', value: '#00ff00', description: 'Success green' },
                        { label: 'Red', value: '#ff0000', description: 'Alert red' },
                        { label: 'Purple', value: '#9932cc', description: 'Royal purple' },
                        { label: 'Orange', value: '#ff8c00', description: 'Vibrant orange' },
                        { label: 'Custom...', value: 'custom', description: 'Enter custom hex color' }
                    ])
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_back_main')
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Primary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
    },

    async showAdvancedConfig(interaction, serverConfig) {
        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('🤖 Advanced Configuration')
            .setDescription('Configure advanced bot settings and logging')
            .addFields([
                { name: 'Log Channel', value: serverConfig.log_channel ? `<#${serverConfig.log_channel}>` : 'Not set', inline: true },
                { name: 'Bot Status', value: serverConfig.is_active ? '✅ Active' : '❌ Inactive', inline: true },
                { name: 'Sync Group', value: serverConfig.sync_group || 'None', inline: true }
            ])
            .setFooter({ text: 'Configure advanced settings' });

        const row1 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('config_log_channel_select')
                    .setPlaceholder('Set log channel...')
                    .addOptions([
                        { label: 'Disable logging', value: 'none', description: 'Turn off audit logging' },
                        { label: 'Current channel', value: 'current', description: 'Use this channel for logs' },
                        { label: 'Custom channel...', value: 'custom', description: 'Enter channel ID manually' }
                    ])
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_bot_status_toggle')
                    .setLabel(`Bot: ${serverConfig.is_active ? 'Active' : 'Inactive'}`)
                    .setStyle(serverConfig.is_active ? ButtonStyle.Success : ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('config_back_main')
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Primary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
    },

    async showAutoRolesConfig(interaction, serverConfig) {
        const autoRoles = serverConfig.auto_role_thresholds || {};
        const roleEntries = Object.entries(autoRoles).sort(([a], [b]) => parseInt(a) - parseInt(b));
        
        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('🏆 Auto Roles Configuration')
            .setDescription('Configure automatic role assignment based on point thresholds.\n\n**How it works:** When users reach specific point thresholds, they automatically receive the configured Discord roles.')
            .addFields([
                { 
                    name: 'Current Auto Roles', 
                    value: roleEntries.length > 0 
                        ? roleEntries.map(([threshold, roleId]) => {
                            // Try to get role name, fallback to ID if role doesn't exist
                            const role = interaction.guild.roles.cache.get(roleId);
                            const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                            return `**${threshold} points:** ${roleName}`;
                        }).join('\n')
                        : '*No auto-roles configured yet*', 
                    inline: false 
                },
                {
                    name: 'Configuration Options',
                    value: '• **Add Role:** Set a new point threshold for a role\n• **Edit Threshold:** Modify existing point requirements\n• **Remove Role:** Delete an auto-role configuration\n• **Test Assignment:** Preview role assignments for current users',
                    inline: false
                }
            ])
            .setFooter({ text: 'Auto roles provide gamification and visual recognition for active members' });

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_autoroles_add')
                    .setLabel('➕ Add Role')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(roleEntries.length >= 10), // Limit to 10 auto roles
                new ButtonBuilder()
                    .setCustomId('config_autoroles_edit')
                    .setLabel('✏️ Edit Threshold')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(roleEntries.length === 0),
                new ButtonBuilder()
                    .setCustomId('config_autoroles_remove')
                    .setLabel('🗑️ Remove Role')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(roleEntries.length === 0)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_autoroles_test')
                    .setLabel('🧪 Test Assignment')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(roleEntries.length === 0),
                new ButtonBuilder()
                    .setCustomId('config_autoroles_clear_all')
                    .setLabel('🚨 Clear All')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(roleEntries.length === 0),
                new ButtonBuilder()
                    .setCustomId('config_back_main')
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Primary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
    },

    // Modal methods for custom inputs
    async showCustomThresholdModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('config_custom_threshold_modal')
            .setTitle('Set Custom Voting Threshold');

        const thresholdInput = new TextInputBuilder()
            .setCustomId('threshold_input')
            .setLabel('Voting Threshold')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter number of votes required (1-50)')
            .setMinLength(1)
            .setMaxLength(2)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(thresholdInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },

    async showCustomTimeoutModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('config_custom_timeout_modal')
            .setTitle('Set Custom Voting Timeout');

        const timeoutInput = new TextInputBuilder()
            .setCustomId('timeout_input')
            .setLabel('Voting Timeout (minutes)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter timeout in minutes (1-1440)')
            .setMinLength(1)
            .setMaxLength(4)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(timeoutInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },

    async showCustomCooldownModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('config_custom_cooldown_modal')
            .setTitle('Set Custom User Cooldown');

        const cooldownInput = new TextInputBuilder()
            .setCustomId('cooldown_input')
            .setLabel('User Cooldown (minutes)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter cooldown in minutes (0-1440)')
            .setMinLength(1)
            .setMaxLength(4)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(cooldownInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },

    async showCustomColorModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('config_custom_color_modal')
            .setTitle('Set Custom Embed Color');

        const colorInput = new TextInputBuilder()
            .setCustomId('color_input')
            .setLabel('Hex Color Code')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter hex color (e.g., #ff0000, #00ff00)')
            .setMinLength(4)
            .setMaxLength(7)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(colorInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },

    async showCustomPointRangeModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('config_custom_point_range_modal')
            .setTitle('Set Custom Point Range');

        const minInput = new TextInputBuilder()
            .setCustomId('min_points_input')
            .setLabel('Minimum Points (negative number)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter minimum points (e.g., -25)')
            .setMinLength(1)
            .setMaxLength(4)
            .setRequired(true);

        const maxInput = new TextInputBuilder()
            .setCustomId('max_points_input')
            .setLabel('Maximum Points (positive number)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter maximum points (e.g., 25)')
            .setMinLength(1)
            .setMaxLength(4)
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(minInput);
        const row2 = new ActionRowBuilder().addComponents(maxInput);
        modal.addComponents(row1, row2);

        await interaction.showModal(modal);
    },

    async showCustomDailyLimitModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('config_custom_daily_limit_modal')
            .setTitle('Set Custom Daily Point Limit');

        const limitInput = new TextInputBuilder()
            .setCustomId('daily_limit_input')
            .setLabel('Daily Point Limit')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter daily limit (0 for no limit)')
            .setMinLength(1)
            .setMaxLength(4)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(limitInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },

    async showCustomMinVoteMagnitudeModal(interaction) {
        // Get server config to show the current max points limit in placeholder
        const serverId = interaction.guild.id;
        const serverConfig = await DatabaseUtils.getServerConfig(serverId);
        
        const modal = new ModalBuilder()
            .setCustomId('config_custom_min_vote_magnitude_modal')
            .setTitle('Set Custom Minimum Vote Size');

        const magnitudeInput = new TextInputBuilder()
            .setCustomId('min_vote_magnitude_input')
            .setLabel('Minimum Vote Magnitude (±)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`Enter minimum (1-${serverConfig.max_points_per_award})`)
            .setMinLength(1)
            .setMaxLength(3)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(magnitudeInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },

    async showCustomLogChannelModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('config_custom_log_channel_modal')
            .setTitle('Set Custom Log Channel');

        const channelInput = new TextInputBuilder()
            .setCustomId('log_channel_input')
            .setLabel('Discord Channel ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter Discord channel ID (e.g., 123456789012345678)')
            .setRequired(true)
            .setMinLength(17)
            .setMaxLength(20);

        const firstActionRow = new ActionRowBuilder().addComponents(channelInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    },

    async showCustomFormulaBaseModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('config_custom_formula_base_modal')
            .setTitle('Set Custom Formula Base');

        const baseInput = new TextInputBuilder()
            .setCustomId('formula_base_input')
            .setLabel('Formula Base Threshold')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter base threshold (1-20)')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(2);

        const firstActionRow = new ActionRowBuilder().addComponents(baseInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    },

    async showCustomFormulaMultiplierModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('config_custom_formula_multiplier_modal')
            .setTitle('Set Custom Formula Multiplier');

        const multiplierInput = new TextInputBuilder()
            .setCustomId('formula_multiplier_input')
            .setLabel('Formula Multiplier')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter multiplier (0.1-5.0, e.g., 1.5)')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(4);

        const firstActionRow = new ActionRowBuilder().addComponents(multiplierInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    },

    // Configuration update methods
    async updateServerConfig(serverId, updates) {
        const { error } = await supabase
            .from('servers')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('server_id', serverId);

        if (error) throw error;

        // Handle sync propagation if this server is a priority server
        try {
            await handleServerSettingsChange(serverId, updates);
        } catch (syncError) {
            console.error('Error handling sync propagation:', syncError);
            // Don't throw here - we don't want sync errors to break config updates
        }
    },

    // Helper function to log configuration changes
    async logConfigChange(interaction, setting, oldValue, newValue) {
        try {
            await AuditLogger.logConfigChange(interaction.client, interaction.guildId, {
                changedBy: interaction.user.id,
                setting: setting,
                oldValue: String(oldValue),
                newValue: String(newValue)
            });
        } catch (error) {
            console.error('Error logging config change:', error);
        }
    },

    async handleConfigInteraction(interaction) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
        
        logger.config(`Config interaction: ${interaction.customId} by ${interaction.user.tag}`, 'INTERACTION');
        logger.verbose(`Interaction type: ${interaction.type}, values: ${JSON.stringify(interaction.values)}`, 'INTERACTION');
        
        // Check if user has permission to manage guild (required for config access)
        if (!interaction.member.permissions.has('ManageGuild')) {
            await interaction.reply({
                content: '❌ You need "Manage Server" permission to access the configuration menu.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        // Check if this interaction is from the original user who executed the command
        // We'll check if the message has an interaction and compare user IDs
        const message = interaction.message;
        if (message && message.interaction && message.interaction.user.id !== interaction.user.id) {
            await interaction.reply({
                content: '❌ Only the user who ran the `/config` command can use these controls.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        const serverId = interaction.guild.id;
        const serverConfig = await DatabaseUtils.getServerConfig(serverId);
        
        // Check if this is a select menu interaction that needs to show a modal
        if (interaction.isStringSelectMenu() && interaction.values && interaction.values[0] === 'custom') {
            // Handle modal display without deferring first
            if (interaction.customId === 'config_threshold_select') {
                await this.showCustomThresholdModal(interaction);
                return;
            } else if (interaction.customId === 'config_timeout_select') {
                await this.showCustomTimeoutModal(interaction);
                return;
            } else if (interaction.customId === 'config_cooldown_select') {
                await this.showCustomCooldownModal(interaction);
                return;
            } else if (interaction.customId === 'config_color_select') {
                await this.showCustomColorModal(interaction);
                return;
            } else if (interaction.customId === 'config_point_range_select') {
                await this.showCustomPointRangeModal(interaction);
                return;
            } else if (interaction.customId === 'config_daily_limit_select') {
                await this.showCustomDailyLimitModal(interaction);
                return;
            } else if (interaction.customId === 'config_min_vote_magnitude_select') {
                await this.showCustomMinVoteMagnitudeModal(interaction);
                return;
            } else if (interaction.customId === 'config_log_channel_select') {
                await this.showCustomLogChannelModal(interaction);
                return;
            } else if (interaction.customId === 'config_formula_base_select') {
                await this.showCustomFormulaBaseModal(interaction);
                return;
            } else if (interaction.customId === 'config_formula_multiplier_select') {
                await this.showCustomFormulaMultiplierModal(interaction);
                return;
            }
        }
        
        // Check if this is a button interaction that needs to show a modal
        if (interaction.isButton()) {
            // Handle modal display without deferring first
            if (interaction.customId === 'config_autoroles_add') {
                await this.showAddAutoRoleModal(interaction);
                return;
            } else if (interaction.customId === 'config_reactions_add') {
                await this.startEmojiAddProcess(interaction);
                return;
            } else if (interaction.customId === 'config_blocked_channels_add') {
                await this.startBlockedChannelAddProcess(interaction);
                return;
            } else if (interaction.customId === 'config_leaderboard_roles_add_positive') {
                await this.showAddLeaderboardRoleModal(interaction, 'positive');
                return;
            } else if (interaction.customId === 'config_leaderboard_roles_add_negative') {
                await this.showAddLeaderboardRoleModal(interaction, 'negative');
                return;
            } else if (interaction.customId.startsWith('config_autorole_edit_select')) {
                // This will be handled by select menu logic, but we need to check for edit modal
                const [threshold, roleId] = interaction.values ? interaction.values[0].split(':') : [null, null];
                if (threshold && roleId) {
                    await this.showEditAutoRoleModal(interaction, threshold, roleId);
                    return;
                }
            }
        }
        
        // Check if this is a select menu interaction for auto roles that shows modals
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'config_autorole_edit_select') {
                const [threshold, roleId] = interaction.values[0].split(':');
                await this.showEditAutoRoleModal(interaction, threshold, roleId);
                return;
            } else if (interaction.customId === 'config_autorole_select_role') {
                const roleId = interaction.values[0];
                await this.showAutoRoleThresholdModal(interaction, roleId);
                return;
            } else if (interaction.customId.startsWith('config_leaderboard_role_select_role_')) {
                const leaderboardType = interaction.customId.split('_').pop();
                const roleId = interaction.values[0];
                await this.showLeaderboardRolePositionModal(interaction, roleId, leaderboardType);
                return;
            } else if (interaction.customId === 'config_leaderboard_role_edit_select') {
                const [position, roleId, leaderboardType] = interaction.values[0].split(':');
                await this.showEditLeaderboardRoleModal(interaction, position, roleId, leaderboardType);
                return;
            } else if (interaction.customId === 'config_reaction_edit_select') {
                const emoji = interaction.values[0];
                await this.showEditReactionModal(interaction, serverConfig, emoji);
                return;
            }
        }
        
        // For all other interactions, defer update as normal
        await interaction.deferUpdate();
        
        try {
            
            // Handle main menu navigation
            if (interaction.customId === 'config_voting') {
                await this.showVotingConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_points') {
                await this.showPointsConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_feedback') {
                await this.showFeedbackConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_appearance') {
                await this.showAppearanceConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_advanced') {
                await this.showAdvancedConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_autoroles') {
                await this.showAutoRolesConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions') {
                await this.showReactionConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_leaderboard_roles') {
                await this.showLeaderboardRolesConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_refresh' || interaction.customId === 'config_back_main' || interaction.customId === 'config_main') {
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                await this.showMainConfigMenu(interaction, updatedConfig);
            }
            
            // Handle voting config page navigation
            else if (interaction.customId.startsWith('config_voting_page_')) {
                const targetPage = parseInt(interaction.customId.split('_').pop());
                await this.showVotingConfig(interaction, serverConfig, targetPage);
            } else if (interaction.customId === 'config_points_next') {
                await this.showFeedbackConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_feedback_next') {
                await this.showAppearanceConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_appearance_next') {
                await this.showAdvancedConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_advanced_next') {
                await this.showAutoRolesConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_autoroles_next') {
                await this.showVotingConfig(interaction, serverConfig);
            }
            
            // Handle voting config updates
            else if (interaction.customId === 'config_threshold_select') {
                const value = interaction.values[0];
                // Skip if it's 'custom' since that's handled in early detection
                if (value !== 'custom') {
                    await this.updateServerConfig(serverId, { threshold: parseInt(value) });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showVotingConfig(interaction, updatedConfig);
                }
            } else if (interaction.customId === 'config_timeout_select') {
                const value = interaction.values[0];
                // Skip if it's 'custom' since that's handled in early detection
                if (value !== 'custom') {
                    await this.updateServerConfig(serverId, { voting_timeout: parseInt(value) });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showVotingConfig(interaction, updatedConfig);
                }
            } else if (interaction.customId === 'config_threshold_mode_select') {
                const value = interaction.values[0];
                await this.updateServerConfig(serverId, { threshold_mode: value });
                
                // Log the configuration change
                await this.logConfigChange(interaction, 'Threshold Mode', 
                    serverConfig.threshold_mode === 'fixed' ? 'Fixed' : 'Formula-based', 
                    value === 'fixed' ? 'Fixed' : 'Formula-based'
                );
                
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                await this.showVotingConfig(interaction, updatedConfig);
            } else if (interaction.customId === 'config_formula_base_select') {
                const value = interaction.values[0];
                // Skip if it's 'custom' since that's handled in early detection
                if (value !== 'custom') {
                    await this.updateServerConfig(serverId, { formula_base: parseInt(value) });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showVotingConfig(interaction, updatedConfig);
                }
            } else if (interaction.customId === 'config_formula_multiplier_select') {
                const value = interaction.values[0];
                // Skip if it's 'custom' since that's handled in early detection
                if (value !== 'custom') {
                    await this.updateServerConfig(serverId, { formula_multiplier: parseFloat(value) });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showVotingConfig(interaction, updatedConfig);
                }
            } else if (interaction.customId === 'config_threshold_mode_toggle') {
                const newMode = serverConfig.threshold_mode === 'formula' ? 'fixed' : 'formula';
                await this.updateServerConfig(serverId, { threshold_mode: newMode });
                await this.logConfigChange(interaction, 'Threshold Mode', 
                    serverConfig.threshold_mode, 
                    newMode
                );
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                // Preserve the current page when updating
                const currentPage = interaction.message.embeds[0]?.title?.includes('Page 2') ? 2 : 1;
                await this.showVotingConfig(interaction, updatedConfig, currentPage);
            }
            
            // Handle reaction mode toggle
            else if (interaction.customId === 'config_reaction_mode_toggle') {
                const newValue = !serverConfig.reaction_mode;
                await this.updateServerConfig(serverId, { reaction_mode: newValue });
                await this.logConfigChange(interaction, 'Reaction Mode', 
                    serverConfig.reaction_mode ? 'Enabled' : 'Disabled',
                    newValue ? 'Enabled' : 'Disabled'
                );
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                await this.showVotingConfig(interaction, updatedConfig, 1); // Show page 1 where reaction mode is now located
            }
            
            // Handle auto-approval toggle
            else if (interaction.customId === 'config_auto_approval_toggle') {
                const newValue = serverConfig.auto_approval === false ? true : false;
                await this.updateServerConfig(serverId, { auto_approval: newValue });
                await this.logConfigChange(interaction, 'Auto-Approval', 
                    serverConfig.auto_approval !== false ? 'Enabled' : 'Disabled',
                    newValue ? 'Enabled' : 'Disabled'
                );
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                await this.showVotingConfig(interaction, updatedConfig, 2);
            } else if (interaction.customId === 'config_point_range_select') {
                const value = interaction.values[0];
                // Skip if it's 'custom' since that's handled in early detection
                if (value !== 'custom') {
                    const range = parseInt(value);
                    await this.updateServerConfig(serverId, { 
                        min_points_per_award: -range, 
                        max_points_per_award: range 
                    });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showPointsConfig(interaction, updatedConfig);
                }
            } else if (interaction.customId === 'config_min_vote_magnitude_select') {
                const value = interaction.values[0];
                // Skip if it's 'custom' since that's handled in early detection
                if (value !== 'custom') {
                    const magnitude = parseInt(value);
                    await this.updateServerConfig(serverId, { 
                        min_vote_magnitude: magnitude 
                    });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showPointsConfig(interaction, updatedConfig);
                }
            } else if (interaction.customId === 'config_daily_limit_select') {
                const value = interaction.values[0];
                // Skip if it's 'custom' since that's handled in early detection
                if (value !== 'custom') {
                    if (value === 'none') {
                        await this.updateServerConfig(serverId, { daily_point_limit: null });
                        const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                        await this.showPointsConfig(interaction, updatedConfig);
                    } else {
                        await this.updateServerConfig(serverId, { daily_point_limit: parseInt(value) });
                        const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                        await this.showPointsConfig(interaction, updatedConfig);
                    }
                }
            } else if (interaction.customId === 'config_cooldown_select') {
                const value = interaction.values[0];
                // Skip if it's 'custom' since that's handled in early detection
                if (value !== 'custom') {
                    await this.updateServerConfig(serverId, { user_cooldown_minutes: parseInt(value) });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showPointsConfig(interaction, updatedConfig);
                }
            }
            
            // Handle toggle buttons
            else if (interaction.customId === 'config_success_feedback_toggle') {
                await this.updateServerConfig(serverId, { success_feedback: !serverConfig.success_feedback });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                await this.showFeedbackConfig(interaction, updatedConfig);
            } else if (interaction.customId === 'config_failed_feedback_toggle') {
                await this.updateServerConfig(serverId, { failed_feedback: !serverConfig.failed_feedback });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                await this.showFeedbackConfig(interaction, updatedConfig);
            } else if (interaction.customId === 'config_reaction_mode_toggle') {
                await this.updateServerConfig(serverId, { reaction_mode: !serverConfig.reaction_mode });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                await this.showFeedbackConfig(interaction, updatedConfig);
            } else if (interaction.customId === 'config_bot_status_toggle') {
                const currentStatus = serverConfig.is_active;
                const newStatus = !currentStatus;
                await this.updateServerConfig(serverId, { is_active: newStatus });
                
                // Log the configuration change
                await this.logConfigChange(interaction, 'Bot Status', 
                    currentStatus ? 'Active' : 'Inactive', 
                    newStatus ? 'Active' : 'Inactive'
                );
                
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                await this.showAdvancedConfig(interaction, updatedConfig);
            }
            
            // Handle advanced settings updates
            else if (interaction.customId === 'config_log_channel_select') {
                const value = interaction.values[0];
                // Skip if it's 'custom' since that's handled in early detection
                if (value !== 'custom') {
                    if (value === 'none') {
                        await this.updateServerConfig(serverId, { log_channel: null });
                        const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                        await this.showAdvancedConfig(interaction, updatedConfig);
                    } else if (value === 'current') {
                        await this.updateServerConfig(serverId, { log_channel: interaction.channel.id });
                        const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                        await this.showAdvancedConfig(interaction, updatedConfig);
                    }
                }
            }
            
            // Handle appearance updates
            else if (interaction.customId === 'config_color_select') {
                const value = interaction.values[0];
                // Skip if it's 'custom' since that's handled in early detection
                if (value !== 'custom') {
                    await this.updateServerConfig(serverId, { embed_color: value });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showAppearanceConfig(interaction, updatedConfig);
                }
            }
            
            // Handle reaction-based voting configuration
            else if (interaction.customId === 'config_reactions_add') {
                await this.startEmojiAddProcess(interaction);
            } else if (interaction.customId === 'config_reactions_edit') {
                await this.showEditReactionSelect(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions_remove') {
                await this.showRemoveReactionSelect(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions_defaults') {
                await this.showDefaultReactionsPreview(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions_confirm_defaults') {
                await this.setupDefaultReactions(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions_cancel_defaults') {
                await this.showReactionConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions_cancel_add') {
                await this.handleEmojiAddCancel(interaction);
            } else if (interaction.customId === 'config_reactions_clear') {
                await this.showClearAllReactionsConfirmation(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions_confirm_clear') {
                await this.clearAllReactions(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions_cancel_clear') {
                await this.showReactionConfig(interaction, serverConfig);
            
            // Handle blocked channels configuration
            } else if (interaction.customId === 'config_blocked_channels') {
                await this.showBlockedChannelsConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_blocked_channels_remove') {
                await this.showRemoveBlockedChannelSelect(interaction, serverConfig);
            } else if (interaction.customId === 'config_blocked_channels_clear') {
                await this.showClearAllBlockedChannelsConfirmation(interaction, serverConfig);
            } else if (interaction.customId === 'config_blocked_channels_clear_confirm') {
                await this.clearAllBlockedChannels(interaction, serverConfig);
            } else if (interaction.customId === 'config_blocked_channels_cancel_clear') {
                await this.showBlockedChannelsConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_blocked_channels_cancel_add') {
                await this.showBlockedChannelsConfig(interaction, serverConfig);
            
            // Handle auto roles configuration (non-modal interactions)
            } else if (interaction.customId === 'config_autoroles_edit') {
                await this.showEditAutoRoleSelect(interaction, serverConfig);
            } else if (interaction.customId === 'config_autoroles_remove') {
                await this.showRemoveAutoRoleSelect(interaction, serverConfig);
            } else if (interaction.customId === 'config_autoroles_test') {
                await this.showAutoRoleTestResults(interaction, serverConfig);
            } else if (interaction.customId === 'config_autoroles_clear_all') {
                await this.showClearAllAutoRolesConfirmation(interaction, serverConfig);
            } else if (interaction.customId === 'config_autoroles_confirm_clear') {
                await this.clearAllAutoRoles(interaction, serverConfig);
            } else if (interaction.customId === 'config_autoroles_cancel_clear') {
                await this.showAutoRolesConfig(interaction, serverConfig);
            }
            
            // Handle auto roles select menus (non-modal interactions)
            else if (interaction.customId === 'config_autorole_remove_select') {
                const [threshold, roleId] = interaction.values[0].split(':');
                await this.removeAutoRole(interaction, serverConfig, threshold, roleId);
            }
            
            // Handle leaderboard roles configuration (non-modal interactions)
            else if (interaction.customId === 'config_leaderboard_roles_edit') {
                await this.showEditLeaderboardRoleSelect(interaction, serverConfig);
            } else if (interaction.customId === 'config_leaderboard_roles_remove') {
                await this.showRemoveLeaderboardRoleSelect(interaction, serverConfig);
            } else if (interaction.customId === 'config_leaderboard_roles_test') {
                await this.showLeaderboardRoleTestResults(interaction, serverConfig);
            } else if (interaction.customId === 'config_leaderboard_roles_clear_all') {
                await this.showClearAllLeaderboardRolesConfirmation(interaction, serverConfig);
            } else if (interaction.customId === 'config_leaderboard_roles_confirm_clear') {
                await this.clearAllLeaderboardRoles(interaction, serverConfig);
            } else if (interaction.customId === 'config_leaderboard_roles_cancel_clear') {
                await this.showLeaderboardRolesConfig(interaction, serverConfig);
            } else if (interaction.customId === 'config_leaderboard_roles_strategy_positive') {
                await this.toggleLeaderboardRoleStrategy(interaction, serverConfig, 'positive');
            } else if (interaction.customId === 'config_leaderboard_roles_strategy_negative') {
                await this.toggleLeaderboardRoleStrategy(interaction, serverConfig, 'negative');
            }
            
            // Handle reaction config select menus (non-modal interactions)
            else if (interaction.customId === 'config_reaction_remove_select') {
                const reactionId = interaction.values[0];
                await this.removeReaction(interaction, serverConfig, reactionId);
            } else if (interaction.customId === 'config_leaderboard_role_remove_select') {
                const [position, roleId, leaderboardType] = interaction.values[0].split(':');
                await this.removeLeaderboardRole(interaction, serverConfig, position, roleId, leaderboardType);
                return;
            }
            
            // Handle blocked channels select menus (non-modal interactions)
            else if (interaction.customId === 'config_blocked_channels_remove_select') {
                const channelId = interaction.values[0];
                await this.removeBlockedChannel(interaction, serverConfig, channelId);
            }
            
        } catch (error) {
            logger.errorWithStack('Error handling config interaction', error, 'CONFIG');
            await this.updateInteraction(interaction, {
                content: '❌ There was an error updating the configuration. Please try again.',
                components: []
            });
        }
    },

    async handleModalSubmit(interaction) {
        logger.config(`Modal submitted: ${interaction.customId} by ${interaction.user.tag}`, 'MODAL');
        logger.verbose(`Modal fields: ${JSON.stringify(interaction.fields.fields)}`, 'MODAL');
        
        const serverId = interaction.guild.id;
        
        // Defer the update to prevent timeout
        await interaction.deferUpdate();
        
        try {
            if (interaction.customId === 'config_custom_threshold_modal') {
                const thresholdValue = interaction.fields.getTextInputValue('threshold_input');
                const threshold = parseInt(thresholdValue);
                
                // Validate threshold
                if (isNaN(threshold) || threshold < 1 || threshold > 50) {
                    await interaction.followUp({
                        content: '❌ Invalid threshold value. Please enter a number between 1 and 50.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Update config and show updated menu
                await this.updateServerConfig(serverId, { threshold });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Update the original message directly (no ephemeral confirmation)
                await this.showVotingConfig(interaction, updatedConfig);
                
            } else if (interaction.customId === 'config_custom_timeout_modal') {
                const timeoutValue = interaction.fields.getTextInputValue('timeout_input');
                const timeout = parseInt(timeoutValue);
                
                // Validate timeout
                if (isNaN(timeout) || timeout < 1 || timeout > 1440) {
                    await interaction.followUp({
                        content: '❌ Invalid timeout value. Please enter a number between 1 and 1440 minutes.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Update config and show updated menu
                await this.updateServerConfig(serverId, { voting_timeout: timeout });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Update the original message directly (no ephemeral confirmation)
                await this.showVotingConfig(interaction, updatedConfig);
                
            } else if (interaction.customId === 'config_custom_cooldown_modal') {
                const cooldownValue = interaction.fields.getTextInputValue('cooldown_input');
                const cooldown = parseInt(cooldownValue);
                
                // Validate cooldown
                if (isNaN(cooldown) || cooldown < 0 || cooldown > 1440) {
                    await interaction.followUp({
                        content: '❌ Invalid cooldown value. Please enter a number between 0 and 1440 minutes.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Update config and show updated menu
                await this.updateServerConfig(serverId, { user_cooldown_minutes: cooldown });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Update the original message directly (no ephemeral confirmation)
                await this.showPointsConfig(interaction, updatedConfig);
                
            } else if (interaction.customId === 'config_custom_color_modal') {
                const colorValue = interaction.fields.getTextInputValue('color_input').trim();
                
                // Validate hex color
                const hexColorRegex = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
                if (!hexColorRegex.test(colorValue)) {
                    await interaction.followUp({
                        content: '❌ Invalid color format. Please enter a valid hex color (e.g., #ff0000, #00ff00, or fff).',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Ensure color starts with #
                const formattedColor = colorValue.startsWith('#') ? colorValue : `#${colorValue}`;
                
                // Update config and show updated menu
                await this.updateServerConfig(serverId, { embed_color: formattedColor });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Update the original message directly (no ephemeral confirmation)
                await this.showAppearanceConfig(interaction, updatedConfig);
                
            } else if (interaction.customId === 'config_custom_point_range_modal') {
                const minValue = interaction.fields.getTextInputValue('min_points_input');
                const maxValue = interaction.fields.getTextInputValue('max_points_input');
                const minPoints = parseInt(minValue);
                const maxPoints = parseInt(maxValue);
                
                // Validate point range
                if (isNaN(minPoints) || isNaN(maxPoints) || minPoints >= 0 || maxPoints <= 0 || minPoints >= maxPoints) {
                    await interaction.followUp({
                        content: '❌ Invalid point range. Minimum must be negative, maximum must be positive, and min < max.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Update config and show updated menu
                await this.updateServerConfig(serverId, { 
                    min_points_per_award: minPoints, 
                    max_points_per_award: maxPoints 
                });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Update the original message directly (no ephemeral confirmation)
                await this.showPointsConfig(interaction, updatedConfig);
                
            } else if (interaction.customId === 'config_custom_daily_limit_modal') {
                const limitValue = interaction.fields.getTextInputValue('daily_limit_input');
                const dailyLimit = parseInt(limitValue);
                
                // Validate daily limit
                if (isNaN(dailyLimit) || dailyLimit < 0) {
                    await interaction.followUp({
                        content: '❌ Invalid daily limit. Please enter a positive number or 0 for no limit.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Update config and show updated menu
                const limitToSet = dailyLimit === 0 ? null : dailyLimit;
                await this.updateServerConfig(serverId, { daily_point_limit: limitToSet });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Update the original message directly (no ephemeral confirmation)
                await this.showPointsConfig(interaction, updatedConfig);
                
            } else if (interaction.customId === 'config_custom_min_vote_magnitude_modal') {
                const magnitudeValue = interaction.fields.getTextInputValue('min_vote_magnitude_input');
                const magnitude = parseInt(magnitudeValue);
                
                // Get current server config for validation
                const currentConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Validate minimum vote magnitude
                if (isNaN(magnitude) || magnitude < 1) {
                    await interaction.followUp({
                        content: '❌ Invalid minimum vote magnitude. Please enter a positive number (minimum 1).',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Ensure it doesn't exceed the maximum points per award limit
                if (magnitude > currentConfig.max_points_per_award) {
                    await interaction.followUp({
                        content: `❌ Minimum vote magnitude (${magnitude}) cannot exceed the maximum points per award (${currentConfig.max_points_per_award}). Please enter a value between 1 and ${currentConfig.max_points_per_award}.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Additional validation: ensure it's reasonable (not exceeding absolute value of min_points_per_award)
                const maxAllowedMagnitude = Math.max(
                    currentConfig.max_points_per_award,
                    Math.abs(currentConfig.min_points_per_award)
                );
                
                if (magnitude > maxAllowedMagnitude) {
                    await interaction.followUp({
                        content: `❌ Minimum vote magnitude (${magnitude}) cannot exceed the point range limits (±${maxAllowedMagnitude}). Please enter a value between 1 and ${maxAllowedMagnitude}.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Update config and show updated menu
                await this.updateServerConfig(serverId, { min_vote_magnitude: magnitude });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Update the original message directly (no ephemeral confirmation)
                await this.showPointsConfig(interaction, updatedConfig);
                
            } else if (interaction.customId === 'config_custom_log_channel_modal') {
                const channelValue = interaction.fields.getTextInputValue('log_channel_input');
                
                // Validate channel ID (Discord snowflake format)
                const channelIdRegex = /^\d{17,20}$/;
                if (!channelIdRegex.test(channelValue)) {
                    await interaction.followUp({
                        content: '❌ Invalid channel ID format. Please enter a valid Discord channel ID (17-20 digits).',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Update config and show updated menu
                await this.updateServerConfig(serverId, { log_channel: channelValue });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Update the original message directly (no ephemeral confirmation)
                await this.showAdvancedConfig(interaction, updatedConfig);
                
            } else if (interaction.customId === 'config_custom_formula_base_modal') {
                const baseValue = interaction.fields.getTextInputValue('formula_base_input');
                const base = parseInt(baseValue);
                
                // Validate formula base
                if (isNaN(base) || base < 1 || base > 20) {
                    await interaction.followUp({
                        content: '❌ Invalid formula base value. Please enter a number between 1 and 20.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Update config and show updated menu
                await this.updateServerConfig(serverId, { formula_base: base });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Update the original message directly (no ephemeral confirmation)
                await this.showVotingConfig(interaction, updatedConfig);
                
            } else if (interaction.customId === 'config_custom_formula_multiplier_modal') {
                const multiplierValue = interaction.fields.getTextInputValue('formula_multiplier_input');
                const multiplier = parseFloat(multiplierValue);
                
                // Validate formula multiplier
                if (isNaN(multiplier) || multiplier < 0.1 || multiplier > 5.0) {
                    await interaction.followUp({
                        content: '❌ Invalid formula multiplier value. Please enter a number between 0.1 and 5.0.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Update config and show updated menu
                await this.updateServerConfig(serverId, { formula_multiplier: multiplier });
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Update the original message directly (no ephemeral confirmation)
                await this.showVotingConfig(interaction, updatedConfig);
            } else if (interaction.customId === 'config_add_autorole_threshold_modal') {
                const thresholdValue = interaction.fields.getTextInputValue('autorole_threshold_input');
                const roleIdValue = interaction.fields.getTextInputValue('autorole_role_id_input').trim();
                const threshold = parseInt(thresholdValue);
                
                // Get server config first
                const serverConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Validate threshold
                if (isNaN(threshold) || threshold < 1 || threshold > 999999) {
                    await interaction.followUp({
                        content: '❌ Invalid threshold value. Please enter a number between 1 and 999,999.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Check if role exists in the guild
                const role = interaction.guild.roles.cache.get(roleIdValue);
                if (!role) {
                    await interaction.followUp({
                        content: '❌ Role not found in this server. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Check if threshold already exists
                const currentAutoRoles = serverConfig.auto_role_thresholds || {};
                if (currentAutoRoles[threshold]) {
                    await interaction.followUp({
                        content: `❌ A role is already configured for ${threshold} points. Please use a different threshold or edit the existing one.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Verify the bot can still assign this role
                const assignableRoles = this.getAssignableRoles(interaction.guild);
                const canAssign = assignableRoles.some(r => r.id === roleIdValue);
                if (!canAssign) {
                    await interaction.followUp({
                        content: '❌ This role cannot be assigned by the bot. It may be above the bot\'s highest role or managed by another integration.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Add the new auto role
                const updatedAutoRoles = { ...currentAutoRoles, [threshold]: roleIdValue };
                await this.updateServerConfig(serverId, { auto_role_thresholds: updatedAutoRoles });
                
                // Log the configuration change
                await this.logConfigChange(interaction, 'Auto Roles', 
                    `Added role configuration`, 
                    `${threshold} points → @${role.name}`
                );
                
                // Show success message and return to auto roles config
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Auto Role Added')
                    .setDescription(`Successfully configured auto role:\n\n**${threshold} points → @${role.name}**`)
                    .setFooter({ text: 'Users will automatically receive this role when they reach the threshold.' });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('config_autoroles')
                            .setLabel('← Back to Auto Roles')
                            .setStyle(ButtonStyle.Primary)
                    );

                // Use editReply since interaction was deferred
                await interaction.editReply({ embeds: [embed], components: [row] });
                
            } else if (interaction.customId === 'config_edit_autorole_modal') {
                const thresholdValue = interaction.fields.getTextInputValue('autorole_edit_threshold_input');
                const oldThreshold = interaction.fields.getTextInputValue('autorole_old_threshold_input');
                const roleId = interaction.fields.getTextInputValue('autorole_edit_role_input');
                const newThreshold = parseInt(thresholdValue);
                
                // Validate new threshold
                if (isNaN(newThreshold) || newThreshold < 1 || newThreshold > 999999) {
                    await interaction.followUp({
                        content: '❌ Invalid threshold value. Please enter a number between 1 and 999,999.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Check if new threshold already exists (and it's different from the old one)
                const currentAutoRoles = serverConfig.auto_role_thresholds || {};
                if (currentAutoRoles[newThreshold] && newThreshold.toString() !== oldThreshold) {
                    await interaction.followUp({
                        content: `❌ A role is already configured for ${newThreshold} points. Please use a different threshold.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Update the auto role threshold
                const updatedAutoRoles = { ...currentAutoRoles };
                delete updatedAutoRoles[oldThreshold]; // Remove old threshold
                updatedAutoRoles[newThreshold] = roleId; // Add new threshold
                
                await this.updateServerConfig(serverId, { auto_role_thresholds: updatedAutoRoles });
                
                // Log the configuration change
                const role = interaction.guild.roles.cache.get(roleId);
                await this.logConfigChange(interaction, 'Auto Roles', 
                    `${oldThreshold} points → @${role ? role.name : 'Unknown Role'}`, 
                    `${newThreshold} points → @${role ? role.name : 'Unknown Role'}`
                );
                
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                await this.showAutoRolesConfig(interaction, updatedConfig);
            } else if (interaction.customId === 'config_formula_multiplier_modal') {
                const multiplierValue = parseFloat(interaction.fields.getTextInputValue('formula_multiplier_input'));
                if (isNaN(multiplierValue) || multiplierValue < 0.1 || multiplierValue > 10) {
                    await interaction.followUp({
                        content: '⚠️ Invalid multiplier value. Please enter a number between 0.1 and 10.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                await this.updateServerConfig(serverId, { formula_multiplier: multiplierValue });
                await this.logConfigChange(interaction, 'formula_multiplier', 
                    await DatabaseUtils.getServerConfig(serverId).then(c => c.formula_multiplier),
                    multiplierValue
                );
                const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                await this.showVotingConfig(interaction, updatedConfig);
            } else if (interaction.customId === 'config_edit_reaction_modal') {
                const emoji = interaction.fields.getTextInputValue('reaction_emoji_input');
                const pointsValue = interaction.fields.getTextInputValue('reaction_edit_points_input').trim();
                
                // Validate point value
                const points = parseInt(pointsValue.replace(/[^-\d]/g, ''));
                if (isNaN(points) || points === 0) {
                    await interaction.followUp({
                        content: '❌ Invalid point value. Please enter a non-zero number (e.g., 5, -3, 100, -50).',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                try {
                    // Get the current reaction to show the old value in logs
                    const currentReaction = await DatabaseUtils.getCustomReaction(serverId, emoji);
                    const oldPoints = currentReaction ? currentReaction.point_value : 0;
                    
                    // Update the custom reaction using setCustomReaction (which does upsert)
                    await DatabaseUtils.setCustomReaction(serverId, emoji, points);
                    
                    // Log the configuration change
                    await this.logConfigChange(interaction, 'Reaction Voting', 
                        `${emoji} → ${oldPoints > 0 ? '+' : ''}${oldPoints} points`, 
                        `${emoji} → ${points > 0 ? '+' : ''}${points} points`
                    );
                    
                    // Show success message with updated reaction
                    const successEmbed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('✅ Reaction Updated')
                        .setDescription(`Successfully updated reaction point value:`)
                        .addFields([
                            {
                                name: 'Updated Reaction',
                                value: `${emoji} → ${points > 0 ? '+' : ''}${points} points`,
                                inline: false
                            }
                        ])
                        .setFooter({ text: 'Users can now react with this emoji for the new point value.' });

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('config_reactions')
                                .setLabel('← Back to Reactions')
                                .setStyle(ButtonStyle.Primary)
                        );

                    await interaction.followUp({ embeds: [successEmbed], components: [row] });
                    
                } catch (error) {
                    logger.errorWithStack('Error updating custom reaction', error, 'MODAL');
                    await interaction.followUp({
                        content: '❌ Error updating custom reaction. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            } else if (interaction.customId.startsWith('config_add_leaderboard_role_position_modal_')) {
                const leaderboardType = interaction.customId.split('_').pop();
                const positionValue = interaction.fields.getTextInputValue('leaderboard_position_input');
                const roleIdValue = interaction.fields.getTextInputValue('leaderboard_role_id_input').trim();
                const position = parseInt(positionValue);
                
                // Get server config first
                const serverConfig = await DatabaseUtils.getServerConfig(serverId);
                
                // Validate position
                if (isNaN(position) || position < 1 || position > 10) {
                    await interaction.followUp({
                        content: '❌ Invalid position value. Please enter a number between 1 and 10.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Check if role exists in the guild (ensure roleIdValue is a string)
                const roleIdString = String(roleIdValue);
                const role = interaction.guild.roles.cache.get(roleIdString);
                if (!role) {
                    await interaction.followUp({
                        content: '❌ Role not found in this server. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Check if position already exists for this leaderboard type
                const currentLeaderboardRoles = serverConfig.leaderboard_roles || {};
                const currentTypeRoles = currentLeaderboardRoles[leaderboardType] || {};
                if (currentTypeRoles[position]) {
                    await interaction.followUp({
                        content: `❌ A role is already configured for ${position}${this.getPositionSuffix(position)} place in the ${leaderboardType} leaderboard. Please use a different position or edit the existing one.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Verify the bot can still assign this role
                const assignableRoles = this.getAssignableRoles(interaction.guild);
                const canAssign = assignableRoles.some(r => String(r.id) === roleIdString);
                if (!canAssign) {
                    await interaction.followUp({
                        content: '❌ This role cannot be assigned by the bot. It may be above the bot\'s highest role or managed by another integration.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Add the new leaderboard role to the correct type
                const updatedLeaderboardRoles = { ...currentLeaderboardRoles };
                if (!updatedLeaderboardRoles[leaderboardType]) {
                    updatedLeaderboardRoles[leaderboardType] = {};
                }
                updatedLeaderboardRoles[leaderboardType][position] = roleIdString;
                await this.updateServerConfig(serverId, { leaderboard_roles: updatedLeaderboardRoles });
                
                // Apply the new role configuration immediately
                try {
                    const results = await DatabaseUtils.assignLeaderboardRoles(serverId, interaction.guild);
                    console.log(`🎯 Applied leaderboard roles after config update: ${results.assigned} assigned, ${results.removed} removed`);
                } catch (roleError) {
                    console.error('Error applying leaderboard roles after config update:', roleError);
                    // Don't fail the config update if role assignment fails
                }
                
                // Log the configuration change
                await this.logConfigChange(interaction, 'Leaderboard Roles', 
                    `Added ${leaderboardType} role configuration`, 
                    `${position}${this.getPositionSuffix(position)} place → @${role.name}`
                );
                
                // Show success message and return to leaderboard roles config
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`✅ ${leaderboardType === 'positive' ? 'Positive' : 'Negative'} Leaderboard Role Added`)
                    .setDescription(`Successfully configured ${leaderboardType} leaderboard role:\n\n**${position}${this.getPositionSuffix(position)} place → @${role.name}**`)
                    .setFooter({ text: `Users will automatically receive this role when they reach this position on the ${leaderboardType} leaderboard.` });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('config_leaderboard_roles')
                            .setLabel('← Back to Leaderboard Roles')
                            .setStyle(ButtonStyle.Primary)
                    );

                // Use editReply since interaction was deferred
                await interaction.editReply({ embeds: [embed], components: [row] });
            } else if (interaction.customId === 'config_edit_leaderboard_role_modal') {
                const positionValue = interaction.fields.getTextInputValue('leaderboard_edit_position_input');
                const oldPosition = interaction.fields.getTextInputValue('leaderboard_old_position_input');
                const roleId = interaction.fields.getTextInputValue('leaderboard_edit_role_input');
                const leaderboardType = interaction.fields.getTextInputValue('leaderboard_edit_type_input');
                const newPosition = parseInt(positionValue);
                
                // Validate new position
                if (isNaN(newPosition) || newPosition < 1 || newPosition > 10) {
                    await interaction.followUp({
                        content: '❌ Invalid position value. Please enter a number between 1 and 10.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Check if new position already exists (and it's different from the old one)
                const currentLeaderboardRoles = serverConfig.leaderboard_roles || {};
                const currentTypeRoles = currentLeaderboardRoles[leaderboardType] || {};
                if (currentTypeRoles[newPosition] && newPosition.toString() !== oldPosition) {
                    await interaction.followUp({
                        content: `❌ A role is already configured for ${newPosition}${this.getPositionSuffix(newPosition)} place in the ${leaderboardType} leaderboard. Please use a different position.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Update the leaderboard role position
                const updatedLeaderboardRoles = { ...currentLeaderboardRoles };
                if (!updatedLeaderboardRoles[leaderboardType]) {
                    updatedLeaderboardRoles[leaderboardType] = {};
                }
                delete updatedLeaderboardRoles[leaderboardType][oldPosition]; // Remove old position
                updatedLeaderboardRoles[leaderboardType][newPosition] = String(roleId); // Add new position as string
                
                await this.updateServerConfig(serverId, { leaderboard_roles: updatedLeaderboardRoles });
                
                // Apply the updated role configuration immediately
                try {
                    const results = await DatabaseUtils.assignLeaderboardRoles(serverId, interaction.guild);
                    console.log(`🎯 Applied leaderboard roles after edit: ${results.assigned} assigned, ${results.removed} removed`);
                } catch (roleError) {
                    console.error('Error applying leaderboard roles after edit:', roleError);
                    // Don't fail the config update if role assignment fails
                }
                
                // Log the configuration change
                const role = interaction.guild.roles.cache.get(roleId);
                await this.logConfigChange(interaction, 'Leaderboard Roles', 
                    `${oldPosition}${this.getPositionSuffix(oldPosition)} place → @${role.name}`, 
                    `${newPosition}${this.getPositionSuffix(newPosition)} place → @${role.name}`
                );
                
                // Show success message and return to leaderboard roles config
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Leaderboard Role Updated')
                    .setDescription(`Successfully updated leaderboard role position:\n\n**${oldPosition}${this.getPositionSuffix(oldPosition)} place → ${newPosition}${this.getPositionSuffix(newPosition)} place → @${role.name}**`)
                    .setFooter({ text: 'Users will automatically receive this role when they reach this position on the leaderboard.' });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('config_leaderboard_roles')
                            .setLabel('← Back to Leaderboard Roles')
                            .setStyle(ButtonStyle.Primary)
                    );

                // Use editReply since interaction was deferred
                await interaction.editReply({ embeds: [embed], components: [row] });
            }
        } catch (error) {
            logger.errorWithStack('Error handling modal submit', error, 'MODAL');
            await interaction.followUp({
                content: '❌ There was an error processing your input. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    },

    // Auto Roles Configuration Methods
    async showAddAutoRoleModal(interaction) {
        // Get all roles the bot can assign
        const assignableRoles = this.getAssignableRoles(interaction.guild);
        
        if (assignableRoles.length === 0) {
            await interaction.reply({
                content: '❌ No assignable roles found. The bot needs roles below its highest role in the server hierarchy to assign them automatically.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Filter out roles already configured for auto-assignment
        const serverConfig = await DatabaseUtils.getServerConfig(interaction.guild.id);
        const configuredRoleIds = Object.values(serverConfig.auto_role_thresholds || {});
        const availableRoles = assignableRoles.filter(role => !configuredRoleIds.includes(role.id));
        
        if (availableRoles.length === 0) {
            await interaction.reply({
                content: '❌ All assignable roles are already configured for auto-assignment. Remove an existing auto role first or add more roles to your server.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('➕ Add Auto Role')
            .setDescription('Select a role to configure for automatic assignment:')
            .addFields([
                {
                    name: 'Available Roles',
                    value: availableRoles.length > 0 
                        ? availableRoles.slice(0, 10).map(role => `• @${role.name}`).join('\n')
                        : 'No available roles',
                    inline: false
                },
                {
                    name: 'Next Step',
                    value: 'After selecting a role, you\'ll set the point threshold required to receive it.',
                    inline: false
                }
            ])
            .setFooter({ text: `${availableRoles.length} assignable role${availableRoles.length !== 1 ? 's' : ''} available` });

        // Create select menu with available roles (max 25 options)
        const roleOptions = availableRoles.slice(0, 25).map(role => ({
            label: role.name,
            value: role.id,
            description: `Role position: ${role.position}`,
            emoji: role.unicodeEmoji || undefined
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('config_autorole_select_role')
            .setPlaceholder('Select a role to configure...')
            .addOptions(roleOptions);

        const row1 = new ActionRowBuilder().addComponents(selectMenu);
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_autoroles')
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.reply({ embeds: [embed], components: [row1, row2], flags: MessageFlags.Ephemeral });
    },

    // Helper method to get roles the bot can assign
    getAssignableRoles(guild) {
        const botMember = guild.members.me;
        if (!botMember) return [];

        const botHighestRole = botMember.roles.highest;
        
        return guild.roles.cache
            .filter(role => {
                // Exclude @everyone role
                if (role.id === guild.id) return false;
                
                // Exclude roles higher than or equal to bot's highest role
                if (role.position >= botHighestRole.position) return false;
                
                // Exclude managed roles (bot roles, integration roles)
                if (role.managed) return false;
                
                // Check if bot has permission to manage roles
                if (!botMember.permissions.has('ManageRoles')) return false;
                
                return true;
            })
            .sort((a, b) => b.position - a.position) // Sort by position (highest first)
            .map(role => ({ id: role.id, name: role.name, position: role.position, unicodeEmoji: role.unicodeEmoji }));
    },

    async showAutoRoleThresholdModal(interaction, roleId) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
            await interaction.reply({
                content: '❌ Role not found. Please try again.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId('config_add_autorole_threshold_modal')
            .setTitle(`Set Threshold for @${role.name}`);

        const thresholdInput = new TextInputBuilder()
            .setCustomId('autorole_threshold_input')
            .setLabel('Point Threshold')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter point threshold (e.g., 100)')
            .setMinLength(1)
            .setMaxLength(6)
            .setRequired(true);

        const roleIdInput = new TextInputBuilder()
            .setCustomId('autorole_role_id_input')
            .setLabel('Role ID (do not edit)')
            .setStyle(TextInputStyle.Short)
            .setValue(roleId)
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(thresholdInput);
        const row2 = new ActionRowBuilder().addComponents(roleIdInput);
        modal.addComponents(row1, row2);

        await interaction.showModal(modal);
    },

    async showEditAutoRoleSelect(interaction, serverConfig) {
        const autoRoles = serverConfig.auto_role_thresholds || {};
        const roleEntries = Object.entries(autoRoles).sort(([a], [b]) => parseInt(a) - parseInt(b));
        
        if (roleEntries.length === 0) {
            await this.updateInteraction(interaction, {
                content: '❌ No auto roles configured to edit.',
                components: []
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('✏️ Edit Auto Role Threshold')
            .setDescription('Select an auto role to edit its point threshold:')
            .addFields([
                {
                    name: 'Current Auto Roles',
                    value: roleEntries.map(([threshold, roleId]) => {
                        const role = interaction.guild.roles.cache.get(roleId);
                        const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                        return `**${threshold} points:** ${roleName}`;
                    }).join('\n'),
                    inline: false
                }
            ]);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('config_autorole_edit_select')
            .setPlaceholder('Select a role to edit...')
            .addOptions(
                roleEntries.map(([threshold, roleId]) => {
                    const role = interaction.guild.roles.cache.get(roleId);
                    const roleName = role ? role.name : 'Unknown Role';
                    return {
                        label: `${threshold} points - ${roleName}`,
                        value: `${threshold}:${roleId}`,
                        description: `Edit threshold for ${roleName}`
                    };
                })
            );

        const row1 = new ActionRowBuilder().addComponents(selectMenu);
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_autoroles')
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Primary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
    },

    async showRemoveAutoRoleSelect(interaction, serverConfig) {
        const autoRoles = serverConfig.auto_role_thresholds || {};
        const roleEntries = Object.entries(autoRoles).sort(([a], [b]) => parseInt(a) - parseInt(b));
        
        if (roleEntries.length === 0) {
            await this.updateInteraction(interaction, {
                content: '❌ No auto roles configured to remove.',
                components: []
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('🗑️ Remove Auto Role')
            .setDescription('Select an auto role to remove:')
            .addFields([
                {
                    name: 'Current Auto Roles',
                    value: roleEntries.map(([threshold, roleId]) => {
                        const role = interaction.guild.roles.cache.get(roleId);
                        const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                        return `**${threshold} points:** ${roleName}`;
                    }).join('\n'),
                    inline: false
                }
            ]);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('config_autorole_remove_select')
            .setPlaceholder('Select a role to remove...')
            .addOptions(
                roleEntries.map(([threshold, roleId]) => {
                    const role = interaction.guild.roles.cache.get(roleId);
                    const roleName = role ? role.name : 'Unknown Role';
                    return {
                        label: `${threshold} points - ${roleName}`,
                        value: `${threshold}:${roleId}`,
                        description: `Remove ${roleName} auto role`,
                        emoji: '🗑️'
                    };
                })
            );

        const row1 = new ActionRowBuilder().addComponents(selectMenu);
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_autoroles')
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Primary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
    },

    async showAutoRoleTestResults(interaction, serverConfig) {
        const autoRoles = serverConfig.auto_role_thresholds || {};
        const roleEntries = Object.entries(autoRoles).sort(([a], [b]) => parseInt(a) - parseInt(b));
        
        if (roleEntries.length === 0) {
            await this.updateInteraction(interaction, {
                content: '❌ No auto roles configured to test.',
                components: []
            });
            return;
        }

        // Get top 10 users with scores to test role assignments
        const { data: topUsers, error } = await supabase
            .from('users')
            .select('user_id::text, total_score')
            .eq('server_id', interaction.guild.id)
            .order('total_score', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error fetching users for auto role test:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error fetching user data for testing.',
                components: []
            });
            return;
        }

        const testResults = [];
        
        for (const user of topUsers || []) {
            const member = await interaction.guild.members.fetch(user.user_id).catch(() => null);
            if (!member) continue;

            const eligibleRoles = roleEntries
                .filter(([threshold]) => user.total_score >= parseInt(threshold))
                .map(([threshold, roleId]) => {
                    const role = interaction.guild.roles.cache.get(roleId);
                    return { threshold: parseInt(threshold), role, roleId };
                })
                .sort((a, b) => b.threshold - a.threshold); // Highest threshold first

            const highestEligibleRole = eligibleRoles[0];
            const hasRole = highestEligibleRole && member.roles.cache.has(highestEligibleRole.roleId);
            
            testResults.push({
                member,
                score: user.total_score,
                eligibleRole: highestEligibleRole,
                hasRole
            });
        }

        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('🧪 Auto Role Test Results')
            .setDescription('Preview of role assignments for top users based on current configuration:')
            .addFields([
                {
                    name: 'Test Results (Top 10 Users)',
                    value: testResults.length > 0 
                        ? testResults.map(result => {
                            const statusIcon = result.hasRole ? '✅' : '❌';
                            const roleText = result.eligibleRole 
                                ? `${result.eligibleRole.role ? `@${result.eligibleRole.role.name}` : 'Unknown Role'} (${result.eligibleRole.threshold}+ pts)`
                                : 'No role eligible';
                            return `${statusIcon} **${result.member.displayName}** (${result.score} pts) → ${roleText}`;
                        }).join('\n')
                        : 'No users found with scores',
                    inline: false
                },
                {
                    name: 'Legend',
                    value: '✅ User has the correct role\n❌ User missing expected role',
                    inline: false
                }
            ])
            .setFooter({ text: 'This is a preview only. Actual role assignment happens automatically when users gain points.' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_autoroles')
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Primary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
    },

    async showClearAllAutoRolesConfirmation(interaction, serverConfig) {
        const autoRoles = serverConfig.auto_role_thresholds || {};
        const roleCount = Object.keys(autoRoles).length;
        
        if (roleCount === 0) {
            await this.updateInteraction(interaction, {
                content: '❌ No auto roles configured to clear.',
                components: []
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#ff4444')
            .setTitle('🚨 Clear All Auto Roles')
            .setDescription(`Are you sure you want to remove **all ${roleCount} auto role${roleCount !== 1 ? 's' : ''}**?\n\n**This action cannot be undone!**`)
            .addFields([
                {
                    name: 'Roles to be removed:',
                    value: Object.entries(autoRoles)
                        .sort(([a], [b]) => parseInt(a) - parseInt(b))
                        .map(([threshold, roleId]) => {
                            const role = interaction.guild.roles.cache.get(roleId);
                            const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                            return `• **${threshold} points:** ${roleName}`;
                        }).join('\n'),
                    inline: false
                }
            ]);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_autoroles_confirm_clear')
                    .setLabel('🗑️ Yes, Clear All')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('config_autoroles_cancel_clear')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
    },

    async clearAllAutoRoles(interaction, serverConfig) {
        const serverId = interaction.guild.id;
        
        try {
            // Clear all auto roles
            await this.updateServerConfig(serverId, { auto_role_thresholds: {} });
            
            // Log the configuration change
            await this.logConfigChange(interaction, 'Auto Roles', 
                `${Object.keys(serverConfig.auto_role_thresholds || {}).length} roles configured`, 
                'All auto roles cleared'
            );
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Auto Roles Cleared')
                .setDescription('All auto role configurations have been successfully removed.')
                .setFooter({ text: 'You can add new auto roles anytime using the Add Role button.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_autoroles')
                        .setLabel('← Back to Auto Roles')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error clearing auto roles:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error clearing auto roles. Please try again.',
                components: []
            });
        }
    },

    async showEditAutoRoleModal(interaction, threshold, roleId) {
        const role = interaction.guild.roles.cache.get(roleId);
        const roleName = role ? role.name : 'Unknown Role';
        
        const modal = new ModalBuilder()
            .setCustomId('config_edit_autorole_modal')
            .setTitle(`Edit Auto Role: ${roleName}`);

        const thresholdInput = new TextInputBuilder()
            .setCustomId('autorole_edit_threshold_input')
            .setLabel('New Point Threshold')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter new point threshold')
            .setValue(threshold)
            .setMinLength(1)
            .setMaxLength(6)
            .setRequired(true);

        const oldThresholdInput = new TextInputBuilder()
            .setCustomId('autorole_old_threshold_input')
            .setLabel('Current Threshold (do not edit)')
            .setStyle(TextInputStyle.Short)
            .setValue(threshold)
            .setRequired(true);

        const roleInput = new TextInputBuilder()
            .setCustomId('autorole_edit_role_input')
            .setLabel('Role ID (do not edit)')
            .setStyle(TextInputStyle.Short)
            .setValue(roleId)
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(thresholdInput);
        const row2 = new ActionRowBuilder().addComponents(oldThresholdInput);
        const row3 = new ActionRowBuilder().addComponents(roleInput);
        modal.addComponents(row1, row2, row3);

        await interaction.showModal(modal);
    },

    async removeAutoRole(interaction, serverConfig, threshold, roleId) {
        const serverId = interaction.guild.id;
        
        try {
            // Get role name for logging
            const role = interaction.guild.roles.cache.get(roleId);
            const roleName = role ? role.name : 'Unknown Role';
            
            // Remove the auto role from configuration
            const currentAutoRoles = serverConfig.auto_role_thresholds || {};
            const updatedAutoRoles = { ...currentAutoRoles };
            delete updatedAutoRoles[threshold];
            
            await this.updateServerConfig(serverId, { auto_role_thresholds: updatedAutoRoles });
            
            // Log the configuration change
            await this.logConfigChange(interaction, 'Auto Roles', 
                `${threshold} points → @${roleName}`, 
                'Auto role removed'
            );
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Auto Role Removed')
                .setDescription(`Successfully removed auto role configuration:\n\n**${threshold} points → @${roleName}**`)
                .setFooter({ text: 'Users who currently have this role will keep it.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_autoroles')
                        .setLabel('← Back to Auto Roles')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error removing auto role:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error removing auto role. Please try again.',
                components: []
            });
        }
    },

    // ================================
    // LEADERBOARD ROLES CONFIG
    // ================================

    async showLeaderboardRolesConfig(interaction, serverConfig) {
        const leaderboardRoles = serverConfig.leaderboard_roles || {};
        const positiveRoles = leaderboardRoles.positive || {};
        const negativeRoles = leaderboardRoles.negative || {};
        const assignmentStrategy = leaderboardRoles.assignment_strategy || {};
        
        const positiveEntries = Object.entries(positiveRoles).sort(([a], [b]) => parseInt(a) - parseInt(b));
        const negativeEntries = Object.entries(negativeRoles).sort(([a], [b]) => parseInt(a) - parseInt(b));
        
        // Get strategy display
        const positiveStrategy = assignmentStrategy.positive || 'server-local';
        const negativeStrategy = assignmentStrategy.negative || 'server-local';
        
        const getStrategyText = (strategy) => {
            switch (strategy) {
                case 'global':
                    return '🌍 **Global** - Only assign to actual global leaderboard positions';
                case 'global-filtered':
                    return '🌐 **Global (Server-Filtered)** - Global leaderboard but only server members';
                default: // 'server-local'
                    return '🏠 **Server-Local** - Assign to highest-ranking users in this server';
            }
        };
        
        const positiveStrategyText = getStrategyText(positiveStrategy);
        const negativeStrategyText = getStrategyText(negativeStrategy);
        
        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('🥇 Leaderboard Roles Configuration')
            .setDescription('Configure automatic role assignment for leaderboard positions.\n\n**How it works:** Users in specific leaderboard positions (1st, 2nd, 3rd, etc.) will automatically receive the configured Discord roles. You can configure separate roles and assignment strategies for positive and negative leaderboards.')
            .addFields([
                { 
                    name: '🏆 Positive Leaderboard Roles', 
                    value: (positiveEntries.length > 0 
                        ? positiveEntries.map(([position, roleId]) => {
                            // Try to get role name, fallback to ID if role doesn't exist
                            const role = interaction.guild.roles.cache.get(roleId);
                            const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                            return `**${position}${this.getPositionSuffix(position)} place:** ${roleName}`;
                        }).join('\n')
                        : 'No positive leaderboard roles configured yet') + 
                        `\n**Assignment Strategy:** ${getStrategyText(positiveStrategy).replace(/\*\*/g, '')}`, 
                    inline: false 
                },
                { 
                    name: '💀 Negative Leaderboard Roles', 
                    value: (negativeEntries.length > 0 
                        ? negativeEntries.map(([position, roleId]) => {
                            // Try to get role name, fallback to ID if role doesn't exist
                            const role = interaction.guild.roles.cache.get(roleId);
                            const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                            return `**${position}${this.getPositionSuffix(position)} place:** ${roleName}`;
                        }).join('\n')
                        : 'No negative leaderboard roles configured yet') + 
                        `\n**Assignment Strategy:** ${getStrategyText(negativeStrategy).replace(/\*\*/g, '')}`, 
                    inline: false 
                },
                {
                    name: 'Strategy Explanation',
                    value: '**🌍 Global:**\nOnly the real global #1 gets the #1 role\nIf real global #1 isn\'t in the server → no one gets the role\n\n**🌐 Global (Server-Filtered):**\nIf real global #1 isn\'t in server → next person in global ranking who IS in server gets it\nMaintains global ranking order, just skips missing people\n\n**🏠 Server-Local:**\nWhoever has highest score in that specific server gets #1 role\nCompletely ignores what\'s happening globally',
                    inline: false
                }
            ])
            .setFooter({ text: 'Leaderboard roles provide recognition for top performers and encourage competition' });

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles_add_positive')
                    .setLabel('🏆 Add Positive Role')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(positiveEntries.length >= 10), // Limit to 10 positive roles
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles_add_negative')
                    .setLabel('💀 Add Negative Role')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(negativeEntries.length >= 10), // Limit to 10 negative roles
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles_edit')
                    .setLabel('✏️ Edit Position')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(positiveEntries.length === 0 && negativeEntries.length === 0)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles_strategy_positive')
                    .setLabel(`🏆 Positive: ${positiveStrategy === 'global' ? '🌍' : positiveStrategy === 'global-filtered' ? '🌐' : '🏠'}`)
                    .setStyle(positiveStrategy !== 'server-local' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles_strategy_negative')
                    .setLabel(`💀 Negative: ${negativeStrategy === 'global' ? '🌍' : negativeStrategy === 'global-filtered' ? '🌐' : '🏠'}`)
                    .setStyle(negativeStrategy !== 'server-local' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles_remove')
                    .setLabel('🗑️ Remove Role')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(positiveEntries.length === 0 && negativeEntries.length === 0)
            );

        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles_test')
                    .setLabel('🧪 Test Assignment')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(positiveEntries.length === 0 && negativeEntries.length === 0),
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles_clear_all')
                    .setLabel('🚨 Clear All')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(positiveEntries.length === 0 && negativeEntries.length === 0),
                new ButtonBuilder()
                    .setCustomId('config_back_main')
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Primary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2, row3] });
    },

    // Helper method to get position suffix (1st, 2nd, 3rd, etc.)
    getPositionSuffix(position) {
        const pos = parseInt(position);
        if (pos >= 11 && pos <= 13) return 'th';
        switch (pos % 10) {
            case 1: return 'st';
            case 2: return 'nd';
            case 3: return 'rd';
            default: return 'th';
        }
    },

    // ================================
    // LEADERBOARD ROLES CONFIG FUNCTIONS
    // ================================

    async showAddLeaderboardRoleModal(interaction, leaderboardType = 'positive') {
        // Get all roles the bot can assign
        const assignableRoles = this.getAssignableRoles(interaction.guild);
        const serverConfig = await DatabaseUtils.getServerConfig(interaction.guild.id);
        const leaderboardRoles = serverConfig.leaderboard_roles || {};
        const typeRoles = leaderboardRoles[leaderboardType] || {};
        
        const availableRoles = assignableRoles.filter(role => {
            // Filter out roles that are already configured for this leaderboard type
            return !Object.values(typeRoles).includes(role.id);
        });

        if (availableRoles.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ No Available Roles')
                .setDescription('All assignable roles are already configured for leaderboard positions, or no roles are available for the bot to assign.')
                .setFooter({ text: 'Make sure the bot has permission to assign roles and that roles are below the bot\'s highest role.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_leaderboard_roles')
                        .setLabel('← Back to Leaderboard Roles')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle(`➕ Add ${leaderboardType === 'positive' ? '🏆 Positive' : '💀 Negative'} Leaderboard Role`)
            .setDescription(`Select a role to configure for ${leaderboardType === 'positive' ? 'positive' : 'negative'} leaderboard position assignment:`)
            .addFields([
                {
                    name: 'Available Roles',
                    value: availableRoles.length > 0 
                        ? availableRoles.slice(0, 10).map(role => `• @${role.name}`).join('\n')
                        : 'No available roles',
                    inline: false
                },
                {
                    name: 'Next Step',
                    value: 'After selecting a role, you\'ll set the leaderboard position (1st, 2nd, 3rd, etc.) required to receive it.',
                    inline: false
                }
            ])
            .setFooter({ text: `${availableRoles.length} assignable role${availableRoles.length !== 1 ? 's' : ''} available` });

        // Create select menu with available roles (max 25 options)
        const roleOptions = availableRoles.slice(0, 25).map(role => ({
            label: role.name,
            value: role.id,
            description: `Role position: ${role.position}`,
            emoji: role.unicodeEmoji || undefined
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`config_leaderboard_role_select_role_${leaderboardType}`)
            .setPlaceholder('Select a role to configure...')
            .addOptions(roleOptions);

        const row1 = new ActionRowBuilder().addComponents(selectMenu);
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles')
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Primary)
            );

        // Use updateInteraction to properly handle the interface update
        await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
    },

    async showLeaderboardRolePositionModal(interaction, roleId, leaderboardType = 'positive') {
        const modal = new ModalBuilder()
            .setCustomId(`config_add_leaderboard_role_position_modal_${leaderboardType}`)
            .setTitle(`Set ${leaderboardType === 'positive' ? 'Positive' : 'Negative'} Leaderboard Position`);

        const positionInput = new TextInputBuilder()
            .setCustomId('leaderboard_position_input')
            .setLabel('Leaderboard Position')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter position (1, 2, 3, etc.)')
            .setMinLength(1)
            .setMaxLength(2)
            .setRequired(true);

        const roleIdInput = new TextInputBuilder()
            .setCustomId('leaderboard_role_id_input')
            .setLabel('Role ID (do not edit)')
            .setStyle(TextInputStyle.Short)
            .setValue(roleId)
            .setRequired(true);

        const leaderboardTypeInput = new TextInputBuilder()
            .setCustomId('leaderboard_type_input')
            .setLabel('Leaderboard Type (do not edit)')
            .setStyle(TextInputStyle.Short)
            .setValue(leaderboardType)
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(positionInput);
        const row2 = new ActionRowBuilder().addComponents(roleIdInput);
        const row3 = new ActionRowBuilder().addComponents(leaderboardTypeInput);
        modal.addComponents(row1, row2, row3);

        await interaction.showModal(modal);
    },

    async showEditLeaderboardRoleSelect(interaction, serverConfig) {
        const leaderboardRoles = serverConfig.leaderboard_roles || {};
        const positiveRoles = leaderboardRoles.positive || {};
        const negativeRoles = leaderboardRoles.negative || {};
        const allRoles = { ...positiveRoles, ...negativeRoles };
        const roleEntries = Object.entries(allRoles);

        if (roleEntries.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ No Leaderboard Roles Configured')
                .setDescription('There are no leaderboard roles to edit. Add some first!')
                .setFooter({ text: 'Use the "Add Role" button to configure leaderboard roles.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_leaderboard_roles')
                        .setLabel('← Back to Leaderboard Roles')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('✏️ Edit Leaderboard Role Position')
            .setDescription('Select a leaderboard role to edit its position:')
            .setFooter({ text: 'You can change which position gets this role' });

        const roleOptions = roleEntries.map(([position, roleId]) => {
            const role = interaction.guild.roles.cache.get(roleId);
            const roleName = role ? role.name : 'Unknown Role';
            const leaderboardType = positiveRoles[position] ? 'positive' : 'negative';
            return {
                label: `${position}${this.getPositionSuffix(position)} place - ${roleName}`,
                value: `${position}:${roleId}:${leaderboardType}`,
                description: `Currently assigned to ${position}${this.getPositionSuffix(position)} place (${leaderboardType})`
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('config_leaderboard_role_edit_select')
            .setPlaceholder('Select a role to edit...')
            .addOptions(roleOptions);

        const row1 = new ActionRowBuilder().addComponents(selectMenu);
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles')
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Primary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
    },

    async showRemoveLeaderboardRoleSelect(interaction, serverConfig) {
        const leaderboardRoles = serverConfig.leaderboard_roles || {};
        const positiveRoles = leaderboardRoles.positive || {};
        const negativeRoles = leaderboardRoles.negative || {};
        const allRoles = { ...positiveRoles, ...negativeRoles };
        const roleEntries = Object.entries(allRoles);

        if (roleEntries.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ No Leaderboard Roles Configured')
                .setDescription('There are no leaderboard roles to remove. Add some first!')
                .setFooter({ text: 'Use the "Add Role" button to configure leaderboard roles.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_leaderboard_roles')
                        .setLabel('← Back to Leaderboard Roles')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(serverConfig.embed_color || '#5865F2')
            .setTitle('🗑️ Remove Leaderboard Role')
            .setDescription('Select a leaderboard role to remove:')
            .setFooter({ text: 'This will remove the role configuration but not the role itself' });

        const roleOptions = roleEntries.map(([position, roleId]) => {
            const role = interaction.guild.roles.cache.get(roleId);
            const roleName = role ? role.name : 'Unknown Role';
            const leaderboardType = positiveRoles[position] ? 'positive' : 'negative';
            return {
                label: `${position}${this.getPositionSuffix(position)} place - ${roleName}`,
                value: `${position}:${roleId}:${leaderboardType}`,
                description: `Currently assigned to ${position}${this.getPositionSuffix(position)} place (${leaderboardType})`
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('config_leaderboard_role_remove_select')
            .setPlaceholder('Select a role to remove...')
            .addOptions(roleOptions);

        const row1 = new ActionRowBuilder().addComponents(selectMenu);
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles')
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Primary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
    },

    async showLeaderboardRoleTestResults(interaction, serverConfig) {
        const serverId = interaction.guild.id;
        const leaderboardRoles = serverConfig.leaderboard_roles || {};
        const positiveRoles = leaderboardRoles.positive || {};
        const negativeRoles = leaderboardRoles.negative || {};
        const assignmentStrategy = leaderboardRoles.assignment_strategy || {};
        
        if (Object.keys(positiveRoles).length === 0 && Object.keys(negativeRoles).length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ No Leaderboard Roles Configured')
                .setDescription('There are no leaderboard roles to test. Add some first!')
                .setFooter({ text: 'Use the "Add Role" buttons to configure leaderboard roles.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_leaderboard_roles')
                        .setLabel('← Back to Leaderboard Roles')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
            return;
        }

        try {
            // Get assignment strategies
            const positiveStrategy = assignmentStrategy.positive || 'server-local';
            const negativeStrategy = assignmentStrategy.negative || 'server-local';
            
            // Get current leaderboard
            const leaderboard = await DatabaseUtils.getLeaderboard(serverId, 100);
            let positiveLeaderboard = leaderboard.filter(entry => entry.total_score > 0).slice(0, 10);
            let negativeLeaderboard = leaderboard.filter(entry => entry.total_score < 0)
                .sort((a, b) => a.total_score - b.total_score).slice(0, 10);

            // Apply strategy filtering
            if (positiveStrategy === 'server-local' || positiveStrategy === 'global-filtered') {
                positiveLeaderboard = await this.filterLeaderboardForGuild(positiveLeaderboard, interaction.guild);
            }
            if (negativeStrategy === 'server-local' || negativeStrategy === 'global-filtered') {
                negativeLeaderboard = await this.filterLeaderboardForGuild(negativeLeaderboard, interaction.guild);
            }

            let positiveTestResults = '';
            for (let i = 0; i < positiveLeaderboard.length; i++) {
                const entry = positiveLeaderboard[i];
                const position = i + 1;
                const roleId = positiveRoles[position];
                
                if (roleId) {
                    const role = interaction.guild.roles.cache.get(roleId);
                    const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                    
                    // Check if user is actually in guild
                    let memberStatus = '';
                    try {
                        await interaction.guild.members.fetch(String(entry.user_id));
                        memberStatus = '✅';
                    } catch {
                        memberStatus = positiveStrategy === 'global' ? '❌ (not in server, will skip)' : '❌ (filtered out)';
                    }
                    
                    positiveTestResults += `${position}${this.getPositionSuffix(position)}: <@${entry.user_id}> (${entry.total_score} pts) → ${roleName} ${memberStatus}\n`;
                }
            }

            let negativeTestResults = '';
            for (let i = 0; i < negativeLeaderboard.length; i++) {
                const entry = negativeLeaderboard[i];
                const position = i + 1;
                const roleId = negativeRoles[position];
                
                if (roleId) {
                    const role = interaction.guild.roles.cache.get(roleId);
                    const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                    
                    // Check if user is actually in guild
                    let memberStatus = '';
                    try {
                        await interaction.guild.members.fetch(String(entry.user_id));
                        memberStatus = '✅';
                    } catch {
                        memberStatus = negativeStrategy === 'global' ? '❌ (not in server, will skip)' : '❌ (filtered out)';
                    }
                    
                    negativeTestResults += `${position}${this.getPositionSuffix(position)}: <@${entry.user_id}> (${entry.total_score} pts) → ${roleName} ${memberStatus}\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setColor(serverConfig.embed_color || '#5865F2')
                .setTitle('🧪 Leaderboard Role Test Results')
                .setDescription('Preview of current leaderboard role assignments based on your configuration:')
                .addFields([
                    {
                        name: `🏆 Positive Leaderboard (${positiveStrategy === 'global' ? '🌍 Global' : positiveStrategy === 'global-filtered' ? '🌐 Global (Server-Filtered)' : '🏠 Server-Local'})`,
                        value: positiveTestResults || '*No positive roles configured*',
                        inline: false
                    },
                    {
                        name: `💀 Negative Leaderboard (${negativeStrategy === 'global' ? '🌍 Global' : negativeStrategy === 'global-filtered' ? '🌐 Global (Server-Filtered)' : '🏠 Server-Local'})`,
                        value: negativeTestResults || '*No negative roles configured*',
                        inline: false
                    },
                    {
                        name: 'Legend',
                        value: '✅ = Role will be assigned\n❌ = User not in server (assignment will be skipped)',
                        inline: false
                    }
                ])
                .setFooter({ text: 'This is a preview only. Roles are not actually assigned.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_leaderboard_roles')
                        .setLabel('← Back to Leaderboard Roles')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error testing leaderboard roles:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error testing leaderboard roles. Please try again.',
                components: []
            });
        }
    },

    // Helper function to filter leaderboard for server-local strategy testing
    async filterLeaderboardForGuild(leaderboard, guild) {
        const filteredLeaderboard = [];
        
        for (const entry of leaderboard) {
            try {
                await guild.members.fetch(String(entry.user_id));
                filteredLeaderboard.push(entry);
            } catch {
                // User not in guild, skip for server-local strategy
            }
        }
        
        return filteredLeaderboard;
    },

    async showClearAllLeaderboardRolesConfirmation(interaction, serverConfig) {
        const leaderboardRoles = serverConfig.leaderboard_roles || {};
        const positiveRoles = leaderboardRoles.positive || {};
        const negativeRoles = leaderboardRoles.negative || {};
        const totalRoleCount = Object.keys(positiveRoles).length + Object.keys(negativeRoles).length;

        if (totalRoleCount === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ No Leaderboard Roles to Clear')
                .setDescription('There are no leaderboard roles configured to clear.')
                .setFooter({ text: 'Add some leaderboard roles first!' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_leaderboard_roles')
                        .setLabel('← Back to Leaderboard Roles')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('⚠️ Clear All Leaderboard Roles')
            .setDescription(`Are you sure you want to clear all ${totalRoleCount} leaderboard role configuration${totalRoleCount !== 1 ? 's' : ''}?\n\n**This action cannot be undone!**`)
            .addFields([
                {
                    name: '🏆 Positive Leaderboard Roles',
                    value: Object.entries(positiveRoles).map(([position, roleId]) => {
                        const role = interaction.guild.roles.cache.get(roleId);
                        const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                        return `**${position}${this.getPositionSuffix(position)} place:** ${roleName}`;
                    }).join('\n') || '*No positive roles configured*',
                    inline: false
                },
                {
                    name: '💀 Negative Leaderboard Roles',
                    value: Object.entries(negativeRoles).map(([position, roleId]) => {
                        const role = interaction.guild.roles.cache.get(roleId);
                        const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                        return `**${position}${this.getPositionSuffix(position)} place:** ${roleName}`;
                    }).join('\n') || '*No negative roles configured*',
                    inline: false
                }
            ])
            .setFooter({ text: 'Users who currently have these roles will keep them.' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles_confirm_clear')
                    .setLabel('🗑️ Yes, Clear All')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('config_leaderboard_roles_cancel_clear')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Primary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
    },

    async clearAllLeaderboardRoles(interaction, serverConfig) {
        const serverId = interaction.guild.id;
        
        try {
            // Fetch fresh server config to ensure we have the latest leaderboard roles
            const freshServerConfig = await DatabaseUtils.getServerConfig(serverId);
            console.log(`🔍 Fresh server config leaderboard_roles:`, JSON.stringify(freshServerConfig.leaderboard_roles, null, 2));
            
            const leaderboardRoles = freshServerConfig.leaderboard_roles || {};
            
            // Support both old flat format and new nested format
            let positiveRoles = {};
            let negativeRoles = {};
            let allRoleIds = [];
            
            if (leaderboardRoles.positive || leaderboardRoles.negative) {
                // New nested format
                positiveRoles = leaderboardRoles.positive || {};
                negativeRoles = leaderboardRoles.negative || {};
                allRoleIds = [...Object.values(positiveRoles), ...Object.values(negativeRoles)];
            } else {
                // Old flat format - treat all as general leaderboard roles
                allRoleIds = Object.values(leaderboardRoles);
            }
            
            const totalRoleCount = allRoleIds.length;
            
            console.log(`🎯 About to clear ${totalRoleCount} leaderboard roles`);
            console.log(`📋 Positive roles:`, JSON.stringify(positiveRoles, null, 2));
            console.log(`📋 Negative roles:`, JSON.stringify(negativeRoles, null, 2));
            console.log(`📋 All role IDs to remove:`, allRoleIds);
            
            // Remove all roles from users BEFORE clearing the configuration
            try {
                let removedCount = 0;
                
                console.log(`🎯 Processing ${allRoleIds.length} configured roles for removal`);
                for (const roleId of allRoleIds) {
                    try {
                        const roleIdString = String(roleId);
                        
                        // Force fetch the role from Discord API to ensure we have fresh data
                        let role;
                        try {
                            role = await interaction.guild.roles.fetch(roleIdString);
                            console.log(`🔍 Processing role ${roleIdString}: fetched fresh (${role.name})`);
                        } catch (fetchError) {
                            // If fetch fails, try cache as fallback
                            role = interaction.guild.roles.cache.get(roleIdString);
                            console.log(`🔍 Processing role ${roleIdString}: ${role ? `found in cache (${role.name})` : 'NOT FOUND'}`);
                        }
                        
                        if (role) {
                            // Try to get fresh members with this role but with timeout to prevent hanging
                            try {
                                // First try the role's members collection
                                let membersWithRole = role.members;
                                console.log(`👥 Role ${role.name} has ${membersWithRole.size} members (from role.members)`);
                                
                                // If no members found in role.members, try alternative detection methods
                                if (membersWithRole.size === 0) {
                                    console.log(`🔄 Trying alternative member detection for role ${role.name}`);
                                    
                                    // Method 1: Scan cached members
                                    const cachedMembers = interaction.guild.members.cache;
                                    const cachedMembersWithRole = cachedMembers.filter(member => member.roles.cache.has(roleIdString));
                                    console.log(`👥 Found ${cachedMembersWithRole.size} members with role ${role.name} (from cache scan)`);
                                    
                                    if (cachedMembersWithRole.size > 0) {
                                        membersWithRole = cachedMembersWithRole;
                                    } else {
                                        // Method 2: Check if we can identify who should have this role based on leaderboard
                                        console.log(`🔄 Checking leaderboard for who should have role ${role.name}`);
                                        try {
                                            // Get current leaderboard to see who should have the role
                                            const leaderboard = await DatabaseUtils.getLeaderboard(serverId, 10);
                                            const positiveLeaderboard = leaderboard.filter(entry => entry.total_score > 0);
                                            const negativeLeaderboard = leaderboard.filter(entry => entry.total_score < 0)
                                                .sort((a, b) => a.total_score - b.total_score);
                                            
                                            // Check if this role corresponds to a specific position
                                            const currentConfig = freshServerConfig.leaderboard_roles;
                                            let expectedUsersWithRole = [];
                                            
                                            // Check positive roles
                                            if (currentConfig.positive) {
                                                for (const [position, configRoleId] of Object.entries(currentConfig.positive)) {
                                                    if (configRoleId === roleIdString && positiveLeaderboard[parseInt(position) - 1]) {
                                                        const userId = positiveLeaderboard[parseInt(position) - 1].user_id;
                                                        console.log(`📍 User ${userId} should have role ${role.name} (positive position ${position})`);
                                                        expectedUsersWithRole.push(userId);
                                                    }
                                                }
                                            }
                                            
                                            // Check negative roles
                                            if (currentConfig.negative) {
                                                for (const [position, configRoleId] of Object.entries(currentConfig.negative)) {
                                                    if (configRoleId === roleIdString && negativeLeaderboard[parseInt(position) - 1]) {
                                                        const userId = negativeLeaderboard[parseInt(position) - 1].user_id;
                                                        console.log(`📍 User ${userId} should have role ${role.name} (negative position ${position})`);
                                                        expectedUsersWithRole.push(userId);
                                                    }
                                                }
                                            }
                                            
                                            // Brute force approach: Just try to remove the role from everyone who might have it
                                            // Since Discord cache is unreliable, let's just attempt removal on likely candidates
                                            console.log(`💪 Using brute force removal for role ${role.name}`);
                                            let actualRemovals = 0;
                                            
                                            for (const userId of expectedUsersWithRole) {
                                                try {
                                                    const member = await interaction.guild.members.fetch(String(userId));
                                                    console.log(`🔄 Attempting to remove role ${role.name} from ${member.user.tag}`);
                                                    
                                                    // Just try to remove the role - Discord will silently ignore if they don't have it
                                                    await member.roles.remove(roleIdString, 'Leaderboard roles cleared - brute force removal');
                                                    actualRemovals++;
                                                    console.log(`✅ Attempted removal of role ${role.name} from ${member.user.tag}`);
                                                } catch (removeError) {
                                                    console.log(`⚠️ Could not remove role from user ${userId}:`, removeError.message);
                                                }
                                            }
                                            
                                            console.log(`👥 Attempted ${actualRemovals} role removals for ${role.name}`);
                                            removedCount += actualRemovals;
                                        } catch (leaderboardError) {
                                            console.log(`⚠️ Could not check leaderboard:`, leaderboardError.message);
                                        }
                                    }
                                }
                                
                                // Note: Role removal is now handled in the brute force section above
                            } catch (memberError) {
                                console.error(`Error processing members for role ${role.name}:`, memberError);
                                // Continue with other roles even if this one fails
                            }
                        } else {
                            console.log(`⚠️ Role ${roleIdString} not found in guild`);
                        }
                    } catch (error) {
                        console.error(`Error removing role ${roleId}:`, error);
                    }
                }
                console.log(`🎯 Removed ${removedCount} role assignments before clearing configuration`);
            } catch (roleError) {
                console.error('Error removing roles before clear all:', roleError);
                // Continue with clearing config even if role removal fails
            }
            
            // Now clear all leaderboard roles from configuration
            await this.updateServerConfig(serverId, { leaderboard_roles: {} });
            
            // Log the configuration change
            await this.logConfigChange(interaction, 'Leaderboard Roles', 
                `${totalRoleCount} roles configured`, 
                'All leaderboard roles cleared'
            );
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ All Leaderboard Roles Cleared')
                .setDescription(`Successfully cleared all ${totalRoleCount} leaderboard role configuration${totalRoleCount !== 1 ? 's' : ''}.`)
                .setFooter({ text: 'Users who currently have these roles will keep them.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_leaderboard_roles')
                        .setLabel('← Back to Leaderboard Roles')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error clearing leaderboard roles:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error clearing leaderboard roles. Please try again.',
                components: []
            });
        }
    },

    async toggleLeaderboardRoleStrategy(interaction, serverConfig, leaderboardType) {
        const serverId = interaction.guild.id;
        
        try {
            const leaderboardRoles = serverConfig.leaderboard_roles || {};
            const assignmentStrategy = leaderboardRoles.assignment_strategy || {};
            
            // Get current strategy and cycle through: server-local → global-filtered → global → server-local
            const currentStrategy = assignmentStrategy[leaderboardType] || 'server-local';
            let newStrategy;
            switch (currentStrategy) {
                case 'server-local':
                    newStrategy = 'global-filtered';
                    break;
                case 'global-filtered':
                    newStrategy = 'global';
                    break;
                case 'global':
                    newStrategy = 'server-local';
                    break;
                default:
                    newStrategy = 'global-filtered';
            }
            
            // Update the strategy
            const updatedStrategy = {
                ...assignmentStrategy,
                [leaderboardType]: newStrategy
            };
            
            const updatedLeaderboardRoles = {
                ...leaderboardRoles,
                assignment_strategy: updatedStrategy
            };
            
            // Save to database
            await this.updateServerConfig(serverId, {
                leaderboard_roles: updatedLeaderboardRoles
            });
            
            // Log the configuration update
            console.log(`⚙️ Toggled ${leaderboardType} leaderboard strategy from ${currentStrategy} to ${newStrategy}`);
            
            // Apply roles immediately with new strategy
            try {
                await DatabaseUtils.assignLeaderboardRoles(serverId, interaction.guild);
                console.log(`✅ Applied leaderboard roles with new ${leaderboardType} strategy: ${newStrategy}`);
            } catch (roleError) {
                console.error('Error applying leaderboard roles after strategy change:', roleError);
            }
            
            // Show success message briefly, then return to config
            const getStrategyEmoji = (strategy) => {
                switch (strategy) {
                    case 'global': return '🌍';
                    case 'global-filtered': return '🌐';
                    default: return '🏠';
                }
            };
            
            const getStrategyName = (strategy) => {
                switch (strategy) {
                    case 'global': return 'Global';
                    case 'global-filtered': return 'Global (Server-Filtered)';
                    default: return 'Server-Local';
                }
            };
            
            const strategyEmoji = getStrategyEmoji(newStrategy);
            const strategyName = getStrategyName(newStrategy);
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Strategy Updated')
                .setDescription(`**${leaderboardType.charAt(0).toUpperCase() + leaderboardType.slice(1)} leaderboard assignment strategy** updated to:\n\n${strategyEmoji} **${strategyName}**\n\n${
                    newStrategy === 'global' 
                        ? 'Roles will only be assigned to users who are actually in the top global positions.' 
                        : newStrategy === 'global-filtered'
                        ? 'Roles will be assigned using the global leaderboard, but only to users who are present in this server.'
                        : 'Roles will be assigned to the highest-ranking users who are present in this server.'
                }\n\nReturning to configuration...`)
                .setTimestamp();
            
            await this.updateInteraction(interaction, { embeds: [embed], components: [] });
            
            // After a short delay, show the config menu again
            setTimeout(async () => {
                try {
                    const freshServerConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showLeaderboardRolesConfig(interaction, freshServerConfig);
                } catch (error) {
                    console.error('Error showing leaderboard config after strategy toggle:', error);
                }
            }, 5000);
            
        } catch (error) {
            console.error('Error toggling leaderboard role strategy:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error updating assignment strategy. Please try again.',
                components: []
            });
        }
    },

    async showEditLeaderboardRoleModal(interaction, position, roleId, leaderboardType) {
        const modal = new ModalBuilder()
            .setCustomId('config_edit_leaderboard_role_modal')
            .setTitle('Edit Leaderboard Role Position');

        const positionInput = new TextInputBuilder()
            .setCustomId('leaderboard_edit_position_input')
            .setLabel('New Leaderboard Position')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter new position (1, 2, 3, etc.)')
            .setMinLength(1)
            .setMaxLength(2)
            .setRequired(true);

        const oldPositionInput = new TextInputBuilder()
            .setCustomId('leaderboard_old_position_input')
            .setLabel('Current Position (do not edit)')
            .setStyle(TextInputStyle.Short)
            .setValue(position)
            .setRequired(true);

        const roleInput = new TextInputBuilder()
            .setCustomId('leaderboard_edit_role_input')
            .setLabel('Role ID (do not edit)')
            .setStyle(TextInputStyle.Short)
            .setValue(roleId)
            .setRequired(true);

        const leaderboardTypeInput = new TextInputBuilder()
            .setCustomId('leaderboard_edit_type_input')
            .setLabel('Leaderboard Type (do not edit)')
            .setStyle(TextInputStyle.Short)
            .setValue(leaderboardType)
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(positionInput);
        const row2 = new ActionRowBuilder().addComponents(oldPositionInput);
        const row3 = new ActionRowBuilder().addComponents(roleInput);
        const row4 = new ActionRowBuilder().addComponents(leaderboardTypeInput);
        modal.addComponents(row1, row2, row3, row4);

        await interaction.showModal(modal);
    },

    async removeLeaderboardRole(interaction, serverConfig, position, roleId, leaderboardType) {
        const serverId = interaction.guild.id;
        
        try {
            // Get role name for logging (ensure roleId is a string)
            const roleIdString = String(roleId);
            const role = interaction.guild.roles.cache.get(roleIdString);
            const roleName = role ? role.name : 'Unknown Role';
            
            // Remove the role from all users BEFORE removing it from configuration
            try {
                const roleIdString = String(roleId);
                const role = interaction.guild.roles.cache.get(roleIdString);
                if (role) {
                    const membersWithRole = role.members;
                    let removedCount = 0;
                    for (const [memberId, member] of membersWithRole) {
                        await member.roles.remove(roleIdString, 'Leaderboard role removed from configuration');
                        removedCount++;
                    }
                    console.log(`🎯 Removed role ${roleName} from ${removedCount} users before removing from config`);
                }
            } catch (roleError) {
                console.error('Error removing role from users before config removal:', roleError);
                // Continue with config removal even if role removal fails
            }
            
            // Now remove the leaderboard role from configuration
            const currentLeaderboardRoles = serverConfig.leaderboard_roles || {};
            const updatedLeaderboardRoles = { ...currentLeaderboardRoles };
            
            // Remove from the correct leaderboard type
            if (leaderboardType === 'negative' && updatedLeaderboardRoles.negative) {
                delete updatedLeaderboardRoles.negative[position];
            } else if (leaderboardType === 'positive' && updatedLeaderboardRoles.positive) {
                delete updatedLeaderboardRoles.positive[position];
            }
            
            await this.updateServerConfig(serverId, { leaderboard_roles: updatedLeaderboardRoles });
            
            // Log the configuration change
            await this.logConfigChange(interaction, 'Leaderboard Roles', 
                `${position}${this.getPositionSuffix(position)} place → @${roleName}`, 
                'Leaderboard role removed'
            );
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Leaderboard Role Removed')
                .setDescription(`Successfully removed leaderboard role configuration:\n\n**${position}${this.getPositionSuffix(position)} place → @${roleName}**`)
                .setFooter({ text: 'Users who currently have this role will keep it.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_leaderboard_roles')
                        .setLabel('← Back to Leaderboard Roles')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error removing leaderboard role:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error removing leaderboard role. Please try again.',
                components: []
            });
        }
    },

    // ================================
    // REACTION-BASED VOTING CONFIG
    // ================================

    async showReactionConfig(interaction, serverConfig) {
        try {
            const customReactions = await DatabaseUtils.getCustomReactions(interaction.guild.id);
            
            const embed = new EmbedBuilder()
                .setColor(serverConfig.embed_color || '#5865F2')
                .setTitle('😀 Reaction-Based Voting Configuration')
                .setDescription('Configure emoji reactions that award points directly when used on messages.')
                .addFields([
                    {
                        name: '📋 Current Custom Reactions',
                        value: customReactions.length > 0 
                            ? customReactions.map(r => `${r.emoji} → ${r.point_value > 0 ? '+' : ''}${r.point_value} points`).join('\n')
                            : 'No custom reactions configured',
                        inline: false
                    },
                    {
                        name: '🎯 How It Works',
                        value: '• Users react to messages with configured emojis\n• Points are awarded based on emoji values\n• Voting thresholds still apply\n• Bypasses max point limits per award',
                        inline: false
                    }
                ])
                .setFooter({ text: 'Manage your custom reaction emojis below' });

            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_reactions_add')
                        .setLabel('➕ Add Emoji')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('config_reactions_edit')
                        .setLabel('✏️ Edit Emoji')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(customReactions.length === 0),
                    new ButtonBuilder()
                        .setCustomId('config_reactions_remove')
                        .setLabel('🗑️ Remove Emoji')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(customReactions.length === 0)
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_reactions_defaults')
                        .setLabel('🔍 Preview Defaults')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('config_reactions_clear')
                        .setLabel('🧹 Clear All')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(customReactions.length === 0),
                    new ButtonBuilder()
                        .setCustomId('config_blocked_channels')
                        .setLabel('🚫 Blocked Channels')
                        .setStyle(ButtonStyle.Secondary)
                );

            const row3 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_main')
                        .setLabel('← Back to Main')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2, row3] });
        } catch (error) {
            console.error('Error showing reaction config:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error loading reaction configuration. Please try again.',
                components: []
            });
        }
    },

    // ================================
    // BLOCKED CHANNELS CONFIGURATION
    // ================================

    async showBlockedChannelsConfig(interaction, serverConfig) {
        try {
            const blockedChannels = await DatabaseUtils.getBlockedChannels(interaction.guild.id);
            
            const embed = new EmbedBuilder()
                .setColor(serverConfig.embed_color || '#5865F2')
                .setTitle('🚫 Blocked Channels Configuration')
                .setDescription('Configure channels where reaction point awards are disabled. This is useful for announcement channels or other high-traffic areas where reaction spam could be overwhelming.')
                .addFields([
                    {
                        name: '📋 Current Blocked Channels',
                        value: blockedChannels.length > 0 
                            ? blockedChannels.map(bc => {
                                const channelMention = `<#${bc.channel_id}>`;
                                const reason = bc.reason ? ` (${bc.reason})` : '';
                                return `• ${channelMention}${reason}`;
                            }).join('\n')
                            : 'No channels are currently blocked',
                        inline: false
                    },
                    {
                        name: '🎯 How It Works',
                        value: '• Blocked channels ignore all reaction point awards\n• Users can still react normally, but no points are awarded\n• Useful for announcement channels, spam channels, etc.\n• Only affects reaction-based point awards (not reply-based)',
                        inline: false
                    }
                ])
                .setFooter({ text: 'Manage blocked channels below' });

            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_blocked_channels_add')
                        .setLabel('➕ Add Channel')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('config_blocked_channels_remove')
                        .setLabel('🗑️ Remove Channel')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(blockedChannels.length === 0),
                    new ButtonBuilder()
                        .setCustomId('config_blocked_channels_clear')
                        .setLabel('🧹 Clear All')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(blockedChannels.length === 0)
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_reactions')
                        .setLabel('← Back to Reactions')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
        } catch (error) {
            console.error('Error showing blocked channels config:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error loading blocked channels configuration. Please try again.',
                components: []
            });
        }
    },

    async startBlockedChannelAddProcess(interaction) {
        try {
            logger.config(`Starting blocked channel add process for ${interaction.user.tag}`, 'BLOCKED_CHANNELS');
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('📝 Add Blocked Channel')
                .setDescription('**Step 1:** Mention the channel you want to block from reaction point awards.\n\n**Example:**\n`#announcements`\n`#general`\n`#spam`\n\n**Or send the channel ID directly:**\n`123456789012345678`')
                .addFields([
                    {
                        name: '⏱️ Timeout',
                        value: 'This will timeout in 60 seconds if no channel is provided',
                        inline: false
                    },
                    {
                        name: '💡 Tip',
                        value: 'You can also provide a reason after the channel mention, like: `#announcements Spam prevention`',
                        inline: false
                    }
                ])
                .setFooter({ text: 'Send a message with the channel mention or ID' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_blocked_channels_cancel_add')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.update({ embeds: [embed], components: [row] });

            // Set up message collector for channel input
            const userId = interaction.user.id;
            const channelId = interaction.channel.id;
            
            const messageFilter = (msg) => msg.author.id === userId && msg.channel.id === channelId;
            const messageCollector = interaction.channel.createMessageCollector({ 
                filter: messageFilter, 
                time: 60000,
                max: 1 
            });

            messageCollector.on('collect', async (msg) => {
                try {
                    await this.processBlockedChannelSelection(interaction, msg.content, msg);
                } catch (error) {
                    logger.errorWithStack('Error processing blocked channel selection', error, 'BLOCKED_CHANNELS');
                    await interaction.editReply({
                        content: '❌ Error processing channel selection. Please try again.',
                        embeds: [],
                        components: []
                    });
                }
            });

            messageCollector.on('end', async (collected) => {
                if (collected.size === 0) {
                    await this.handleBlockedChannelTimeout(interaction);
                }
            });

        } catch (error) {
            logger.errorWithStack('Error starting blocked channel add process', error, 'BLOCKED_CHANNELS');
            await interaction.editReply({
                content: '❌ Error starting blocked channel addition. Please try again.',
                embeds: [],
                components: []
            });
        }
    },

    async processBlockedChannelSelection(interaction, content, userMessage = null) {
        try {
            // Extract channel mention or ID from the message
            const channelMatch = content.match(/<#(\d+)>|(\d{17,19})/);
            if (!channelMatch) {
                await interaction.editReply({
                    content: '❌ Invalid channel format. Please mention a channel (e.g., `#general`) or provide a channel ID.',
                    embeds: [],
                    components: []
                });
                return;
            }

            const channelId = channelMatch[1] || channelMatch[2];
            const channel = interaction.guild.channels.cache.get(String(channelId));
            
            if (!channel) {
                await interaction.editReply({
                    content: '❌ Channel not found. Please make sure the channel exists and is accessible.',
                    embeds: [],
                    components: []
                });
                return;
            }

            // Check if channel is already blocked
            const existingBlock = await DatabaseUtils.isChannelBlocked(interaction.guild.id, String(channelId));
            if (existingBlock) {
                await interaction.editReply({
                    content: `❌ Channel ${channel} is already blocked from reaction point awards.`,
                    embeds: [],
                    components: []
                });
                return;
            }

            // Extract reason from the message (everything after the channel mention/ID)
            const reasonMatch = content.match(/(?:<#\d+>|\d{17,19})\s+(.+)/);
            const reason = reasonMatch ? reasonMatch[1].trim() : null;

            // Add the blocked channel
            await DatabaseUtils.addBlockedChannel(interaction.guild.id, String(channelId), reason, interaction.user.id);
            
            // Log the configuration change
            await this.logConfigChange(interaction, 'Blocked Channels', 
                'New blocked channel', 
                `${channel}${reason ? ` (${reason})` : ''}`
            );
            
            const successEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Channel Blocked Successfully!')
                .setDescription(`**${channel}** is now blocked from reaction point awards`)
                .addFields([
                    {
                        name: '🎉 All Set!',
                        value: 'Users can still react normally in this channel, but no points will be awarded.',
                        inline: false
                    }
                ]);

            if (reason) {
                successEmbed.addFields([
                    {
                        name: '📝 Reason',
                        value: reason,
                        inline: false
                    }
                ]);
            }

            const successRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_blocked_channels')
                        .setLabel('← Back to Blocked Channels')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.editReply({ embeds: [successEmbed], components: [successRow] });
            
        } catch (error) {
            logger.errorWithStack('Error processing blocked channel selection', error, 'BLOCKED_CHANNELS');
            await interaction.editReply({
                content: '❌ Error adding blocked channel. Please try again.',
                embeds: [],
                components: []
            });
        }
    },

    async handleBlockedChannelTimeout(interaction) {
        const timeoutMessage = '⏰ Blocked channel addition timed out. No channel was provided within 60 seconds.';
            
        // Send ephemeral timeout message
        await interaction.followUp({
            content: timeoutMessage,
            flags: MessageFlags.Ephemeral
        });
        
        // Redirect back to blocked channels config menu
        try {
            const serverConfig = await DatabaseUtils.getServerConfig(interaction.guild.id);
            await this.showBlockedChannelsConfig(interaction, serverConfig);
        } catch (error) {
            logger.errorWithStack('Error redirecting to blocked channels config on timeout', error, 'BLOCKED_CHANNELS');
            const timeoutRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_blocked_channels')
                        .setLabel('← Back to Blocked Channels')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.editReply({
                content: timeoutMessage,
                embeds: [],
                components: [timeoutRow]
            }).catch(() => {});
        }
    },

    async showRemoveBlockedChannelSelect(interaction, serverConfig) {
        try {
            const blockedChannels = await DatabaseUtils.getBlockedChannels(interaction.guild.id);
            
            if (blockedChannels.length === 0) {
                await interaction.update({
                    content: '❌ No blocked channels configured to remove.',
                    embeds: [],
                    components: []
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('🗑️ Remove Blocked Channel')
                .setDescription('Select a channel to remove from the blocked list:')
                .setColor('#ff6b6b');

            const options = blockedChannels.map(bc => {
                const channel = interaction.guild.channels.cache.get(String(bc.channel_id));
                const channelName = channel ? `#${channel.name}` : `Channel ${bc.channel_id}`;
                const reason = bc.reason ? ` (${bc.reason})` : '';
                return {
                    label: channelName + reason,
                    value: String(bc.channel_id),
                    description: `Blocked by ${interaction.guild.members.cache.get(String(bc.blocked_by))?.displayName || 'Unknown'}`
                };
            });

            const select = new StringSelectMenuBuilder()
                .setCustomId('config_blocked_channels_remove_select')
                .setPlaceholder('Choose a channel to unblock...')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(select);

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            logger.errorWithStack('Error showing remove blocked channel select', error, 'BLOCKED_CHANNELS');
            await this.updateInteraction(interaction, {
                content: '❌ Error loading blocked channels. Please try again.',
                embeds: [],
                components: []
            });
        }
    },

    async removeBlockedChannel(interaction, serverConfig, channelId) {
        try {
            const channelMention = `<#${channelId}>`;
            
            const removed = await DatabaseUtils.removeBlockedChannel(interaction.guild.id, String(channelId));
            
            if (removed) {
                // Log the configuration change
                await this.logConfigChange(interaction, 'Blocked Channels', 
                    `Blocked channel ${channelMention}`, 
                    'Removed from blocked list'
                );
                
                const successEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Channel Unblocked Successfully!')
                    .setDescription(`**${channelMention}** is no longer blocked from reaction point awards`)
                    .addFields([
                        {
                            name: '🎉 All Set!',
                            value: 'Users can now receive reaction point awards in this channel.',
                            inline: false
                        }
                    ]);

                const successRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('config_blocked_channels')
                            .setLabel('← Back to Blocked Channels')
                            .setStyle(ButtonStyle.Primary)
                    );

                await this.updateInteraction(interaction, { embeds: [successEmbed], components: [successRow] });
            } else {
                await this.updateInteraction(interaction, {
                    content: `❌ Channel ${channelMention} was not found in the blocked list.`,
                    embeds: [],
                    components: []
                });
            }
        } catch (error) {
            logger.errorWithStack('Error removing blocked channel', error, 'BLOCKED_CHANNELS');
            await this.updateInteraction(interaction, {
                content: '❌ Error removing blocked channel. Please try again.',
                embeds: [],
                components: []
            });
        }
    },

    async showClearAllBlockedChannelsConfirmation(interaction, serverConfig) {
        try {
            const blockedChannels = await DatabaseUtils.getBlockedChannels(interaction.guild.id);
            
            const embed = new EmbedBuilder()
                .setColor('#ff6b6b')
                .setTitle('⚠️ Clear All Blocked Channels')
                .setDescription('Are you sure you want to remove **ALL** blocked channel configurations?\n\n**This action cannot be undone!**')
                .addFields([
                    {
                        name: '📋 Channels to Unblock',
                        value: blockedChannels.length > 0 
                            ? blockedChannels.map(bc => `<#${bc.channel_id}>`).join('\n')
                            : 'No channels are currently blocked',
                        inline: false
                    }
                ]);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_blocked_channels_clear_confirm')
                        .setLabel('✅ Yes, Clear All')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('config_blocked_channels')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            logger.errorWithStack('Error showing clear all blocked channels confirmation', error, 'BLOCKED_CHANNELS');
            await this.updateInteraction(interaction, {
                content: '❌ Error loading blocked channels. Please try again.',
                embeds: [],
                components: []
            });
        }
    },

    async clearAllBlockedChannels(interaction, serverConfig) {
        try {
            const blockedChannels = await DatabaseUtils.getBlockedChannels(interaction.guild.id);
            const channelCount = blockedChannels.length;
            
            // Clear all blocked channels
            const cleared = await DatabaseUtils.clearBlockedChannels(interaction.guild.id);
            
            // Log the configuration change
            await this.logConfigChange(interaction, 'Blocked Channels', 
                `${channelCount} blocked channels`,
                'All blocked channels cleared'
            );
            
            const successEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ All Blocked Channels Cleared!')
                .setDescription(`Successfully unblocked all ${channelCount} channels.`)
                .addFields([
                    {
                        name: '🎉 All Set!',
                        value: 'All channels can now receive reaction point awards.',
                        inline: false
                    }
                ]);

            const successRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_blocked_channels')
                        .setLabel('← Back to Blocked Channels')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [successEmbed], components: [successRow] });
        } catch (error) {
            logger.errorWithStack('Error clearing all blocked channels', error, 'BLOCKED_CHANNELS');
            await this.updateInteraction(interaction, {
                content: '❌ Error clearing blocked channels. Please try again.',
                embeds: [],
                components: []
            });
        }
    },

    // ================================
    // CHAT-BASED EMOJI ADDITION SYSTEM
    // ================================

    async startEmojiAddProcess(interaction) {
        try {
            logger.config(`Starting emoji add process for ${interaction.user.tag}`, 'EMOJI');
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('📝 Add Custom Emoji Reaction')
                .setDescription('**Step 1:** Choose how to provide the emoji you want to configure:\n\n**Option A:** Send the emoji in chat\n**Option B:** React to this message with the emoji\n\n**Supported formats:**\n• Standard emoji: 👍 😄 🔥\n• Custom emoji: :custom_name:\n• Full emoji format: <:name:id>')
                .addFields([
                    {
                        name: '⏱️ Timeout',
                        value: 'This will timeout in 60 seconds if no emoji is provided',
                        inline: false
                    }
                ])
                .setFooter({ text: 'Send a message or react to this message with your emoji' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_reactions_cancel_add')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            // Update the existing message instead of creating a new one
            await interaction.update({ embeds: [embed], components: [row] });
            const response = await interaction.fetchReply();
            
            // Set up collectors for both messages and reactions
            await this.setupEmojiCollectors(interaction, response);
            
        } catch (error) {
            logger.errorWithStack('Error starting emoji add process', error, 'EMOJI');
            await this.updateInteraction(interaction, {
                content: '❌ Error starting emoji addition. Please try again.',
                components: []
            });
        }
    },

    async setupEmojiCollectors(interaction, response) {
        const userId = interaction.user.id;
        const channelId = interaction.channel.id;
        
        // Message collector for emoji in chat
        const messageFilter = (msg) => msg.author.id === userId && msg.channel.id === channelId;
        const messageCollector = interaction.channel.createMessageCollector({ 
            filter: messageFilter, 
            time: 60000
            // Removed max: 1 so collector keeps listening for valid emoji
        });

        // Reaction collector for reactions on the bot's message
        const reactionFilter = (reaction, user) => user.id === userId;
        const reactionCollector = response.createReactionCollector({ 
            filter: reactionFilter, 
            time: 60000, 
            max: 1 
        });

        messageCollector.on('collect', async (message) => {
            const emoji = this.extractEmojiFromMessage(message.content);
            if (emoji) {
                // Validate that this is a custom emoji from this server
                const validation = await this.validateCustomEmoji(emoji, interaction.guild);
                if (validation.valid) {
                    logger.verbose(`Message contains valid custom emoji: ${validation.name} (ID: ${validation.id})`, 'EMOJI');
                    messageCollector.stop('valid_emoji');
                    reactionCollector.stop('message');
                    await this.processEmojiSelection(interaction, emoji, message);
                } else {
                    // Send ephemeral error message
                    await interaction.followUp({
                        content: `❌ ${validation.error}. Please use a custom emoji from this server.`,
                        flags: MessageFlags.Ephemeral
                    });
                    
                    // Redirect back to reaction config menu
                    try {
                        const serverConfig = await DatabaseUtils.getServerConfig(interaction.guild.id);
                        await this.showReactionConfig(interaction, serverConfig);
                    } catch (error) {
                        logger.errorWithStack('Error redirecting to reaction config from message validation', error, 'EMOJI');
                        await message.reply(`❌ ${validation.error}. Please use a custom emoji from this server.`);
                    }
                    // Keep collecting
                }
            } else {
                await message.reply('❌ I couldn\'t find a valid emoji in your message. Please try again with just the emoji.');
                // Keep collecting, don't stop the collector
            }
        });

        reactionCollector.on('collect', async (reaction, user) => {
            messageCollector.stop('reaction');
            
            // Debug logging to understand what emoji we're getting
            logger.verbose(`Reaction collected: ${JSON.stringify({
                id: reaction.emoji.id,
                name: reaction.emoji.name,
                animated: reaction.emoji.animated,
                identifier: reaction.emoji.identifier,
                toString: reaction.emoji.toString(),
                url: reaction.emoji.url
            })}`, 'EMOJI');
            
            // Validate that we have a custom emoji with an ID
            if (!reaction.emoji.id) {
                logger.verbose('Reaction is not a custom emoji (no ID)', 'EMOJI');
                await interaction.editReply({
                    content: '❌ Please react with a custom emoji (server emoji), not a standard emoji.',
                    embeds: [],
                    components: []
                });
                return;
            }

            // Additional validation: ensure this emoji exists in the server
            let serverEmoji = interaction.guild.emojis.cache.get(reaction.emoji.id);
            if (!serverEmoji) {
                // Try to refresh the emoji cache in case it's a caching issue
                logger.verbose(`Emoji ${reaction.emoji.id} not found in cache, attempting to refresh...`, 'EMOJI');
                try {
                    await interaction.guild.emojis.fetch();
                    serverEmoji = interaction.guild.emojis.cache.get(reaction.emoji.id);
                } catch (fetchError) {
                    logger.errorWithStack('Error fetching guild emojis', fetchError, 'EMOJI');
                }
            }
            
            if (!serverEmoji) {
                logger.error(`Reaction emoji ${reaction.emoji.id} not found in server ${interaction.guild.id}`, 'EMOJI');
                
                // Send ephemeral error message
                await interaction.followUp({
                    content: '❌ This emoji is not from this server. Please use a custom emoji from this server.',
                    flags: MessageFlags.Ephemeral
                });
                
                // Redirect back to reaction config menu
                try {
                    const serverConfig = await DatabaseUtils.getServerConfig(interaction.guild.id);
                    await this.showReactionConfig(interaction, serverConfig);
                } catch (error) {
                    logger.errorWithStack('Error redirecting to reaction config', error, 'EMOJI');
                    await interaction.editReply({
                        content: '❌ This emoji is not from this server. Please use a custom emoji from this server.',
                        embeds: [],
                        components: []
                    });
                }
                return;
            }

            logger.verbose(`Reaction emoji verified in server: ${serverEmoji.name} (${serverEmoji.id})`, 'EMOJI');
            
            const emoji = this.formatEmojiFromReaction(reaction.emoji);
            logger.verbose(`Formatted emoji string: ${emoji}`, 'EMOJI');
            
            await this.processEmojiSelection(interaction, emoji);
        });

        messageCollector.on('end', (collected, reason) => {
            if (reason === 'time' && !reactionCollector.ended) {
                this.handleEmojiTimeout(interaction);
            }
            // If reason is 'valid_emoji' or 'reaction', we already processed successfully
        });

        reactionCollector.on('end', (collected, reason) => {
            if (reason === 'time' && !messageCollector.ended) {
                this.handleEmojiTimeout(interaction);
            }
            // If reason is 'message', we already processed successfully
        });
    },

    extractEmojiFromMessage(content) {
        // Extract various emoji formats from message content
        const trimmed = content.trim();
        
        // Custom emoji format: <:name:id> or <a:name:id>
        const customEmojiMatch = trimmed.match(/^<a?:([^:]+):(\d+)>$/);
        if (customEmojiMatch) {
            return trimmed;
        }
        
        // Standard Unicode emoji (single emoji)
        const emojiRegex = /^\p{Emoji}$/u;
        if (emojiRegex.test(trimmed)) {
            return trimmed;
        }
        
        // Shortcode format: :emoji_name:
        const shortcodeMatch = trimmed.match(/^:([a-zA-Z0-9_]+):$/);
        if (shortcodeMatch) {
            return trimmed;
        }
        
        return null;
    },

    formatEmojiFromReaction(emoji) {
        if (emoji.id) {
            // Custom emoji - ensure we have all required properties
            if (!emoji.name) {
                logger.error('Custom emoji missing name property', 'EMOJI');
                throw new Error('Invalid custom emoji: missing name');
            }
            
            // Use toString() method which handles formatting correctly
            const formatted = emoji.toString();
            logger.verbose(`Formatted custom emoji: ${formatted} (ID: ${emoji.id}, Name: ${emoji.name})`, 'EMOJI');
            return formatted;
        } else {
            // Unicode emoji
            logger.verbose(`Unicode emoji: ${emoji.name}`, 'EMOJI');
            return emoji.name;
        }
    },

    async validateCustomEmoji(emojiString, guild) {
        // Validate that this is a proper custom emoji format
        const emojiMatch = emojiString.match(/^<a?:([^:]+):(\d+)>$/);
        if (!emojiMatch) {
            return { valid: false, error: 'Invalid emoji format' };
        }

        const [, emojiName, emojiId] = emojiMatch;
        
        // Check if the emoji exists in the guild
        let serverEmoji = guild.emojis.cache.get(emojiId);
        if (!serverEmoji) {
            // Try to refresh the emoji cache in case it's a caching issue
            logger.verbose(`Emoji ${emojiId} not found in cache during validation, attempting to refresh...`, 'EMOJI');
            try {
                await guild.emojis.fetch();
                serverEmoji = guild.emojis.cache.get(emojiId);
            } catch (fetchError) {
                logger.errorWithStack('Error fetching guild emojis during validation', fetchError, 'EMOJI');
            }
        }
        
        if (!serverEmoji) {
            return { valid: false, error: 'Emoji not found in server' };
        }

        return { 
            valid: true, 
            emoji: serverEmoji,
            name: emojiName,
            id: emojiId,
            formatted: emojiString
        };
    },

    async processEmojiSelection(interaction, emoji, userMessage = null) {
        try {
            // Delete user's message if it exists
            if (userMessage && userMessage.deletable) {
                await userMessage.delete().catch(() => {});
            }

            // Validate that this is a custom emoji from this server
            const validation = await this.validateCustomEmoji(emoji, interaction.guild);
            if (!validation.valid) {
                logger.error(`Emoji validation failed: ${validation.error} for ${emoji}`, 'EMOJI');
                
                // Send ephemeral error message
                await interaction.followUp({
                    content: `❌ ${validation.error}. Please use a custom emoji from this server.`,
                    flags: MessageFlags.Ephemeral
                });
                
                // Redirect back to reaction config menu
                try {
                    const serverConfig = await DatabaseUtils.getServerConfig(interaction.guild.id);
                    await this.showReactionConfig(interaction, serverConfig);
                } catch (error) {
                    logger.errorWithStack('Error redirecting to reaction config from processEmojiSelection', error, 'EMOJI');
                    await interaction.editReply({
                        content: `❌ ${validation.error}. Please use a custom emoji from this server.`,
                        embeds: [],
                        components: []
                    });
                }
                return;
            }

            logger.verbose(`Validated custom emoji: ${validation.name} (ID: ${validation.id})`, 'EMOJI');

            const pointsEmbed = new EmbedBuilder()
                .setColor('#ffaa00')
                .setTitle('🎯 Set Point Value')
                .setDescription(`**Selected Emoji:** ${emoji}\n\n**Step 2:** Reply with the point value for this emoji`)
                .addFields([
                    {
                        name: '📊 Point Value Rules',
                        value: '• Any non-zero number\n• Examples: `5`, `-3`, `100`, `-50`',
                        inline: false
                    }
                ])
                .setFooter({ text: 'Reply with just the number (e.g., "30" or "-15")' });

            const pointsRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_reactions_cancel_add')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({ embeds: [pointsEmbed], components: [pointsRow] });

            // Set up collector for point value
            const pointsFilter = (msg) => msg.author.id === interaction.user.id && msg.channel.id === interaction.channel.id;
            const pointsCollector = interaction.channel.createMessageCollector({ 
                filter: pointsFilter, 
                time: 30000
                // Removed max: 1 so collector keeps listening for valid input
            });

            pointsCollector.on('collect', async (message) => {
                const pointsText = message.content.trim().replace(/[^-\d]/g, '');
                const points = parseInt(pointsText);
                
                if (isNaN(points) || points === 0) {
                    await message.reply('❌ Invalid point value. Please enter a non-zero number (e.g., 5, -3, 100, -50).');
                    return; // Keep collecting, don't stop the collector
                }

                // Valid input received - stop the collector
                pointsCollector.stop('valid_input');

                // Delete the user's points message
                if (message.deletable) {
                    await message.delete().catch(() => {});
                }

                await this.finalizeEmojiAddition(interaction, emoji, points);
            });

            pointsCollector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    this.handleEmojiTimeout(interaction, 'points');
                }
                // If reason is 'valid_input', we already processed the emoji successfully
            });

        } catch (error) {
            logger.errorWithStack('Error processing emoji selection', error, 'EMOJI');
            await interaction.editReply({
                content: '❌ Error processing emoji selection. Please try again.',
                embeds: [],
                components: []
            });
        }
    },

    async finalizeEmojiAddition(interaction, emoji, points) {
        try {
            const serverId = interaction.guild.id;
            
            // Add the custom reaction
            await DatabaseUtils.setCustomReaction(serverId, emoji, points);
            
            // Log the configuration change
            await this.logConfigChange(interaction, 'Reaction Voting', 
                'New reaction', 
                `${emoji} → ${points > 0 ? '+' : ''}${points} points`
            );
            
            const successEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Emoji Added Successfully!')
                .setDescription(`**${emoji}** will now award **${points > 0 ? '+' : ''}${points} points** when used as a reaction`)
                .addFields([
                    {
                        name: '🎉 All Set!',
                        value: 'Users can now react to messages with this emoji to award points.',
                        inline: false
                    }
                ])
                .setFooter({ text: 'Returning to reaction configuration...' });

            const successRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_reactions')
                        .setLabel('← Back to Reactions')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.editReply({ embeds: [successEmbed], components: [successRow] });
            
        } catch (error) {
            logger.errorWithStack('Error finalizing emoji addition', error, 'EMOJI');
            await interaction.editReply({
                content: '❌ Error adding custom reaction. The emoji may already be configured or invalid.',
                embeds: [],
                components: []
            });
        }
    },

    async handleEmojiTimeout(interaction, step = 'emoji') {
        const timeoutMessage = step === 'emoji' 
            ? '⏰ Emoji addition timed out. No emoji was provided within 60 seconds.'
            : '⏰ Point value input timed out. Please try again.';
            
        // Send ephemeral timeout message
        await interaction.followUp({
            content: timeoutMessage,
            flags: MessageFlags.Ephemeral
        });
        
        // Redirect back to reaction config menu
        try {
            const serverConfig = await DatabaseUtils.getServerConfig(interaction.guild.id);
            await this.showReactionConfig(interaction, serverConfig);
        } catch (error) {
            logger.errorWithStack('Error redirecting to reaction config on timeout', error, 'EMOJI');
            const timeoutRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_reactions')
                        .setLabel('← Back to Reactions')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.editReply({
                content: timeoutMessage,
                embeds: [],
                components: [timeoutRow]
            }).catch(() => {});
        }
    },

    // Handle cancel button for emoji addition
    async handleEmojiAddCancel(interaction) {
        try {
            const serverId = interaction.guild.id;
            const serverConfig = await DatabaseUtils.getServerConfig(serverId);
            
            // Return to the reaction configuration instead of showing a cancel message
            await this.showReactionConfig(interaction, serverConfig);
        } catch (error) {
            logger.errorWithStack('Error handling emoji add cancel', error, 'EMOJI');
            await interaction.update({
                content: '❌ Emoji addition cancelled.',
                embeds: [],
                components: []
            });
        }
    },

    async showEditReactionModal(interaction, serverConfig, emoji) {
        try {
            // Get the current reaction to show existing point value
            const currentReaction = await DatabaseUtils.getCustomReaction(interaction.guild.id, emoji);
            const currentPoints = currentReaction ? currentReaction.point_value : 0;

            const modal = new ModalBuilder()
                .setCustomId('config_edit_reaction_modal')
                .setTitle('Edit Reaction Point Value');

            const emojiInput = new TextInputBuilder()
                .setCustomId('reaction_emoji_input')
                .setLabel('Emoji (read-only)')
                .setStyle(TextInputStyle.Short)
                .setValue(emoji)
                .setRequired(false);

            const pointsInput = new TextInputBuilder()
                .setCustomId('reaction_edit_points_input')
                .setLabel('Point Value')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter point value (e.g., 5, -3, 100)')
                .setValue(currentPoints.toString())
                .setMinLength(1)
                .setMaxLength(5)
                .setRequired(true);

            const row1 = new ActionRowBuilder().addComponents(emojiInput);
            const row2 = new ActionRowBuilder().addComponents(pointsInput);
            modal.addComponents(row1, row2);

            await interaction.showModal(modal);
        } catch (error) {
            console.error('Error showing edit reaction modal:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error showing edit dialog. Please try again.',
                components: []
            });
        }
    },

    async showEditReactionSelect(interaction, serverConfig) {
        try {
            const customReactions = await DatabaseUtils.getCustomReactions(interaction.guild.id);
            
            if (customReactions.length === 0) {
                await this.updateInteraction(interaction, {
                    content: '❌ No custom reactions configured to edit.',
                    components: []
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(serverConfig.embed_color || '#5865F2')
                .setTitle('✏️ Edit Custom Reaction')
                .setDescription('Select a reaction to edit from the dropdown below.');

            const options = customReactions.map(reaction => ({
                label: `${reaction.emoji} → ${reaction.point_value > 0 ? '+' : ''}${reaction.point_value} points`,
                value: reaction.emoji,
                description: `Edit this reaction's point value`
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('config_reaction_edit_select')
                .setPlaceholder('Choose a reaction to edit')
                .addOptions(options);

            const row1 = new ActionRowBuilder().addComponents(selectMenu);
            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_reactions')
                        .setLabel('← Back to Reactions')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
        } catch (error) {
            console.error('Error showing edit reaction select:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error loading reactions. Please try again.',
                components: []
            });
        }
    },

    async showRemoveReactionSelect(interaction, serverConfig) {
        try {
            const customReactions = await DatabaseUtils.getCustomReactions(interaction.guild.id);
            
            if (customReactions.length === 0) {
                await this.updateInteraction(interaction, {
                    content: '❌ No custom reactions configured to remove.',
                    components: []
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(serverConfig.embed_color || '#5865F2')
                .setTitle('🗑️ Remove Custom Reaction')
                .setDescription('Select a reaction to remove from the dropdown below.');

            const options = customReactions.map(reaction => ({
                label: `${reaction.emoji} → ${reaction.point_value > 0 ? '+' : ''}${reaction.point_value} points`,
                value: reaction.emoji,
                description: `Remove this reaction`
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('config_reaction_remove_select')
                .setPlaceholder('Choose a reaction to remove')
                .addOptions(options);

            const row1 = new ActionRowBuilder().addComponents(selectMenu);
            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_reactions')
                        .setLabel('← Back to Reactions')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
        } catch (error) {
            console.error('Error showing remove reaction select:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error loading reactions. Please try again.',
                components: []
            });
        }
    },

    async showDefaultReactionsPreview(interaction, serverConfig) {
        try {
            const defaultReactions = [
                { emoji: '➕', point_value: 1 },
                { emoji: '➖', point_value: -1 },
                { emoji: '😄', point_value: 3 },
                { emoji: '😐', point_value: -3 },
                { emoji: '🥶', point_value: -5 },
                { emoji: '🔥', point_value: 5 }
            ];

            const embed = new EmbedBuilder()
                .setColor('#ffaa00')
                .setTitle('🔍 Preview: Default Emoji Reactions')
                .setDescription('These emojis and point values will be added to your server:')
                .addFields([
                    {
                        name: '📊 Default Reactions',
                        value: defaultReactions.map(r => `${r.emoji} → ${r.point_value > 0 ? '+' : ''}${r.point_value} points`).join('\n'),
                        inline: false
                    },
                    {
                        name: '📝 What happens next?',
                        value: '• These reactions will be added to your server configuration\n• Users can react with these emojis to award points\n• You can edit or remove them later in the reactions menu',
                        inline: false
                    }
                ])
                .setFooter({ text: 'Choose an option below to continue' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_reactions_confirm_defaults')
                        .setLabel('✅ Add These Reactions')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('config_reactions_cancel_defaults')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('config_reactions')
                        .setLabel('← Back to Reactions')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error showing default reactions preview:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error showing preview. Please try again.',
                components: []
            });
        }
    },

    async setupDefaultReactions(interaction, serverConfig) {
        try {
            const serverId = interaction.guild.id;
            const defaultReactions = [
                { emoji: '➕', point_value: 1 },
                { emoji: '➖', point_value: -1 },
                { emoji: '😄', point_value: 3 },
                { emoji: '😐', point_value: -3 },
                { emoji: '🥶', point_value: -5 },
                { emoji: '🔥', point_value: 5 }
            ];

            // Add default reactions
            for (const reaction of defaultReactions) {
                await DatabaseUtils.setCustomReaction(serverId, reaction.emoji, reaction.point_value);
            }

            // Log the configuration change
            await this.logConfigChange(interaction, 'Reaction Voting', 
                'No defaults', 
                `Added ${defaultReactions.length} default reactions`
            );

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Default Reactions Added')
                .setDescription('Successfully added default reaction emojis:')
                .addFields([
                    {
                        name: 'Added Reactions',
                        value: defaultReactions.map(r => `${r.emoji} → ${r.point_value > 0 ? '+' : ''}${r.point_value} points`).join('\n'),
                        inline: false
                    }
                ])
                .setFooter({ text: 'You can now edit or remove these reactions as needed.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_reactions')
                        .setLabel('← Back to Reactions')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error setting up default reactions:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error setting up default reactions. Some may have been added already.',
                components: []
            });
        }
    },

    async showClearAllReactionsConfirmation(interaction, serverConfig) {
        const embed = new EmbedBuilder()
            .setColor('#ff6b6b')
            .setTitle('⚠️ Clear All Custom Reactions')
            .setDescription('Are you sure you want to remove **ALL** custom reaction configurations?\n\n**This action cannot be undone!**')
            .addFields([
                {
                    name: '⚠️ Warning',
                    value: 'This will permanently delete all custom emoji-to-point mappings for this server.',
                    inline: false
                }
            ]);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_reactions_confirm_clear')
                    .setLabel('🗑️ Yes, Clear All')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('config_reactions_cancel_clear')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
    },

    async clearAllReactions(interaction, serverConfig) {
        try {
            const serverId = interaction.guild.id;
            const customReactions = await DatabaseUtils.getCustomReactions(serverId);
            const reactionCount = customReactions.length;
            
            // Clear all custom reactions
            await DatabaseUtils.clearCustomReactions(serverId);
            
            // Log the configuration change
            await this.logConfigChange(interaction, 'Reaction Voting', 
                `${reactionCount} custom reactions`, 
                'All reactions cleared'
            );
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ All Reactions Cleared')
                .setDescription(`Successfully removed all ${reactionCount} custom reaction configurations.`)
                .setFooter({ text: 'You can add new reactions anytime.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_reactions')
                        .setLabel('← Back to Reactions')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error clearing reactions:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error clearing reactions. Please try again.',
                components: []
            });
        }
    },

    async removeReaction(interaction, serverConfig, emoji) {
        try {
            const removed = await DatabaseUtils.removeCustomReaction(interaction.guild.id, emoji);
            
            if (removed) {
                // Log the configuration change
                await this.logConfigChange(interaction, 'Reaction Voting', 
                    `Custom reaction ${emoji}`, 
                    'Removed from configuration'
                );
                
                const successEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Reaction Removed Successfully!')
                    .setDescription(`**${emoji}** is no longer configured for reaction point awards`)
                    .addFields([
                        {
                            name: '🎉 All Set!',
                            value: 'Users can still react with this emoji, but no points will be awarded.',
                            inline: false
                        }
                    ]);

                const successRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('config_reactions')
                            .setLabel('← Back to Reactions')
                            .setStyle(ButtonStyle.Primary)
                    );

                await interaction.update({ embeds: [successEmbed], components: [successRow] });
            } else {
                await interaction.update({
                    content: `❌ Reaction ${emoji} was not found in the configuration.`,
                    embeds: [],
                    components: []
                });
            }
        } catch (error) {
            logger.errorWithStack('Error removing reaction', error, 'REACTIONS');
            await interaction.update({
                content: '❌ Error removing reaction. Please try again.',
                embeds: [],
                components: []
            });
        }
    }
};
