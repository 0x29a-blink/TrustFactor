const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../../../utils/database');
const { supabase } = require('../../../config/database');
const { updateInteraction } = require('../ui');
const { updateServerConfig, logConfigChange } = require('../services/configService');

async function showAutoRolesConfig(interaction, serverConfig) {
  const autoRoles = serverConfig.auto_role_thresholds || {};
  const roleEntries = Object.entries(autoRoles).sort(([a], [b]) => parseInt(a) - parseInt(b));

  const embed = new EmbedBuilder()
    .setColor(serverConfig.embed_color || '#5865F2')
    .setTitle('🏆 Auto Roles Configuration')
    .setDescription('Configure automatic role assignment based on point thresholds.\n\n**How it works:** When users reach specific point thresholds, they automatically receive the configured Discord roles.')
    .addFields([
      {
        name: 'Current Auto Roles',
        value:
          roleEntries.length > 0
            ? roleEntries
                .map(([threshold, roleId]) => {
                  const role = interaction.guild.roles.cache.get(roleId);
                  const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                  return `**${threshold} points:** ${roleName}`;
                })
                .join('\n')
            : '*No auto-roles configured yet*',
        inline: false,
      },
      {
        name: 'Configuration Options',
        value: '• **Add Role:** Set a new point threshold for a role\n• **Edit Threshold:** Modify existing point requirements\n• **Remove Role:** Delete an auto-role configuration\n• **Test Assignment:** Preview role assignments for current users',
        inline: false,
      },
    ])
    .setFooter({ text: 'Auto roles provide gamification and visual recognition for active members' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_autoroles_add').setLabel('➕ Add Role').setStyle(ButtonStyle.Success).setDisabled(roleEntries.length >= 10),
    new ButtonBuilder().setCustomId('config_autoroles_edit').setLabel('✏️ Edit Threshold').setStyle(ButtonStyle.Primary).setDisabled(roleEntries.length === 0),
    new ButtonBuilder().setCustomId('config_autoroles_remove').setLabel('🗑️ Remove Role').setStyle(ButtonStyle.Danger).setDisabled(roleEntries.length === 0),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_autoroles_test').setLabel('🧪 Test Assignment').setStyle(ButtonStyle.Secondary).setDisabled(roleEntries.length === 0),
    new ButtonBuilder().setCustomId('config_autoroles_clear_all').setLabel('🚨 Clear All').setStyle(ButtonStyle.Danger).setDisabled(roleEntries.length === 0),
    new ButtonBuilder().setCustomId('config_back_main').setLabel('← Back').setStyle(ButtonStyle.Primary),
  );

  await updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
}

function getAssignableRoles(guild) {
  const botMember = guild.members.me;
  if (!botMember) return [];
  const botHighestRole = botMember.roles.highest;
  return guild.roles.cache
    .filter((role) => {
      if (role.id === guild.id) return false;
      if (role.position >= botHighestRole.position) return false;
      if (role.managed) return false;
      if (!botMember.permissions.has('ManageRoles')) return false;
      return true;
    })
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ id: role.id, name: role.name, position: role.position, unicodeEmoji: role.unicodeEmoji }));
}

