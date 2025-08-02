const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../utils/database');
const AuditLogger = require('../utils/logging');
const { supabase } = require('../config/database');
const { handleServerSettingsChange } = require('../events/syncHandler');
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
                    value: `Mode: ${serverConfig.threshold_mode === 'formula' ? 'Formula-based' : 'Fixed'}${serverConfig.threshold_mode === 'fixed' ? ` (${serverConfig.threshold} votes)` : ` (base: ${serverConfig.formula_base}, mult: ${serverConfig.formula_multiplier}x)`}\nTimeout: ${serverConfig.voting_timeout} minutes`, 
                    inline: true 
                },
                { 
                    name: '📊 Point Settings', 
                    value: `Range: ${serverConfig.min_points_per_award} to ${serverConfig.max_points_per_award}\nDaily Limit: ${serverConfig.daily_point_limit || 'None'}\nCooldown: ${serverConfig.user_cooldown_minutes} min`, 
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
                    value: `Status: ${serverConfig.is_active ? '✅ Active' : '❌ Inactive'}\nLog Channel: ${serverConfig.log_channel ? 'Set' : 'None'}`, 
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
                    .setDisabled(isInSyncButNotPriority)
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
            .setDescription('Configure point limits and restrictions')
            .addFields([
                { name: 'Point Range', value: `${serverConfig.min_points_per_award} to ${serverConfig.max_points_per_award}`, inline: true },
                { name: 'Daily Limit', value: serverConfig.daily_point_limit ? `${serverConfig.daily_point_limit} points` : 'No limit', inline: true },
                { name: 'User Cooldown', value: `${serverConfig.user_cooldown_minutes} minutes`, inline: true }
            ])
            .setFooter({ text: 'Configure point limits and cooldowns' });

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

        const row3 = new ActionRowBuilder()
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

        const row4 = new ActionRowBuilder()
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

        await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2, row3, row4] });
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
                await this.showAddReactionModal(interaction);
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
                if (value === 'custom') {
                    await this.showCustomThresholdModal(interaction);
                } else {
                    await this.updateServerConfig(serverId, { threshold: parseInt(value) });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showVotingConfig(interaction, updatedConfig);
                }
            } else if (interaction.customId === 'config_timeout_select') {
                const value = interaction.values[0];
                if (value === 'custom') {
                    await this.showCustomTimeoutModal(interaction);
                } else {
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
                if (value === 'custom') {
                    await this.showCustomFormulaBaseModal(interaction);
                } else {
                    await this.updateServerConfig(serverId, { formula_base: parseInt(value) });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showVotingConfig(interaction, updatedConfig);
                }
            } else if (interaction.customId === 'config_formula_multiplier_select') {
                const value = interaction.values[0];
                if (value === 'custom') {
                    await this.showCustomFormulaMultiplierModal(interaction);
                } else {
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
                if (value === 'custom') {
                    await this.showCustomPointRangeModal(interaction);
                } else {
                    const range = parseInt(value);
                    await this.updateServerConfig(serverId, { 
                        min_points_per_award: -range, 
                        max_points_per_award: range 
                    });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showPointsConfig(interaction, updatedConfig);
                }
            } else if (interaction.customId === 'config_daily_limit_select') {
                const value = interaction.values[0];
                if (value === 'custom') {
                    await this.showCustomDailyLimitModal(interaction);
                } else if (value === 'none') {
                    await this.updateServerConfig(serverId, { daily_point_limit: null });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showPointsConfig(interaction, updatedConfig);
                } else {
                    await this.updateServerConfig(serverId, { daily_point_limit: parseInt(value) });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showPointsConfig(interaction, updatedConfig);
                }
            } else if (interaction.customId === 'config_cooldown_select') {
                const value = interaction.values[0];
                if (value === 'custom') {
                    await this.showCustomCooldownModal(interaction);
                } else {
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
                if (value === 'custom') {
                    await this.showCustomLogChannelModal(interaction);
                } else if (value === 'none') {
                    await this.updateServerConfig(serverId, { log_channel: null });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showAdvancedConfig(interaction, updatedConfig);
                } else if (value === 'current') {
                    await this.updateServerConfig(serverId, { log_channel: interaction.channel.id });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showAdvancedConfig(interaction, updatedConfig);
                }
            }
            
            // Handle appearance updates
            else if (interaction.customId === 'config_color_select') {
                const value = interaction.values[0];
                if (value === 'custom') {
                    await this.showCustomColorModal(interaction);
                } else {
                    await this.updateServerConfig(serverId, { embed_color: value });
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showAppearanceConfig(interaction, updatedConfig);
                }
            }
            
            // Handle reaction-based voting configuration
            else if (interaction.customId === 'config_reactions_add') {
                await this.showAddReactionModal(interaction);
            } else if (interaction.customId === 'config_reactions_edit') {
                await this.showEditReactionSelect(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions_remove') {
                await this.showRemoveReactionSelect(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions_defaults') {
                await this.setupDefaultReactions(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions_clear') {
                await this.showClearAllReactionsConfirmation(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions_confirm_clear') {
                await this.clearAllReactions(interaction, serverConfig);
            } else if (interaction.customId === 'config_reactions_cancel_clear') {
                await this.showReactionConfig(interaction, serverConfig);
            
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
            
            // Handle reaction config select menus (non-modal interactions)
            else if (interaction.customId === 'config_reaction_remove_select') {
                const reactionId = interaction.values[0];
                await this.removeReaction(interaction, serverConfig, reactionId);
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
            } else if (interaction.customId === 'config_add_reaction_modal') {
                const emojiValue = interaction.fields.getTextInputValue('reaction_emoji_input').trim();
                const pointsValue = interaction.fields.getTextInputValue('reaction_points_input').trim();
                
                // Validate point value
                const points = parseInt(pointsValue.replace(/[^-\d]/g, ''));
                if (isNaN(points) || points === 0 || points < -10 || points > 10) {
                    await interaction.reply({
                        content: '❌ Invalid point value. Please enter a number between -10 and 10 (excluding 0).',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                try {
                    // Add the custom reaction
                    await DatabaseUtils.addCustomReaction(serverId, emojiValue, points);
                    
                    // Log the configuration change
                    await this.logConfigChange(interaction, 'Reaction Voting', 
                        'New reaction', 
                        `${emojiValue} → ${points > 0 ? '+' : ''}${points} points`
                    );
                    
                    // Update the original message directly (no ephemeral confirmation)
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showReactionConfig(interaction, updatedConfig);
                    
                } catch (error) {
                    logger.errorWithStack('Error adding custom reaction', error, 'MODAL');
                    await interaction.reply({
                        content: '❌ Error adding custom reaction. The emoji may already be configured or invalid.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            } else if (interaction.customId === 'config_edit_reaction_modal') {
                const reactionId = interaction.fields.getTextInputValue('reaction_id_input');
                const pointsValue = interaction.fields.getTextInputValue('reaction_edit_points_input').trim();
                
                // Validate point value
                const points = parseInt(pointsValue.replace(/[^-\d]/g, ''));
                if (isNaN(points) || points === 0 || points < -10 || points > 10) {
                    await interaction.reply({
                        content: '❌ Invalid point value. Please enter a number between -10 and 10 (excluding 0).',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                try {
                    // Update the custom reaction
                    await DatabaseUtils.updateCustomReaction(reactionId, points);
                    
                    // Log the configuration change
                    await this.logConfigChange(interaction, 'Reaction Voting', 
                        'Reaction updated', 
                        `New point value: ${points > 0 ? '+' : ''}${points} points`
                    );
                    
                    // Update the original message directly (no ephemeral confirmation)
                    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
                    await this.showReactionConfig(interaction, updatedConfig);
                    
                } catch (error) {
                    logger.errorWithStack('Error updating custom reaction', error, 'MODAL');
                    await interaction.reply({
                        content: '❌ Error updating custom reaction. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
        } catch (error) {
            logger.errorWithStack('Error handling modal submit', error, 'MODAL');
            await interaction.reply({
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
                        .setLabel('🔄 Setup Defaults')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('config_reactions_clear')
                        .setLabel('🧹 Clear All')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(customReactions.length === 0),
                    new ButtonBuilder()
                        .setCustomId('config_main')
                        .setLabel('← Back to Main')
                        .setStyle(ButtonStyle.Primary)
                );

            await this.updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
        } catch (error) {
            console.error('Error showing reaction config:', error);
            await this.updateInteraction(interaction, {
                content: '❌ Error loading reaction configuration. Please try again.',
                components: []
            });
        }
    },

    // ================================
    // REACTION CONFIG MODAL METHODS
    // ================================

    async showAddReactionModal(interaction) {
        try {
            logger.config(`Showing add reaction modal for ${interaction.user.tag}`, 'MODAL');
            
            const modal = new ModalBuilder()
                .setCustomId('config_add_reaction_modal')
                .setTitle('Add Custom Reaction');

            const emojiInput = new TextInputBuilder()
                .setCustomId('reaction_emoji_input')
                .setLabel('Emoji')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter emoji (e.g., 👍, :custom_emoji:, <:name:id>)')
                .setMinLength(1)
                .setMaxLength(100)
                .setRequired(true);

            const pointsInput = new TextInputBuilder()
                .setCustomId('reaction_points_input')
                .setLabel('Point Value')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter point value (e.g., +5, -2)')
                .setMinLength(1)
                .setMaxLength(4)
                .setRequired(true);

            const row1 = new ActionRowBuilder().addComponents(emojiInput);
            const row2 = new ActionRowBuilder().addComponents(pointsInput);
            modal.addComponents(row1, row2);

            await interaction.showModal(modal);
            logger.config(`Add reaction modal displayed successfully`, 'MODAL');
        } catch (error) {
            logger.errorWithStack('Error showing add reaction modal', error, 'MODAL');
            // If we can't show the modal, try to send an error message
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ There was an error showing the modal. Please try again.',
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.followUp({
                    content: '❌ There was an error showing the modal. Please try again.',
                    flags: MessageFlags.Ephemeral
                });
            }
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
    }
};
