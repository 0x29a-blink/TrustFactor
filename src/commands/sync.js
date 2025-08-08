const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { supabase } = require('../config/database');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Manage server synchronization with other servers')
        .addSubcommand(subcommand =>
            subcommand
                .setName('request')
                .setDescription('Generate a sync code for other servers to join your sync group')
                .addStringOption(option =>
                    option
                        .setName('group-name')
                        .setDescription('Name for the sync group')
                        .setRequired(true)
                        .setMaxLength(100)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('confirm')
                .setDescription('Join a sync group using a code from another server')
                .addStringOption(option =>
                    option
                        .setName('code')
                        .setDescription('8-character sync code from another server')
                        .setRequired(true)
                        .setMinLength(8)
                        .setMaxLength(8)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leave')
                .setDescription('Leave your current sync group')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current sync group and member servers')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-servers')
                .setDescription('List all servers in your sync group')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-priority')
                .setDescription('Set which server\'s settings take priority (admin only)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disband')
                .setDescription('Completely delete the sync group (creator only)')
        ),

    // Handle component interactions for sync command
    async handleComponentInteraction(interaction) {
        logger.sync(`Sync component interaction: ${interaction.customId} by ${interaction.user.tag}`, 'INTERACTION');
        logger.verbose(`Interaction type: ${interaction.type}, values: ${JSON.stringify(interaction.values)}`, 'INTERACTION');
        
        try {
            if (interaction.customId === 'sync_priority_select') {
            const serverId = String(interaction.guild.id);
            const userId = String(interaction.user.id);
            
            // Check if user has admin permissions
            const hasAdminPerms = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || 
                                 interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
            
            if (!hasAdminPerms) {
                logger.security(`Permission denied for sync priority select by ${interaction.user.tag}`, 'SYNC');
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Permission Denied')
                    .setDescription('You need Administrator or Manage Server permissions to set priority servers.');
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            await interaction.deferUpdate();

            const selectedServerId = interaction.values[0];

            // Get sync group info and check permissions
            const { data: membership } = await supabase
                .from('sync_group_members')
                .select('sync_code, sync_groups(group_name, created_by_server::text, priority_server::text)')
                .eq('server_id', String(serverId))
                .eq('is_active', true)
                .single();

            if (!membership) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('Could not find sync group membership.');
                return interaction.editReply({ embeds: [embed], components: [] });
            }

            // Check if this server can change priority (must be creator or current priority server)
            const isCreator = membership.sync_groups.created_by_server === String(serverId);
            const isPriorityServer = membership.sync_groups.priority_server === String(serverId);
            
            if (!isCreator && !isPriorityServer) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Permission Denied')
                    .setDescription('Only the sync group creator or current priority server can change the priority server.');
                return interaction.editReply({ embeds: [embed], components: [] });
            }

            // Update priority server
            await supabase
                .from('sync_groups')
                .update({ priority_server: String(selectedServerId) })
                .eq('sync_code', membership.sync_code);

            // Apply new priority settings
            await supabase.rpc('apply_priority_settings', { group_code: membership.sync_code });

            let priorityServerName;
            try {
                const guild = await interaction.client.guilds.fetch(selectedServerId);
                priorityServerName = guild.name;
            } catch (error) {
                priorityServerName = `Server ${selectedServerId}`;
            }

            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Priority Server Updated')
                .setDescription(`**${priorityServerName}** is now the priority server for **${membership.sync_groups.group_name}**.

All member servers have been updated with the new priority settings.`)
                .setFooter({ text: 'Settings synchronization complete.' });

            await interaction.editReply({ embeds: [successEmbed], components: [] });
        }
        
        // Handle priority selection when owner is leaving
        else if (interaction.customId === 'sync_leave_priority_select') {
            const serverId = String(interaction.guild.id);
            const userId = String(interaction.user.id);
            
            // Check if user has admin permissions
            const hasAdminPerms = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || 
                                 interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
            
            if (!hasAdminPerms) {
                logger.security(`Permission denied for sync leave priority select by ${interaction.user.tag}`, 'SYNC');
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Permission Denied')
                    .setDescription('You need Administrator or Manage Server permissions to leave sync groups.');
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            await interaction.deferUpdate();

            const selectedServerId = interaction.values[0];

            // Get sync group info
            const { data: membership } = await supabase
                .from('sync_group_members')
                .select('sync_code, sync_groups(group_name, created_by_server::text, priority_server::text)')
                .eq('server_id', String(serverId))
                .eq('is_active', true)
                .single();

            if (!membership) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('Could not find sync group membership.');
                return interaction.editReply({ embeds: [embed], components: [] });
            }

            // Update priority server
            await supabase
                .from('sync_groups')
                .update({ priority_server: String(selectedServerId) })
                .eq('sync_code', membership.sync_code);

            // Apply new priority settings
            await supabase.rpc('apply_priority_settings', { group_code: membership.sync_code });

            // Remove current server from group and restore settings
            await supabase
                .from('sync_group_members')
                .update({ is_active: false })
                .eq('sync_code', membership.sync_code)
                .eq('server_id', String(serverId));

            await supabase.rpc('restore_server_settings', { target_server_id: serverId });

            // Update server's sync_group field
            await supabase
                .from('servers')
                .update({ sync_group: null })
                .eq('server_id', String(serverId));

            let newPriorityServerName;
            try {
                const guild = await interaction.client.guilds.fetch(selectedServerId);
                newPriorityServerName = guild.name;
            } catch (error) {
                newPriorityServerName = `Server ${selectedServerId}`;
            }

            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Left Sync Group')
                .setDescription(`Successfully left sync group **${membership.sync_groups.group_name}**.\n\n**${newPriorityServerName}** is now the priority server and all remaining members have been updated with their settings.`)
                .setFooter({ text: 'Your original server settings have been restored.' });

            return interaction.editReply({ embeds: [successEmbed], components: [] });
        }
        
        // Handle disband confirmation
        else if (interaction.customId === 'confirm_disband') {
            const serverId = String(interaction.guild.id);
            const userId = String(interaction.user.id);
            
            // Check if user has admin permissions
            const hasAdminPerms = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || 
                                 interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
            
            if (!hasAdminPerms) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Permission Denied')
                    .setDescription('You need Administrator or Manage Server permissions to disband sync groups.');
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            await interaction.deferUpdate();

            // Get sync group info
            const { data: membership } = await supabase
                .from('sync_group_members')
                .select('sync_code, sync_groups(group_name, created_by_server::text)')
                .eq('server_id', String(serverId))
                .eq('is_active', true)
                .single();

            if (!membership) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('Could not find sync group membership.');
                return interaction.editReply({ embeds: [embed], components: [] });
            }

            // Check if this server is the creator
            const isCreator = membership.sync_groups.created_by_server === String(serverId);
            
            if (!isCreator) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Permission Denied')
                    .setDescription('Only the sync group creator can disband the group.');
                return interaction.editReply({ embeds: [embed], components: [] });
            }

            // Get all members to restore their settings
            const { data: members } = await supabase
                .from('sync_group_members')
                .select('server_id::text')
                .eq('sync_code', membership.sync_code)
                .eq('is_active', true);

            // Restore settings for all members
            for (const member of members) {
                await supabase.rpc('restore_server_settings', { target_server_id: member.server_id });
                
                // Update server's sync_group field
                await supabase
                    .from('servers')
                    .update({ sync_group: null })
                    .eq('server_id', String(member.server_id));
            }

            // Deactivate all members
            await supabase
                .from('sync_group_members')
                .update({ is_active: false })
                .eq('sync_code', membership.sync_code);

            // Deactivate the sync group
            await supabase
                .from('sync_groups')
                .update({ is_active: false })
                .eq('sync_code', membership.sync_code);

            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Sync Group Disbanded')
                .setDescription(`Successfully disbanded sync group **${membership.sync_groups.group_name}**.\n\nAll ${members.length} member servers have had their original settings restored.`)
                .setFooter({ text: 'The sync group has been completely deleted.' });

            return interaction.editReply({ embeds: [successEmbed], components: [] });
        }
        
        // Handle cancel leave/disband
        else if (interaction.customId === 'cancel_leave' || interaction.customId === 'cancel_disband') {
            await interaction.deferUpdate();
            
            const cancelEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('✅ Cancelled')
                .setDescription('Operation cancelled.');
            
            return interaction.editReply({ embeds: [cancelEmbed], components: [] });
        }
        
        // Handle confirm dissolve (when last member leaves)
        else if (interaction.customId === 'confirm_dissolve') {
            const serverId = String(interaction.guild.id);
            const userId = String(interaction.user.id);
            
            // Check if user has admin permissions
            const hasAdminPerms = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || 
                                 interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
            
            if (!hasAdminPerms) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Permission Denied')
                    .setDescription('You need Administrator or Manage Server permissions to leave sync groups.');
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            await interaction.deferUpdate();

            // Get sync group info
            const { data: membership } = await supabase
                .from('sync_group_members')
                .select('sync_code, sync_groups(group_name)')
                .eq('server_id', String(serverId))
                .eq('is_active', true)
                .single();

            if (!membership) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('Could not find sync group membership.');
                return interaction.editReply({ embeds: [embed], components: [] });
            }

            // Restore server settings
            await supabase.rpc('restore_server_settings', { target_server_id: serverId });

            // Remove server from sync group
            await supabase
                .from('sync_group_members')
                .update({ is_active: false })
                .eq('sync_code', membership.sync_code)
                .eq('server_id', String(serverId));

            // Update server's sync_group field
            await supabase
                .from('servers')
                .update({ sync_group: null })
                .eq('server_id', String(serverId));

            // Deactivate the sync group
            await supabase
                .from('sync_groups')
                .update({ is_active: false })
                .eq('sync_code', membership.sync_code);

            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Left Sync Group')
                .setDescription(`Successfully left sync group **${membership.sync_groups.group_name}**. Since you were the last member, the group has been dissolved.`)
                .setFooter({ text: 'Your original server settings have been restored.' });

            return interaction.editReply({ embeds: [successEmbed], components: [] });
        }
        
        // Handle confirm transfer (when creator transfers ownership)
        else if (interaction.customId === 'confirm_transfer') {
            const serverId = String(interaction.guild.id);
            const userId = String(interaction.user.id);
            
            // Check if user has admin permissions
            const hasAdminPerms = interaction.member.permissions.has('Administrator') || 
                                 interaction.member.permissions.has('ManageGuild');
            
            if (!hasAdminPerms) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Permission Denied')
                    .setDescription('You need Administrator or Manage Server permissions to leave sync groups.');
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            await interaction.deferUpdate();

            // Get sync group info
            const { data: membership } = await supabase
                .from('sync_group_members')
                .select('sync_code, sync_groups(group_name, created_by_server::text)')
                .eq('server_id', String(serverId))
                .eq('is_active', true)
                .single();

            if (!membership) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('Could not find sync group membership.');
                return interaction.editReply({ embeds: [embed], components: [] });
            }

            // Check if this server is the creator
            const isCreator = membership.sync_groups.created_by_server === String(serverId);
            
            if (!isCreator) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Permission Denied')
                    .setDescription('Only the sync group creator can transfer ownership.');
                return interaction.editReply({ embeds: [embed], components: [] });
            }

            // Get other members
            const { data: otherMembers } = await supabase
                .from('sync_group_members')
                .select('server_id::text')
                .eq('sync_code', membership.sync_code)
                .eq('is_active', true)
                .neq('server_id', String(serverId));

            if (otherMembers.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('No other members found to transfer ownership to.');
                return interaction.editReply({ embeds: [embed], components: [] });
            }

            // Transfer ownership to the first remaining member
            const newCreator = otherMembers[0].server_id;
            
            // Update sync group
            await supabase
                .from('sync_groups')
                .update({ 
                    created_by_server: String(newCreator),
                    priority_server: String(newCreator) 
                })
                .eq('sync_code', membership.sync_code);

            // Apply new priority settings
            await supabase.rpc('apply_priority_settings', { group_code: membership.sync_code });

            // Remove current server from group and restore settings
            await supabase
                .from('sync_group_members')
                .update({ is_active: false })
                .eq('sync_code', membership.sync_code)
                .eq('server_id', String(serverId));

            await supabase.rpc('restore_server_settings', { target_server_id: serverId });

            // Update server's sync_group field
            await supabase
                .from('servers')
                .update({ sync_group: null })
                .eq('server_id', String(serverId));

            let newCreatorName;
            try {
                const guild = await interaction.client.guilds.fetch(newCreator);
                newCreatorName = guild.name;
            } catch (error) {
                newCreatorName = `Server ${newCreator}`;
            }

            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Left Sync Group')
                .setDescription(`Successfully left sync group **${membership.sync_groups.group_name}**.\n\n**${newCreatorName}** is now the owner and priority server.`)
                .setFooter({ text: 'Your original server settings have been restored.' });

            return interaction.editReply({ embeds: [successEmbed], components: [] });
        }
        } catch (error) {
            logger.errorWithStack('Error handling sync component interaction', error, 'SYNC');
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the sync interaction. Please try again later.');
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const serverId = String(interaction.guild.id);
        const userId = String(interaction.user.id);

        // Check if user has admin permissions
        const hasAdminPerms = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || 
                             interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

        try {
            switch (subcommand) {
                case 'request':
                    await handleSyncRequest(interaction, serverId, userId, hasAdminPerms);
                    break;
                case 'confirm':
                    await handleSyncConfirm(interaction, serverId, userId, hasAdminPerms);
                    break;
                case 'leave':
                    await handleSyncLeave(interaction, serverId, userId, hasAdminPerms);
                    break;
                case 'status':
                    await handleSyncStatus(interaction, serverId);
                    break;
                case 'list-servers':
                    await handleListServers(interaction, serverId);
                    break;
                case 'set-priority':
                    await handleSetPriority(interaction, serverId, userId, hasAdminPerms);
                    break;
                case 'disband':
                    await handleSyncDisband(interaction, serverId, userId, hasAdminPerms);
                    break;
            }
        } catch (error) {
            logger.errorWithStack('Error in sync command', error, 'SYNC');
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the sync command. Please try again later.');
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};

async function handleSyncRequest(interaction, serverId, userId, hasAdminPerms) {
    if (!hasAdminPerms) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Permission Denied')
            .setDescription('You need Administrator or Manage Server permissions to create sync groups.');
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    const groupName = interaction.options.getString('group-name');

    // Check if server is already in a sync group
    const { data: existingGroup } = await supabase
        .from('sync_group_members')
        .select('sync_code, sync_groups(group_name)')
        .eq('server_id', String(serverId))
        .eq('is_active', true)
        .single();

    if (existingGroup) {
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('⚠️ Already in Sync Group')
            .setDescription(`This server is already part of the sync group: **${existingGroup.sync_groups.group_name}**\n\nUse \`/sync leave\` first if you want to create a new group.`);
        return interaction.editReply({ embeds: [embed] });
    }

    // Generate sync code
    const { data: syncCode } = await supabase.rpc('generate_sync_code');

    // Create sync group
    const { data: newGroup, error: insertError } = await supabase
        .from('sync_groups')
        .insert({
            sync_code: syncCode,
            group_name: groupName,
            created_by_server: String(serverId),
            priority_server: String(serverId) // Creator server starts as priority
        })
        .select()
        .single();

    if (insertError) throw insertError;

    // Backup current server settings
    await supabase.rpc('backup_server_settings', { target_server_id: String(serverId) });

    // Add creator server to group
    const { error: memberError } = await supabase
        .from('sync_group_members')
        .insert({
            sync_code: syncCode,
            server_id: String(serverId)
        });

    if (memberError) throw memberError;

    // Update server's sync_group field
    await supabase
        .from('servers')
        .update({ sync_group: syncCode })
        .eq('server_id', String(serverId));

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Sync Group Created')
        .setDescription(`Successfully created sync group: **${groupName}**`)
        .addFields(
            { name: 'Sync Code', value: `\`${syncCode}\``, inline: true },
            { name: 'Priority Server', value: interaction.guild.name, inline: true },
            { name: 'Share This Code', value: 'Other servers can join using `/sync confirm ' + syncCode + '`', inline: false }
        )
        .setFooter({ text: 'Your server settings have been backed up and you are now the priority server.' });

    await interaction.editReply({ embeds: [embed] });
}

async function handleSyncConfirm(interaction, serverId, userId, hasAdminPerms) {
    if (!hasAdminPerms) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Permission Denied')
            .setDescription('You need Administrator or Manage Server permissions to join sync groups.');
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const syncCode = interaction.options.getString('code').toUpperCase();

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    // Check if sync group exists and is active
    const { data: syncGroup, error: groupError } = await supabase
        .from('sync_groups')
        .select('group_name, created_by_server::text, priority_server::text')
        .eq('sync_code', syncCode)
        .eq('is_active', true)
        .single();

    if (groupError || !syncGroup) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Sync Code')
            .setDescription('The provided sync code is invalid or the sync group is no longer active.');
        return interaction.editReply({ embeds: [embed] });
    }

    // Check if server is already in a sync group
    const { data: existingMembership } = await supabase
        .from('sync_group_members')
        .select('sync_code, sync_groups(group_name)')
        .eq('server_id', String(serverId))
        .eq('is_active', true)
        .single();

    if (existingMembership) {
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('⚠️ Already in Sync Group')
            .setDescription(`This server is already part of sync group: **${existingMembership.sync_groups.group_name}**\n\nUse \`/sync leave\` first if you want to join a different group.`);
        return interaction.editReply({ embeds: [embed] });
    }

    // Check if server is trying to join its own group
    // Only prevent if they are currently the active creator
    if (syncGroup.created_by_server === serverId) {
        // Check if this server is currently an active member
        const { data: activeMembership } = await supabase
            .from('sync_group_members')
            .select('is_active')
            .eq('sync_code', syncCode)
            .eq('server_id', String(serverId))
            .eq('is_active', true)
            .single();

        if (activeMembership) {
            const embed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle('⚠️ Cannot Join Own Group')
                .setDescription('You cannot join a sync group that this server created while you are still the active creator.');
            return interaction.editReply({ embeds: [embed] });
        }
    }

    // Backup current server settings
    await supabase.rpc('backup_server_settings', { target_server_id: serverId });

    // Add server to sync group (or reactivate if exists)
    const { error: memberError } = await supabase
        .from('sync_group_members')
        .upsert({
            sync_code: syncCode,
            server_id: String(serverId),
            is_active: true,
            joined_at: new Date().toISOString()
        }, {
            onConflict: 'sync_code,server_id'
        });

    if (memberError) throw memberError;

    // Update server's sync_group field
    await supabase
        .from('servers')
        .update({ sync_group: syncCode })
        .eq('server_id', String(serverId));

    // Apply priority server settings
    await supabase.rpc('apply_priority_settings', { group_code: syncCode });

    // Get priority server info
    const { data: priorityServer } = await supabase
        .from('sync_groups')
        .select('priority_server')
        .eq('sync_code', syncCode)
        .single();

    // Get creator guild name
    let creatorGuildName;
    try {
        const creatorGuild = await interaction.client.guilds.fetch(syncGroup.created_by_server);
        creatorGuildName = creatorGuild.name;
    } catch (error) {
        creatorGuildName = `Server ${syncGroup.created_by_server}`;
    }

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Joined Sync Group')
        .setDescription(`Successfully joined sync group: **${syncGroup.group_name}**`)
        .addFields(
            { name: 'Sync Code', value: `\`${syncCode}\``, inline: true },
            { name: 'Group Creator', value: creatorGuildName, inline: true }
        )
        .setFooter({ text: 'Your original settings have been backed up. Settings are now synced with the priority server.' });

    await interaction.editReply({ embeds: [embed] });
}