async function showAddAutoRoleModal(interaction) {
  const assignableRoles = getAssignableRoles(interaction.guild);
  if (assignableRoles.length === 0) {
    await interaction.followUp({ content: '❌ No assignable roles found. The bot needs roles below its highest role to assign them automatically.', flags: MessageFlags.Ephemeral });
    return;
  }

  const serverConfig = await DatabaseUtils.getServerConfig(interaction.guild.id);
  const configuredRoleIds = Object.values(serverConfig.auto_role_thresholds || {});
  const availableRoles = assignableRoles.filter((role) => !configuredRoleIds.includes(role.id));

  if (availableRoles.length === 0) {
    await interaction.reply({ content: '❌ All assignable roles are already configured for auto-assignment.', flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(serverConfig.embed_color || '#5865F2')
    .setTitle('➕ Add Auto Role')
    .setDescription('Select a role to configure for automatic assignment:')
    .addFields([
      { name: 'Available Roles', value: availableRoles.length > 0 ? availableRoles.slice(0, 10).map((role) => `• @${role.name}`).join('\n') : 'No available roles', inline: false },
      { name: 'Next Step', value: "After selecting a role, you'll set the point threshold required to receive it.", inline: false },
    ])
    .setFooter({ text: `${availableRoles.length} assignable role${availableRoles.length !== 1 ? 's' : ''} available` });

  const roleOptions = availableRoles.slice(0, 25).map((role) => ({ label: role.name, value: role.id, description: `Role position: ${role.position}`, emoji: role.unicodeEmoji || undefined }));

  const selectMenu = new StringSelectMenuBuilder().setCustomId('config_autorole_select_role').setPlaceholder('Select a role to configure...').addOptions(roleOptions);

  const row1 = new ActionRowBuilder().addComponents(selectMenu);
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_autoroles').setLabel('← Back').setStyle(ButtonStyle.Primary));

  await updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
}

async function showAutoRoleThresholdModal(interaction, roleId) {
  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    await interaction.followUp({ content: '❌ Role not found. Please try again.', flags: MessageFlags.Ephemeral });
    return;
  }
  const modal = new ModalBuilder().setCustomId('config_add_autorole_threshold_modal').setTitle(`Set Threshold for @${role.name}`);
  const thresholdInput = new TextInputBuilder().setCustomId('autorole_threshold_input').setLabel('Point Threshold').setStyle(TextInputStyle.Short).setPlaceholder('Enter point threshold (e.g., 100)').setMinLength(1).setMaxLength(6).setRequired(true);
  const roleIdInput = new TextInputBuilder().setCustomId('autorole_role_id_input').setLabel('Role ID (do not edit)').setStyle(TextInputStyle.Short).setValue(roleId).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(thresholdInput), new ActionRowBuilder().addComponents(roleIdInput));
  await interaction.showModal(modal);
}

async function showEditAutoRoleSelect(interaction, serverConfig) {
  const autoRoles = serverConfig.auto_role_thresholds || {};
  const roleEntries = Object.entries(autoRoles).sort(([a], [b]) => parseInt(a) - parseInt(b));
  if (roleEntries.length === 0) {
    await updateInteraction(interaction, { content: '❌ No auto roles configured to edit.', components: [] });
    return;
  }
  const embed = new EmbedBuilder()
    .setColor(serverConfig.embed_color || '#5865F2')
    .setTitle('✏️ Edit Auto Role Threshold')
    .setDescription('Select an auto role to edit its point threshold:')
    .addFields([
      {
        name: 'Current Auto Roles',
        value: roleEntries
          .map(([threshold, roleId]) => {
            const role = interaction.guild.roles.cache.get(roleId);
            const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
            return `**${threshold} points:** ${roleName}`;
          })
          .join('\n'),
        inline: false,
      },
    ]);
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('config_autorole_edit_select')
    .setPlaceholder('Select a role to edit...')
    .addOptions(
      roleEntries.map(([threshold, roleId]) => {
        const role = interaction.guild.roles.cache.get(roleId);
        const roleName = role ? role.name : 'Unknown Role';
        return { label: `${threshold} points - ${roleName}`, value: `${threshold}:${roleId}`, description: `Edit threshold for ${roleName}` };
      }),
    );
  const row1 = new ActionRowBuilder().addComponents(selectMenu);
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_autoroles').setLabel('← Back').setStyle(ButtonStyle.Primary));
  await updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
}

async function showRemoveAutoRoleSelect(interaction, serverConfig) {
  const autoRoles = serverConfig.auto_role_thresholds || {};
  const roleEntries = Object.entries(autoRoles).sort(([a], [b]) => parseInt(a) - parseInt(b));
  if (roleEntries.length === 0) {
    await updateInteraction(interaction, { content: '❌ No auto roles configured to remove.', components: [] });
    return;
  }
  const embed = new EmbedBuilder().setColor(serverConfig.embed_color || '#5865F2').setTitle('🗑️ Remove Auto Role').setDescription('Select an auto role to remove:');
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('config_autorole_remove_select')
    .setPlaceholder('Select a role to remove...')
    .addOptions(
      roleEntries.map(([threshold, roleId]) => {
        const role = interaction.guild.roles.cache.get(roleId);
        const roleName = role ? role.name : 'Unknown Role';
        return { label: `${threshold} points - ${roleName}`, value: `${threshold}:${roleId}`, description: `Remove ${roleName} auto role`, emoji: '🗑️' };
      }),
    );
  const row1 = new ActionRowBuilder().addComponents(selectMenu);
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_autoroles').setLabel('← Back').setStyle(ButtonStyle.Primary));
  await updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
}

async function showAutoRoleTestResults(interaction, serverConfig) {
  const autoRoles = serverConfig.auto_role_thresholds || {};
  const roleEntries = Object.entries(autoRoles).sort(([a], [b]) => parseInt(a) - parseInt(b));
  if (roleEntries.length === 0) {
    await updateInteraction(interaction, { content: '❌ No auto roles configured to test.', components: [] });
    return;
  }

  const { data: topUsers, error } = await supabase
    .from('users')
    .select('user_id::text, total_score')
    .eq('server_id', interaction.guild.id)
    .order('total_score', { ascending: false })
    .limit(10);

  if (error) {
    await updateInteraction(interaction, { content: '❌ Error fetching user data for testing.', components: [] });
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
      .sort((a, b) => b.threshold - a.threshold);
    const highestEligibleRole = eligibleRoles[0];
    const hasRole = highestEligibleRole && member.roles.cache.has(highestEligibleRole.roleId);
    testResults.push({ member, score: user.total_score, eligibleRole: highestEligibleRole, hasRole });
  }

  const embed = new EmbedBuilder()
    .setColor(serverConfig.embed_color || '#5865F2')
    .setTitle('🧪 Auto Role Test Results')
    .setDescription('Preview of role assignments for top users based on current configuration:')
    .addFields([
      {
        name: 'Test Results (Top 10 Users)',
        value:
          testResults.length > 0
            ? testResults
                .map((result) => {
                  const statusIcon = result.hasRole ? '✅' : '❌';
                  const roleText = result.eligibleRole ? `${result.eligibleRole.role ? `@${result.eligibleRole.role.name}` : 'Unknown Role'} (${result.eligibleRole.threshold}+ pts)` : 'No role eligible';
                  return `${statusIcon} **${result.member.displayName}** (${result.score} pts) → ${roleText}`;
                })
                .join('\n')
            : 'No users found with scores',
        inline: false,
      },
      { name: 'Legend', value: '✅ User has the correct role\n❌ User missing expected role', inline: false },
    ])
    .setFooter({ text: 'This is a preview only. Actual role assignment happens automatically when users gain points.' });

  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_autoroles').setLabel('← Back').setStyle(ButtonStyle.Primary));
  await updateInteraction(interaction, { embeds: [embed], components: [row] });
}

async function showClearAllAutoRolesConfirmation(interaction, serverConfig) {
  const autoRoles = serverConfig.auto_role_thresholds || {};
  const roleCount = Object.keys(autoRoles).length;
  if (roleCount === 0) {
    await updateInteraction(interaction, { content: '❌ No auto roles configured to clear.', components: [] });
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
          })
          .join('\n'),
        inline: false,
      },
    ]);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_autoroles_confirm_clear').setLabel('🗑️ Yes, Clear All').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('config_autoroles_cancel_clear').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary),
  );
  await updateInteraction(interaction, { embeds: [embed], components: [row] });
}