async function handleSyncLeave(interaction, serverId, userId, hasAdminPerms) {
    if (!hasAdminPerms) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Permission Denied')
            .setDescription('You need Administrator or Manage Server permissions to leave sync groups.');
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    // Check if server is in a sync group
    const { data: membership } = await supabase
        .from('sync_group_members')
        .select('sync_code, sync_groups(group_name, created_by_server::text, priority_server::text)')
        .eq('server_id', String(serverId))
        .eq('is_active', true)
        .single();

    if (!membership) {
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('⚠️ Not in Sync Group')
            .setDescription('This server is not currently part of any sync group.');
        return interaction.editReply({ embeds: [embed] });
    }

    const syncCode = membership.sync_code;
    const groupName = membership.sync_groups.group_name;
    const isCreator = membership.sync_groups.created_by_server === String(serverId);
    const isPriorityServer = membership.sync_groups.priority_server === String(serverId);

    // Get other active members
    const { data: otherMembers } = await supabase
        .from('sync_group_members')
        .select('server_id::text')
        .eq('sync_code', syncCode)
        .eq('is_active', true)
        .neq('server_id', String(serverId));

    // If this is the priority server (owner or not), show priority transfer prompt
    if (isPriorityServer) {
        if (otherMembers.length === 0) {
            // No other members, show disband option
            const confirmEmbed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle('⚠️ Disband Sync Group')
                .setDescription(`You are the priority server for **${groupName}**. Since there are no other members, leaving will **dissolve the entire group**.\n\nAre you sure you want to continue?`)
                .setFooter({ text: 'This action cannot be undone.' });

            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_dissolve')
                .setLabel('Yes, Dissolve Group')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_leave')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
            const response = await interaction.editReply({ embeds: [confirmEmbed], components: [row] });

            try {
                const confirmation = await response.awaitMessageComponent({
                    componentType: ComponentType.Button,
                    time: 30000,
                    filter: i => i.user.id === userId
                });

                if (confirmation.customId === 'cancel_leave') {
                    const cancelEmbed = new EmbedBuilder()
                        .setColor('#0099FF')
                        .setTitle('✅ Cancelled')
                        .setDescription('Sync group leave operation cancelled.');
                    return confirmation.update({ embeds: [cancelEmbed], components: [] });
                }

                await confirmation.deferUpdate();
            } catch (error) {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⏰ Timeout')
                    .setDescription('Confirmation timed out. Sync group leave operation cancelled.');
                return interaction.editReply({ embeds: [timeoutEmbed], components: [] });
            }
        } else if (otherMembers.length === 1) {
            // Only one other member, automatically transfer priority
            const newPriorityServerId = otherMembers[0].server_id;
            
            // Update priority server
            await supabase
                .from('sync_groups')
                .update({ priority_server: String(newPriorityServerId) })
                .eq('sync_code', syncCode);

            // Apply new priority settings
            await supabase.rpc('apply_priority_settings', { group_code: syncCode });

            // Remove current server from group and restore settings
            await supabase
                .from('sync_group_members')
                .update({ is_active: false })
                .eq('sync_code', syncCode)
                .eq('server_id', String(serverId));

            await supabase.rpc('restore_server_settings', { target_server_id: serverId });

            // Update server's sync_group field
            await supabase
                .from('servers')
                .update({ sync_group: null })
                .eq('server_id', String(serverId));

            let newPriorityServerName;
            try {
                const guild = await interaction.client.guilds.fetch(newPriorityServerId);
                newPriorityServerName = guild.name;
            } catch (error) {
                newPriorityServerName = `Server ${newPriorityServerId}`;
            }

            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Left Sync Group')
                .setDescription(`Successfully left sync group **${groupName}**.\n\n**${newPriorityServerName}** is now the priority server and all remaining members have been updated with their settings.`)
                .setFooter({ text: 'Your original server settings have been restored.' });

            return interaction.editReply({ embeds: [successEmbed] });
        } else {
            // Multiple other members, show priority server selection dropdown
            const options = [];
            for (const member of otherMembers) {
                let serverName;
                try {
                    const guild = await interaction.client.guilds.fetch(member.server_id);
                    serverName = guild ? guild.name : `Server ${member.server_id}`;
                } catch (error) {
                    serverName = `Server ${member.server_id}`;
                }

                if (serverName && member.server_id) {
                    options.push({
                        label: serverName.slice(0, 100),
                        value: String(member.server_id),
                        description: 'Will become new priority server',
                        emoji: '⭐'
                    });
                }
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('sync_leave_priority_select')
                .setPlaceholder('Select which server should become the new priority server')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle('⭐ Select New Priority Server')
                .setDescription(`You are the priority server for **${groupName}**. Before leaving, you must select which server will become the new priority server.\n\n**Note:** The selected server's settings will be applied to all remaining members.`)
                .setFooter({ text: 'This action cannot be undone.' });

            const response = await interaction.editReply({ embeds: [embed], components: [row] });

            try {
                const confirmation = await response.awaitMessageComponent({
                    componentType: ComponentType.StringSelect,
                    time: 60000,
                    filter: i => i.user.id === userId
                });

                const newPriorityServerId = confirmation.values[0];

                await confirmation.deferUpdate();

                // Update priority server
                await supabase
                    .from('sync_groups')
                    .update({ priority_server: String(newPriorityServerId) })
                    .eq('sync_code', syncCode);

                // Apply new priority settings
                await supabase.rpc('apply_priority_settings', { group_code: syncCode });

                // Remove current server from group and restore settings
                await supabase
                    .from('sync_group_members')
                    .update({ is_active: false })
                    .eq('sync_code', syncCode)
                    .eq('server_id', String(serverId));

                await supabase.rpc('restore_server_settings', { target_server_id: serverId });

                // Update server's sync_group field
                await supabase
                    .from('servers')
                    .update({ sync_group: null })
                    .eq('server_id', String(serverId));

                let newPriorityServerName;
                try {
                    const guild = await interaction.client.guilds.fetch(newPriorityServerId);
                    newPriorityServerName = guild.name;
                } catch (error) {
                    newPriorityServerName = `Server ${newPriorityServerId}`;
                }

                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Left Sync Group')
                    .setDescription(`Successfully left sync group **${groupName}**.\n\n**${newPriorityServerName}** is now the priority server and all remaining members have been updated with their settings.`)
                    .setFooter({ text: 'Your original server settings have been restored.' });

                return confirmation.editReply({ embeds: [successEmbed], components: [] });

            } catch (error) {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⏰ Selection Timeout')
                    .setDescription('Priority server selection timed out. Please run the command again.');

                return interaction.editReply({ embeds: [timeoutEmbed], components: [] });
            }
        }
    }

    // If this is the creator server (but not priority), show ownership transfer confirmation
    if (isCreator && !isPriorityServer) {
        if (otherMembers.length === 0) {
            // No remaining members, group will be dissolved
            const confirmEmbed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle('⚠️ Dissolve Sync Group')
                .setDescription(`You are the creator of sync group **${groupName}**. Since there are no other members, leaving will **dissolve the entire group**.\n\nAre you sure you want to continue?`)
                .setFooter({ text: 'This action cannot be undone.' });

            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_dissolve')
                .setLabel('Yes, Dissolve Group')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_leave')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
            const response = await interaction.editReply({ embeds: [confirmEmbed], components: [row] });

            try {
                const confirmation = await response.awaitMessageComponent({
                    componentType: ComponentType.Button,
                    time: 30000,
                    filter: i => i.user.id === userId
                });

                if (confirmation.customId === 'cancel_leave') {
                    const cancelEmbed = new EmbedBuilder()
                        .setColor('#0099FF')
                        .setTitle('✅ Cancelled')
                        .setDescription('Sync group leave operation cancelled.');
                    return confirmation.update({ embeds: [cancelEmbed], components: [] });
                }

                await confirmation.deferUpdate();
            } catch (error) {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⏰ Timeout')
                    .setDescription('Confirmation timed out. Sync group leave operation cancelled.');
                return interaction.editReply({ embeds: [timeoutEmbed], components: [] });
            }
        } else {
            // Show ownership transfer confirmation
            const newOwner = otherMembers[0].server_id;
            let newOwnerName;
            try {
                const newOwnerGuild = await interaction.client.guilds.fetch(newOwner);
                newOwnerName = newOwnerGuild.name;
            } catch (error) {
                newOwnerName = `Server ${newOwner}`;
            }

            const confirmEmbed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle('⚠️ Transfer Ownership')
                .setDescription(`You are the creator of sync group **${groupName}**. Leaving will transfer ownership to:\n\n**${newOwnerName}**\n\nThe new owner will become the priority server and gain full control of the sync group.\n\nAre you sure you want to continue?`)
                .setFooter({ text: 'This action cannot be undone.' });

            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_transfer')
                .setLabel('Yes, Transfer Ownership')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_leave')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
            const response = await interaction.editReply({ embeds: [confirmEmbed], components: [row] });

            try {
                const confirmation = await response.awaitMessageComponent({
                    componentType: ComponentType.Button,
                    time: 30000,
                    filter: i => i.user.id === userId
                });

                if (confirmation.customId === 'cancel_leave') {
                    const cancelEmbed = new EmbedBuilder()
                        .setColor('#0099FF')
                        .setTitle('✅ Cancelled')
                        .setDescription('Sync group leave operation cancelled.');
                    return confirmation.update({ embeds: [cancelEmbed], components: [] });
                }

                await confirmation.deferUpdate();
            } catch (error) {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⏰ Timeout')
                    .setDescription('Confirmation timed out. Sync group leave operation cancelled.');
                return interaction.editReply({ embeds: [timeoutEmbed], components: [] });
            }
        }
    }

    // Restore original server settings
    await supabase.rpc('restore_server_settings', { target_server_id: String(serverId) });

    // Remove server from sync group
    await supabase
        .from('sync_group_members')
        .update({ is_active: false })
        .eq('sync_code', syncCode)
        .eq('server_id', String(serverId));

    // Update server's sync_group field
    await supabase
        .from('servers')
        .update({ sync_group: null })
        .eq('server_id', String(serverId));

    // Handle group management based on leaving server's role
    if (isCreator) {
        // Check if there are other active members
        const { data: members, error: membersError } = await supabase
            .from('sync_group_members')
            .select('server_id::text, joined_at')
            .eq('sync_code', syncCode)
            .eq('is_active', true);

        if (members.length === 0) {
            // No remaining members, deactivate the group
            await supabase
                .from('sync_groups')
                .update({ is_active: false })
                .eq('sync_code', syncCode);
        } else {
            // Transfer ownership to the first remaining member
            const newCreator = members[0].server_id;
            await supabase
                .from('sync_groups')
                .update({ 
                    created_by_server: String(newCreator),
                    priority_server: String(newCreator) 
                })
                .eq('sync_code', syncCode);

            // Apply new priority settings
            await supabase.rpc('apply_priority_settings', { group_code: syncCode });
        }
    } else if (isPriorityServer) {
        // If this is the priority server (but not creator), need to select new priority
        const { data: members, error: membersError } = await supabase
            .from('sync_group_members')
            .select('server_id::text, joined_at')
            .eq('sync_code', syncCode)
            .eq('is_active', true);

        if (members.length > 0) {
            // Automatically assign priority to the first remaining member (creator if still in group)
            const newPriorityServer = members[0].server_id;
            await supabase
                .from('sync_groups')
                .update({ priority_server: String(newPriorityServer) })
                .eq('sync_code', syncCode);

            // Apply new priority settings
            await supabase.rpc('apply_priority_settings', { group_code: syncCode });
        }
    }

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Left Sync Group')
        .setDescription(`Successfully left sync group: **${groupName}**`)
        .setFooter({ text: 'Your original server settings have been restored.' });

    await interaction.editReply({ embeds: [embed] });
}

async function handleSyncStatus(interaction, serverId) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    // Get sync group info
    const { data: syncStatus, error: syncError } = await supabase
        .from('sync_group_members')
        .select(`
            sync_code,
            joined_at,
            sync_groups!inner (
                group_name,
                priority_server::text,
                created_by_server::text,
                created_at,
                is_active
            )
        `)
        .eq('server_id', String(serverId))
        .eq('is_active', true)
        .single();

    if (!syncStatus) {
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('📊 Sync Status')
            .setDescription('This server is not currently part of any sync group.')
            .addFields(
                { name: 'Available Commands', value: '• `/sync request` - Create a new sync group\n• `/sync confirm <code>` - Join an existing group', inline: false }
            );
        return interaction.editReply({ embeds: [embed] });
    }

    // Get member count
    const { data: members } = await supabase
        .from('sync_group_members')
        .select('server_id::text')
        .eq('sync_code', syncStatus.sync_code)
        .eq('is_active', true);

    const isCreator = syncStatus.sync_groups.created_by_server === String(serverId);
    const isPriority = syncStatus.sync_groups.priority_server === String(serverId);

    const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('📊 Sync Status')
        .setDescription(`**${syncStatus.sync_groups.group_name}**`)
        .addFields(
            { name: 'Sync Code', value: `\`${syncStatus.sync_code}\``, inline: true },
            { name: 'Member Count', value: `${members.length} servers`, inline: true },
            { name: 'Your Role', value: isCreator ? '👑 Creator' : '👥 Member', inline: true },
            { name: 'Priority Server', value: isPriority ? '⭐ This server' : '⭐ Another server', inline: true },
            { name: 'Joined', value: `<t:${Math.floor(new Date(syncStatus.joined_at).getTime() / 1000)}:R>`, inline: true },
            { name: 'Group Created', value: `<t:${Math.floor(new Date(syncStatus.sync_groups.created_at).getTime() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: 'Use /sync list-servers to see all members or /sync set-priority to change priority server.' });

    await interaction.editReply({ embeds: [embed] });
}

async function handleListServers(interaction, serverId) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    // Check if server is in a sync group
    const { data: membership } = await supabase
        .from('sync_group_members')
        .select('sync_code, sync_groups(group_name, priority_server)')
        .eq('server_id', String(serverId))
        .eq('is_active', true)
        .single();

    if (!membership) {
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('⚠️ Not in Sync Group')
            .setDescription('This server is not currently part of any sync group.');
        return interaction.editReply({ embeds: [embed] });
    }

    // Get all members
    const { data: members } = await supabase
        .from('sync_group_members')
        .select('server_id::text, joined_at')
        .eq('sync_code', membership.sync_code)
        .eq('is_active', true)
        .order('joined_at', { ascending: true });

    const priorityServerId = membership.sync_groups.priority_server;

    let serverList = '';
    for (const member of members) {
        const isPriority = member.server_id === priorityServerId;
        const isCurrent = member.server_id === String(serverId);
        
        let serverName;
        try {
            const guild = await interaction.client.guilds.fetch(member.server_id);
            serverName = guild.name;
        } catch (error) {
            serverName = `Server ${member.server_id}`;
        }

        const joinedTime = `<t:${Math.floor(new Date(member.joined_at).getTime() / 1000)}:R>`;
        const indicators = [];
        
        if (isPriority) indicators.push('⭐ Priority');
        if (isCurrent) indicators.push('📍 Current');
        
        const indicatorText = indicators.length > 0 ? ` (${indicators.join(', ')})` : '';
        serverList += `• **${serverName}**${indicatorText}\n  Joined: ${joinedTime}\n\n`;
    }

    const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('🌐 Sync Group Members')
        .setDescription(`**${membership.sync_groups.group_name}**\n\n${serverList}`)
        .setFooter({ text: `${members.length} servers total • Priority server's settings are applied to all members` });

    await interaction.editReply({ embeds: [embed] });
}

async function handleSetPriority(interaction, serverId, userId, hasAdminPerms) {
    if (!hasAdminPerms) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Permission Denied')
            .setDescription('You need Administrator or Manage Server permissions to set priority servers.');
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    // Check if server is in a sync group
    const { data: membership } = await supabase
        .from('sync_group_members')
        .select('sync_code, sync_groups(group_name, created_by_server::text, priority_server::text)')
        .eq('server_id', String(serverId))
        .eq('is_active', true)
        .single();

    if (!membership) {
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('⚠️ Not in Sync Group')
            .setDescription('This server is not currently part of any sync group.');
        return interaction.editReply({ embeds: [embed] });
    }

    // Check if this server can change priority (must be creator or current priority server)
    const isCreator = membership.sync_groups.created_by_server === String(serverId);
    const isPriorityServer = membership.sync_groups.priority_server === String(serverId);
    
    if (!isCreator && !isPriorityServer) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Permission Denied')
            .setDescription('Only the sync group creator or current priority server can change the priority server.');
        return interaction.editReply({ embeds: [embed] });
    }

    // Get all members for the dropdown
    const { data: members } = await supabase
        .from('sync_group_members')
        .select('server_id::text')
        .eq('sync_code', membership.sync_code)
        .eq('is_active', true);

    if (members.length <= 1) {
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('⚠️ Only One Member')
            .setDescription('Your sync group only has one member. Priority selection is only available with multiple servers.');
        return interaction.editReply({ embeds: [embed] });
    }

    // Create dropdown options
    const options = [];
    for (const member of members) {
        let serverName;
        try {
            const guild = await interaction.client.guilds.fetch(member.server_id);
            serverName = guild ? guild.name : `Server ${member.server_id}`;
        } catch (error) {
            serverName = `Server ${member.server_id}`;
        }

        // Validate option data before adding
        if (serverName && member.server_id) {
            options.push({
                label: serverName.slice(0, 100), // Discord limit is 100 characters
                value: String(member.server_id),
                description: member.server_id === String(serverId) ? 'This server' : 'Member server',
                emoji: member.server_id === String(serverId) ? '📍' : '🌐'
            });
        }
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('sync_priority_select')
        .setPlaceholder('Select which server should have priority settings')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('⭐ Set Priority Server')
        .setDescription(`Select which server's settings should be applied to all members of **${membership.sync_groups.group_name}**.\n\n**Note:** All servers will adopt the selected server's configuration settings.`)
        .setFooter({ text: 'This action will immediately sync all servers to the selected priority server.' });

    await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleSyncDisband(interaction, serverId, userId, hasAdminPerms) {
    if (!hasAdminPerms) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Permission Denied')
            .setDescription('You need Administrator or Manage Server permissions to disband sync groups.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    // Get sync group info
    const { data: membership } = await supabase
        .from('sync_group_members')
        .select('sync_code, sync_groups(group_name, created_by_server::text)')
        .eq('server_id', String(serverId))
        .eq('is_active', true)
        .single();

    if (!membership) {
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('⚠️ Not in Sync Group')
            .setDescription('This server is not currently part of any sync group.');
        return interaction.editReply({ embeds: [embed] });
    }

    // Check if this server is the creator
    const isCreator = membership.sync_groups.created_by_server === String(serverId);
    
    if (!isCreator) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Permission Denied')
            .setDescription('Only the sync group creator can disband the group.');
        return interaction.editReply({ embeds: [embed] });
    }

    const groupName = membership.sync_groups.group_name;

    const confirmEmbed = new EmbedBuilder()
        .setColor('#FF9900')
        .setTitle('⚠️ Disband Sync Group')
        .setDescription(`You are the creator of sync group **${groupName}**. Disbanding this group will **permanently delete all settings** for all member servers and **dissolve the group**.\n\nAre you sure you want to continue?`)
        .setFooter({ text: 'This action cannot be undone.' });

    const confirmButton = new ButtonBuilder()
        .setCustomId('confirm_disband')
        .setLabel('Yes, Disband Group')
        .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_disband')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
    const response = await interaction.editReply({ embeds: [confirmEmbed], components: [row] });

    try {
        const confirmation = await response.awaitMessageComponent({
            componentType: ComponentType.Button,
            time: 30000,
            filter: i => i.user.id === userId
        });

        if (confirmation.customId === 'cancel_disband') {
            const cancelEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('✅ Cancelled')
                .setDescription('Sync group disband operation cancelled.');
            return confirmation.update({ embeds: [cancelEmbed], components: [] });
        }

        await confirmation.deferUpdate();
    } catch (error) {
        const timeoutEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⏰ Timeout')
            .setDescription('Confirmation timed out. Sync group disband operation cancelled.');
        return interaction.editReply({ embeds: [timeoutEmbed], components: [] });
    }
}