async function clearAllAutoRoles(interaction, serverConfig) {
  const serverId = interaction.guild.id;
  try {
    await updateServerConfig(serverId, { auto_role_thresholds: {} });
    await logConfigChange(
      interaction,
      'Auto Roles',
      `${Object.keys(serverConfig.auto_role_thresholds || {}).length} roles configured`,
      'All auto roles cleared',
    );
    const embed = new EmbedBuilder().setColor('#00ff00').setTitle('✅ Auto Roles Cleared').setDescription('All auto role configurations have been successfully removed.').setFooter({ text: 'You can add new auto roles anytime using the Add Role button.' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_autoroles').setLabel('← Back to Auto Roles').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
  } catch (error) {
    await updateInteraction(interaction, { content: '❌ Error clearing auto roles. Please try again.', components: [] });
  }
}

async function showEditAutoRoleModal(interaction, threshold, roleId) {
  const role = interaction.guild.roles.cache.get(roleId);
  const roleName = role ? role.name : 'Unknown Role';
  const modal = new ModalBuilder().setCustomId('config_edit_autorole_modal').setTitle(`Edit Auto Role: ${roleName}`);
  const thresholdInput = new TextInputBuilder().setCustomId('autorole_edit_threshold_input').setLabel('New Point Threshold').setStyle(TextInputStyle.Short).setPlaceholder('Enter new point threshold').setValue(threshold).setMinLength(1).setMaxLength(6).setRequired(true);
  const oldThresholdInput = new TextInputBuilder().setCustomId('autorole_old_threshold_input').setLabel('Current Threshold (do not edit)').setStyle(TextInputStyle.Short).setValue(threshold).setRequired(true);
  const roleInput = new TextInputBuilder().setCustomId('autorole_edit_role_input').setLabel('Role ID (do not edit)').setStyle(TextInputStyle.Short).setValue(roleId).setRequired(true);
  modal.addComponents(
    new ActionRowBuilder().addComponents(thresholdInput),
    new ActionRowBuilder().addComponents(oldThresholdInput),
    new ActionRowBuilder().addComponents(roleInput),
  );
  await interaction.showModal(modal);
}

async function removeAutoRole(interaction, serverConfig, threshold, roleId) {
  const serverId = interaction.guild.id;
  try {
    const role = interaction.guild.roles.cache.get(roleId);
    const roleName = role ? role.name : 'Unknown Role';
    const currentAutoRoles = serverConfig.auto_role_thresholds || {};
    const updatedAutoRoles = { ...currentAutoRoles };
    delete updatedAutoRoles[threshold];
    await updateServerConfig(serverId, { auto_role_thresholds: updatedAutoRoles });
    await logConfigChange(interaction, 'Auto Roles', `${threshold} points → @${roleName}`, 'Auto role removed');
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ Auto Role Removed')
      .setDescription(`Successfully removed auto role configuration:\n\n**${threshold} points → @${roleName}**`)
      .setFooter({ text: 'Users who currently have this role will keep it.' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_autoroles').setLabel('← Back to Auto Roles').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
  } catch (error) {
    await updateInteraction(interaction, { content: '❌ Error removing auto role. Please try again.', components: [] });
  }
}

async function handleAddAutoRoleModal(interaction, serverId) {
  const thresholdValue = interaction.fields.getTextInputValue('autorole_threshold_input');
  const roleIdValue = interaction.fields.getTextInputValue('autorole_role_id_input').trim();
  const threshold = parseInt(thresholdValue);
  const serverConfig = await DatabaseUtils.getServerConfig(serverId);
  if (isNaN(threshold) || threshold < 1 || threshold > 999999) {
    await interaction.followUp({ content: '❌ Invalid threshold value. Please enter a number between 1 and 999,999.', flags: MessageFlags.Ephemeral });
    return;
  }
  const role = interaction.guild.roles.cache.get(roleIdValue);
  if (!role) {
    await interaction.followUp({ content: '❌ Role not found in this server. Please try again.', flags: MessageFlags.Ephemeral });
    return;
  }
  const currentAutoRoles = serverConfig.auto_role_thresholds || {};
  if (currentAutoRoles[threshold]) {
    await interaction.followUp({ content: `❌ A role is already configured for ${threshold} points.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const assignableRoles = getAssignableRoles(interaction.guild);
  const canAssign = assignableRoles.some((r) => r.id === roleIdValue);
  if (!canAssign) {
    await interaction.followUp({ content: "❌ This role cannot be assigned by the bot.", flags: MessageFlags.Ephemeral });
    return;
  }
  const updatedAutoRoles = { ...currentAutoRoles, [threshold]: roleIdValue };
  await updateServerConfig(serverId, { auto_role_thresholds: updatedAutoRoles });
  await logConfigChange(interaction, 'Auto Roles', `Added role configuration`, `${threshold} points → @${role.name}`);

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('✅ Auto Role Added')
    .setDescription(`Successfully configured auto role:\n\n**${threshold} points → @${role.name}**`)
    .setFooter({ text: 'Users will automatically receive this role when they reach the threshold.' });
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_autoroles').setLabel('← Back to Auto Roles').setStyle(ButtonStyle.Primary));
  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleEditAutoRoleModal(interaction, serverId) {
  const thresholdValue = interaction.fields.getTextInputValue('autorole_edit_threshold_input');
  const oldThreshold = interaction.fields.getTextInputValue('autorole_old_threshold_input');
  const roleId = interaction.fields.getTextInputValue('autorole_edit_role_input');
  const newThreshold = parseInt(thresholdValue);
  const serverConfig = await DatabaseUtils.getServerConfig(serverId);
  if (isNaN(newThreshold) || newThreshold < 1 || newThreshold > 999999) {
    await interaction.followUp({ content: '❌ Invalid threshold value. Please enter a number between 1 and 999,999.', flags: MessageFlags.Ephemeral });
    return;
  }
  const currentAutoRoles = serverConfig.auto_role_thresholds || {};
  if (currentAutoRoles[newThreshold] && newThreshold.toString() !== oldThreshold) {
    await interaction.followUp({ content: `❌ A role is already configured for ${newThreshold} points.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const updatedAutoRoles = { ...currentAutoRoles };
  delete updatedAutoRoles[oldThreshold];
  updatedAutoRoles[newThreshold] = roleId;
  await updateServerConfig(serverId, { auto_role_thresholds: updatedAutoRoles });

  const role = interaction.guild.roles.cache.get(roleId);
  await logConfigChange(
    interaction,
    'Auto Roles',
    `${oldThreshold} points → @${role ? role.name : 'Unknown Role'}`,
    `${newThreshold} points → @${role ? role.name : 'Unknown Role'}`,
  );
  const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
  await showAutoRolesConfig(interaction, updatedConfig);
}

module.exports = {
  showAutoRolesConfig,
  showAddAutoRoleModal,
  getAssignableRoles,
  showAutoRoleThresholdModal,
  showEditAutoRoleSelect,
  showRemoveAutoRoleSelect,
  showAutoRoleTestResults,
  showClearAllAutoRolesConfirmation,
  clearAllAutoRoles,
  showEditAutoRoleModal,
  removeAutoRole,
  handleAddAutoRoleModal,
  handleEditAutoRoleModal,
};