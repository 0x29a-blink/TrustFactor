const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../../../utils/database');
const { updateInteraction } = require('../ui');
const { updateServerConfig, logConfigChange } = require('../services/configService');

function getPositionSuffix(position) {
  const pos = parseInt(position);
  if (pos >= 11 && pos <= 13) return 'th';
  switch (pos % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function getStrategyText(strategy) {
  switch (strategy) {
    case 'global':
      return '🌍 **Global** - Only assign to actual global leaderboard positions';
    case 'global-filtered':
      return '🌐 **Global (Server-Filtered)** - Global leaderboard but only server members';
    default:
      return '🏠 **Server-Local** - Assign to highest-ranking users in this server';
  }
}

async function showLeaderboardRolesConfig(interaction, serverConfig) {
  const leaderboardRoles = serverConfig.leaderboard_roles || {};
  const positiveRoles = leaderboardRoles.positive || {};
  const negativeRoles = leaderboardRoles.negative || {};
  const assignmentStrategy = leaderboardRoles.assignment_strategy || {};

  const positiveEntries = Object.entries(positiveRoles).sort(([a], [b]) => parseInt(a) - parseInt(b));
  const negativeEntries = Object.entries(negativeRoles).sort(([a], [b]) => parseInt(a) - parseInt(b));

  const positiveStrategy = assignmentStrategy.positive || 'server-local';
  const negativeStrategy = assignmentStrategy.negative || 'server-local';

  const embed = new EmbedBuilder()
    .setColor(serverConfig.embed_color || '#5865F2')
    .setTitle('🥇 Leaderboard Roles Configuration')
    .setDescription(
      'Configure automatic role assignment for leaderboard positions.\n\n**How it works:** Users in specific leaderboard positions (1st, 2nd, 3rd, etc.) will automatically receive the configured Discord roles. You can configure separate roles and assignment strategies for positive and negative leaderboards.',
    )
    .addFields(
      {
        name: '🏆 Positive Leaderboard Roles',
        value:
          (positiveEntries.length > 0
            ? positiveEntries
                .map(([position, roleId]) => {
                  const role = interaction.guild.roles.cache.get(roleId);
                  const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                  return `**${position}${getPositionSuffix(position)} place:** ${roleName}`;
                })
                .join('\n')
            : 'No positive leaderboard roles configured yet') + `\n**Assignment Strategy:** ${getStrategyText(positiveStrategy).replace(/\*\*/g, '')}`,
        inline: false,
      },
      {
        name: '💀 Negative Leaderboard Roles',
        value:
          (negativeEntries.length > 0
            ? negativeEntries
                .map(([position, roleId]) => {
                  const role = interaction.guild.roles.cache.get(roleId);
                  const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
                  return `**${position}${getPositionSuffix(position)} place:** ${roleName}`;
                })
                .join('\n')
            : 'No negative leaderboard roles configured yet') + `\n**Assignment Strategy:** ${getStrategyText(negativeStrategy).replace(/\*\*/g, '')}`,
        inline: false,
      },
      {
        name: 'Strategy Explanation',
        value:
          "**🌍 Global:**\nOnly the real global #1 gets the #1 role\nIf real global #1 isn't in the server → no one gets the role\n\n**🌐 Global (Server-Filtered):**\nIf real global #1 isn't in server → next person in global ranking who IS in server gets it\nMaintains global ranking order, just skips missing people\n\n**🏠 Server-Local:**\nWhoever has highest score in that specific server gets #1 role\nCompletely ignores what's happening globally",
        inline: false,
      },
    )
    .setFooter({ text: 'Leaderboard roles provide recognition for top performers and encourage competition' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_leaderboard_roles_add_positive').setLabel('🏆 Add Positive Role').setStyle(ButtonStyle.Success).setDisabled(positiveEntries.length >= 10),
    new ButtonBuilder().setCustomId('config_leaderboard_roles_add_negative').setLabel('💀 Add Negative Role').setStyle(ButtonStyle.Success).setDisabled(negativeEntries.length >= 10),
    new ButtonBuilder()
      .setCustomId('config_leaderboard_roles_edit')
      .setLabel('✏️ Edit Position')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(positiveEntries.length === 0 && negativeEntries.length === 0),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config_leaderboard_roles_strategy_positive')
      .setLabel(`🏆 Positive: ${positiveStrategy === 'global' ? '🌍' : positiveStrategy === 'global-filtered' ? '🌐' : '🏠'}`)
      .setStyle(positiveStrategy !== 'server-local' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('config_leaderboard_roles_strategy_negative')
      .setLabel(`💀 Negative: ${negativeStrategy === 'global' ? '🌍' : negativeStrategy === 'global-filtered' ? '🌐' : '🏠'}`)
      .setStyle(negativeStrategy !== 'server-local' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('config_leaderboard_roles_remove')
      .setLabel('🗑️ Remove Role')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(positiveEntries.length === 0 && negativeEntries.length === 0),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_leaderboard_roles_test').setLabel('🧪 Test Assignment').setStyle(ButtonStyle.Secondary).setDisabled(positiveEntries.length === 0 && negativeEntries.length === 0),
    new ButtonBuilder().setCustomId('config_leaderboard_roles_clear_all').setLabel('🚨 Clear All').setStyle(ButtonStyle.Danger).setDisabled(positiveEntries.length === 0 && negativeEntries.length === 0),
    new ButtonBuilder().setCustomId('config_back_main').setLabel('← Back').setStyle(ButtonStyle.Primary),
  );

  await updateInteraction(interaction, { embeds: [embed], components: [row1, row2, row3] });
}

async function showAddLeaderboardRoleModal(interaction, leaderboardType = 'positive') {
  const assignableRoles = require('./autoRoles').getAssignableRoles(interaction.guild);
  const serverConfig = await DatabaseUtils.getServerConfig(interaction.guild.id);
  const leaderboardRoles = serverConfig.leaderboard_roles || {};
  const typeRoles = leaderboardRoles[leaderboardType] || {};
  const availableRoles = assignableRoles.filter((role) => !Object.values(typeRoles).includes(role.id));

  if (availableRoles.length === 0) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ No Available Roles')
      .setDescription('All assignable roles are already configured for leaderboard positions, or no roles are available for the bot to assign.')
      .setFooter({ text: "Make sure the bot has permission to assign roles and that roles are below the bot's highest role." });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back to Leaderboard Roles').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(serverConfig.embed_color || '#5865F2')
    .setTitle(`➕ Add ${leaderboardType === 'positive' ? '🏆 Positive' : '💀 Negative'} Leaderboard Role`)
    .setDescription(`Select a role to configure for ${leaderboardType === 'positive' ? 'positive' : 'negative'} leaderboard position assignment:`)
    .addFields(
      { name: 'Available Roles', value: availableRoles.length > 0 ? availableRoles.slice(0, 10).map((role) => `• @${role.name}`).join('\n') : 'No available roles', inline: false },
      { name: 'Next Step', value: "After selecting a role, you'll set the leaderboard position (1st, 2nd, 3rd, etc.) required to receive it.", inline: false },
    )
    .setFooter({ text: `${availableRoles.length} assignable role${availableRoles.length !== 1 ? 's' : ''} available` });

  const roleOptions = availableRoles.slice(0, 25).map((role) => ({ label: role.name, value: role.id, description: `Role position: ${role.position}`, emoji: role.unicodeEmoji || undefined }));
  const selectMenu = new StringSelectMenuBuilder().setCustomId(`config_leaderboard_role_select_role_${leaderboardType}`).setPlaceholder('Select a role to configure...').addOptions(roleOptions);
  const row1 = new ActionRowBuilder().addComponents(selectMenu);
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back').setStyle(ButtonStyle.Primary));
  await updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
}

async function showLeaderboardRolePositionModal(interaction, roleId, leaderboardType = 'positive') {
  const modal = new ModalBuilder().setCustomId(`config_add_leaderboard_role_position_modal_${leaderboardType}`).setTitle(`Set ${leaderboardType === 'positive' ? 'Positive' : 'Negative'} Leaderboard Position`);
  const positionInput = new TextInputBuilder().setCustomId('leaderboard_position_input').setLabel('Leaderboard Position').setStyle(TextInputStyle.Short).setPlaceholder('Enter position (1, 2, 3, etc.)').setMinLength(1).setMaxLength(2).setRequired(true);
  const roleIdInput = new TextInputBuilder().setCustomId('leaderboard_role_id_input').setLabel('Role ID (do not edit)').setStyle(TextInputStyle.Short).setValue(roleId).setRequired(true);
  const leaderboardTypeInput = new TextInputBuilder().setCustomId('leaderboard_type_input').setLabel('Leaderboard Type (do not edit)').setStyle(TextInputStyle.Short).setValue(leaderboardType).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(positionInput), new ActionRowBuilder().addComponents(roleIdInput), new ActionRowBuilder().addComponents(leaderboardTypeInput));
  await interaction.showModal(modal);
}

async function showEditLeaderboardRoleSelect(interaction, serverConfig) {
  const leaderboardRoles = serverConfig.leaderboard_roles || {};
  const positiveRoles = leaderboardRoles.positive || {};
  const negativeRoles = leaderboardRoles.negative || {};
  const allRoles = { ...positiveRoles, ...negativeRoles };
  const roleEntries = Object.entries(allRoles);

  if (roleEntries.length === 0) {
    const embed = new EmbedBuilder().setColor('#ff0000').setTitle('❌ No Leaderboard Roles Configured').setDescription('There are no leaderboard roles to edit. Add some first!').setFooter({ text: 'Use the "Add Role" button to configure leaderboard roles.' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back to Leaderboard Roles').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
    return;
  }

  const embed = new EmbedBuilder().setColor(serverConfig.embed_color || '#5865F2').setTitle('✏️ Edit Leaderboard Role Position').setDescription('Select a leaderboard role to edit its position:').setFooter({ text: 'You can change which position gets this role' });
  const roleOptions = roleEntries.map(([position, roleId]) => {
    const role = interaction.guild.roles.cache.get(roleId);
    const roleName = role ? role.name : 'Unknown Role';
    const leaderboardType = positiveRoles[position] ? 'positive' : 'negative';
    return { label: `${position}${getPositionSuffix(position)} place - ${roleName}`, value: `${position}:${roleId}:${leaderboardType}`, description: `Currently assigned to ${position}${getPositionSuffix(position)} place (${leaderboardType})` };
  });

  const selectMenu = new StringSelectMenuBuilder().setCustomId('config_leaderboard_role_edit_select').setPlaceholder('Select a role to edit...').addOptions(roleOptions);
  const row1 = new ActionRowBuilder().addComponents(selectMenu);
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back').setStyle(ButtonStyle.Primary));
  await updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
}

async function showRemoveLeaderboardRoleSelect(interaction, serverConfig) {
  const leaderboardRoles = serverConfig.leaderboard_roles || {};
  const positiveRoles = leaderboardRoles.positive || {};
  const negativeRoles = leaderboardRoles.negative || {};
  const allRoles = { ...positiveRoles, ...negativeRoles };
  const roleEntries = Object.entries(allRoles);

  if (roleEntries.length === 0) {
    const embed = new EmbedBuilder().setColor('#ff0000').setTitle('❌ No Leaderboard Roles Configured').setDescription('There are no leaderboard roles to remove. Add some first!').setFooter({ text: 'Use the "Add Role" button to configure leaderboard roles.' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back to Leaderboard Roles').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
    return;
  }

  const embed = new EmbedBuilder().setColor(serverConfig.embed_color || '#5865F2').setTitle('🗑️ Remove Leaderboard Role').setDescription('Select a leaderboard role to remove:').setFooter({ text: 'This will remove the role configuration but not the role itself' });
  const roleOptions = roleEntries.map(([position, roleId]) => {
    const role = interaction.guild.roles.cache.get(roleId);
    const roleName = role ? role.name : 'Unknown Role';
    const leaderboardType = (leaderboardRoles.positive || {})[position] ? 'positive' : 'negative';
    return { label: `${position}${getPositionSuffix(position)} place - ${roleName}`, value: `${position}:${roleId}:${leaderboardType}`, description: `Currently assigned to ${position}${getPositionSuffix(position)} place (${leaderboardType})` };
  });

  const selectMenu = new StringSelectMenuBuilder().setCustomId('config_leaderboard_role_remove_select').setPlaceholder('Select a role to remove...').addOptions(roleOptions);
  const row1 = new ActionRowBuilder().addComponents(selectMenu);
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back').setStyle(ButtonStyle.Primary));
  await updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
}

async function filterLeaderboardForGuild(leaderboard, guild) {
  const filtered = [];
  for (const entry of leaderboard) {
    try {
      await guild.members.fetch(String(entry.user_id));
      filtered.push(entry);
    } catch {
      // not in guild, skip
    }
  }
  return filtered;
}

async function showLeaderboardRoleTestResults(interaction, serverConfig) {
  const serverId = interaction.guild.id;
  const leaderboardRoles = serverConfig.leaderboard_roles || {};
  const positiveRoles = leaderboardRoles.positive || {};
  const negativeRoles = leaderboardRoles.negative || {};
  const assignmentStrategy = leaderboardRoles.assignment_strategy || {};

  if (Object.keys(positiveRoles).length === 0 && Object.keys(negativeRoles).length === 0) {
    const embed = new EmbedBuilder().setColor('#ff0000').setTitle('❌ No Leaderboard Roles Configured').setDescription('There are no leaderboard roles to test. Add some first!').setFooter({ text: 'Use the "Add Role" buttons to configure leaderboard roles.' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back to Leaderboard Roles').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
    return;
  }

  try {
    const positiveStrategy = assignmentStrategy.positive || 'server-local';
    const negativeStrategy = assignmentStrategy.negative || 'server-local';

    const leaderboard = await DatabaseUtils.getLeaderboard(serverId, 100);
    let positiveLeaderboard = leaderboard.filter((e) => e.total_score > 0).slice(0, 10);
    let negativeLeaderboard = leaderboard.filter((e) => e.total_score < 0).sort((a, b) => a.total_score - b.total_score).slice(0, 10);

    if (positiveStrategy === 'server-local' || positiveStrategy === 'global-filtered') {
      positiveLeaderboard = await filterLeaderboardForGuild(positiveLeaderboard, interaction.guild);
    }
    if (negativeStrategy === 'server-local' || negativeStrategy === 'global-filtered') {
      negativeLeaderboard = await filterLeaderboardForGuild(negativeLeaderboard, interaction.guild);
    }

    let positiveTestResults = '';
    for (let i = 0; i < positiveLeaderboard.length; i++) {
      const entry = positiveLeaderboard[i];
      const position = i + 1;
      const roleId = positiveRoles[position];
      if (roleId) {
        const role = interaction.guild.roles.cache.get(roleId);
        const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
        let memberStatus = '';
        try {
          await interaction.guild.members.fetch(String(entry.user_id));
          memberStatus = '✅';
        } catch {
          memberStatus = positiveStrategy === 'global' ? '❌ (not in server, will skip)' : '❌ (filtered out)';
        }
        positiveTestResults += `${position}${getPositionSuffix(position)}: <@${entry.user_id}> (${entry.total_score} pts) → ${roleName} ${memberStatus}\n`;
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
        let memberStatus = '';
        try {
          await interaction.guild.members.fetch(String(entry.user_id));
          memberStatus = '✅';
        } catch {
          memberStatus = negativeStrategy === 'global' ? '❌ (not in server, will skip)' : '❌ (filtered out)';
        }
        negativeTestResults += `${position}${getPositionSuffix(position)}: <@${entry.user_id}> (${entry.total_score} pts) → ${roleName} ${memberStatus}\n`;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(serverConfig.embed_color || '#5865F2')
      .setTitle('🧪 Leaderboard Role Test Results')
      .setDescription('Preview of current leaderboard role assignments based on your configuration:')
      .addFields(
        { name: `🏆 Positive Leaderboard (${positiveStrategy === 'global' ? '🌍 Global' : positiveStrategy === 'global-filtered' ? '🌐 Global (Server-Filtered)' : '🏠 Server-Local'})`, value: positiveTestResults || '*No positive roles configured*', inline: false },
        { name: `💀 Negative Leaderboard (${negativeStrategy === 'global' ? '🌍 Global' : negativeStrategy === 'global-filtered' ? '🌐 Global (Server-Filtered)' : '🏠 Server-Local'})`, value: negativeTestResults || '*No negative roles configured*', inline: false },
        { name: 'Legend', value: '✅ = Role will be assigned\n❌ = User not in server (assignment will be skipped)', inline: false },
      )
      .setFooter({ text: 'This is a preview only. Roles are not actually assigned.' });

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back to Leaderboard Roles').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
  } catch (error) {
    await updateInteraction(interaction, { content: '❌ Error testing leaderboard roles. Please try again.', components: [] });
  }
}

async function showClearAllLeaderboardRolesConfirmation(interaction, serverConfig) {
  const leaderboardRoles = serverConfig.leaderboard_roles || {};
  const positiveRoles = leaderboardRoles.positive || {};
  const negativeRoles = leaderboardRoles.negative || {};
  const totalRoleCount = Object.keys(positiveRoles).length + Object.keys(negativeRoles).length;
  if (totalRoleCount === 0) {
    const embed = new EmbedBuilder().setColor('#ff0000').setTitle('❌ No Leaderboard Roles to Clear').setDescription('There are no leaderboard roles configured to clear.').setFooter({ text: 'Add some leaderboard roles first!' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back to Leaderboard Roles').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor('#ff9900')
    .setTitle('⚠️ Clear All Leaderboard Roles')
    .setDescription(`Are you sure you want to clear all ${totalRoleCount} leaderboard role configuration${totalRoleCount !== 1 ? 's' : ''}?\n\n**This action cannot be undone!**`)
    .addFields(
      {
        name: '🏆 Positive Leaderboard Roles',
        value:
          Object.entries(positiveRoles)
            .map(([position, roleId]) => {
              const role = interaction.guild.roles.cache.get(roleId);
              const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
              return `**${position}${getPositionSuffix(position)} place:** ${roleName}`;
            })
            .join('\n') || '*No positive roles configured*',
        inline: false,
      },
      {
        name: '💀 Negative Leaderboard Roles',
        value:
          Object.entries(negativeRoles)
            .map(([position, roleId]) => {
              const role = interaction.guild.roles.cache.get(roleId);
              const roleName = role ? `@${role.name}` : `<@&${roleId}> (Role not found)`;
              return `**${position}${getPositionSuffix(position)} place:** ${roleName}`;
            })
            .join('\n') || '*No negative roles configured*',
        inline: false,
      },
    )
    .setFooter({ text: 'Users who currently have these roles will keep them.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_leaderboard_roles_confirm_clear').setLabel('🗑️ Yes, Clear All').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('config_leaderboard_roles_cancel_clear').setLabel('❌ Cancel').setStyle(ButtonStyle.Primary),
  );

  await updateInteraction(interaction, { embeds: [embed], components: [row] });
}

async function clearAllLeaderboardRoles(interaction, serverConfig) {
  const serverId = interaction.guild.id;
  try {
    const freshServerConfig = await DatabaseUtils.getServerConfig(serverId);
    const leaderboardRoles = freshServerConfig.leaderboard_roles || {};

    let positiveRoles = {};
    let negativeRoles = {};
    let allRoleIds = [];

    if (leaderboardRoles.positive || leaderboardRoles.negative) {
      positiveRoles = leaderboardRoles.positive || {};
      negativeRoles = leaderboardRoles.negative || {};
      allRoleIds = [...Object.values(positiveRoles), ...Object.values(negativeRoles)];
    } else {
      allRoleIds = Object.values(leaderboardRoles);
    }

    // Remove all roles assignments best-effort (do not fail hard)
    for (const roleId of allRoleIds) {
      const roleIdString = String(roleId);
      const role = await interaction.guild.roles.fetch(roleIdString).catch(() => interaction.guild.roles.cache.get(roleIdString));
      if (!role) continue;
      try {
        // Remove from cached members (best-effort)
        const membersWithRole = role.members;
        for (const [, member] of membersWithRole) {
          await member.roles.remove(roleIdString, 'Leaderboard roles cleared');
        }
      } catch {}
    }

    await updateServerConfig(serverId, { leaderboard_roles: {} });
    await logConfigChange(interaction, 'Leaderboard Roles', `${allRoleIds.length} roles configured`, 'All leaderboard roles cleared');

    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ All Leaderboard Roles Cleared')
      .setDescription(`Successfully cleared all ${allRoleIds.length} leaderboard role configuration${allRoleIds.length !== 1 ? 's' : ''}.`)
      .setFooter({ text: 'Users who currently have these roles will keep them.' });

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back to Leaderboard Roles').setStyle(ButtonStyle.Primary));

    await updateInteraction(interaction, { embeds: [embed], components: [row] });
  } catch (error) {
    await updateInteraction(interaction, { content: '❌ Error clearing leaderboard roles. Please try again.', components: [] });
  }
}

async function toggleLeaderboardRoleStrategy(interaction, serverConfig, leaderboardType) {
  const serverId = interaction.guild.id;
  const leaderboardRoles = serverConfig.leaderboard_roles || {};
  const assignmentStrategy = leaderboardRoles.assignment_strategy || {};
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

  const updatedStrategy = { ...assignmentStrategy, [leaderboardType]: newStrategy };
  const updatedLeaderboardRoles = { ...leaderboardRoles, assignment_strategy: updatedStrategy };
  await updateServerConfig(serverId, { leaderboard_roles: updatedLeaderboardRoles });

  // Attempt to apply roles immediately (best-effort)
  try {
    await DatabaseUtils.assignLeaderboardRoles(serverId, interaction.guild);
  } catch {}

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('✅ Strategy Updated')
    .setDescription(`**${leaderboardType.charAt(0).toUpperCase() + leaderboardType.slice(1)} leaderboard assignment strategy** updated to:\n\n${
      newStrategy === 'global' ? '🌍 **Global**' : newStrategy === 'global-filtered' ? '🌐 **Global (Server-Filtered)**' : '🏠 **Server-Local**'
    }`)
    .setTimestamp();

  await updateInteraction(interaction, { embeds: [embed], components: [] });

  setTimeout(async () => {
    try {
      const freshServerConfig = await DatabaseUtils.getServerConfig(serverId);
      await showLeaderboardRolesConfig(interaction, freshServerConfig);
    } catch {}
  }, 2000);
}

async function showEditLeaderboardRoleModal(interaction, position, roleId, leaderboardType) {
  const modal = new ModalBuilder().setCustomId('config_edit_leaderboard_role_modal').setTitle('Edit Leaderboard Role Position');
  const positionInput = new TextInputBuilder().setCustomId('leaderboard_edit_position_input').setLabel('New Leaderboard Position').setStyle(TextInputStyle.Short).setPlaceholder('Enter new position (1, 2, 3, etc.)').setMinLength(1).setMaxLength(2).setRequired(true);
  const oldPositionInput = new TextInputBuilder().setCustomId('leaderboard_old_position_input').setLabel('Current Position (do not edit)').setStyle(TextInputStyle.Short).setValue(position).setRequired(true);
  const roleInput = new TextInputBuilder().setCustomId('leaderboard_edit_role_input').setLabel('Role ID (do not edit)').setStyle(TextInputStyle.Short).setValue(roleId).setRequired(true);
  const leaderboardTypeInput = new TextInputBuilder().setCustomId('leaderboard_edit_type_input').setLabel('Leaderboard Type (do not edit)').setStyle(TextInputStyle.Short).setValue(leaderboardType).setRequired(true);
  modal.addComponents(
    new ActionRowBuilder().addComponents(positionInput),
    new ActionRowBuilder().addComponents(oldPositionInput),
    new ActionRowBuilder().addComponents(roleInput),
    new ActionRowBuilder().addComponents(leaderboardTypeInput),
  );
  await interaction.showModal(modal);
}

async function removeLeaderboardRole(interaction, serverConfig, position, roleId, leaderboardType) {
  const serverId = interaction.guild.id;
  try {
    const roleName = interaction.guild.roles.cache.get(String(roleId))?.name || 'Unknown Role';
    const current = serverConfig.leaderboard_roles || {};
    const updated = { ...current };
    if (leaderboardType === 'negative' && updated.negative) delete updated.negative[position];
    else if (leaderboardType === 'positive' && updated.positive) delete updated.positive[position];
    await updateServerConfig(serverId, { leaderboard_roles: updated });
    await logConfigChange(interaction, 'Leaderboard Roles', `${position}${getPositionSuffix(position)} place → @${roleName}`, 'Leaderboard role removed');

    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ Leaderboard Role Removed')
      .setDescription(`Successfully removed leaderboard role configuration:\n\n**${position}${getPositionSuffix(position)} place → @${roleName}**`)
      .setFooter({ text: 'Users who currently have this role will keep it.' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back to Leaderboard Roles').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
  } catch (error) {
    await updateInteraction(interaction, { content: '❌ Error removing leaderboard role. Please try again.', components: [] });
  }
}

async function handleAddLeaderboardRoleModal(interaction, serverId) {
  const leaderboardType = interaction.customId.split('_').pop();
  const positionValue = interaction.fields.getTextInputValue('leaderboard_position_input');
  const roleIdValue = interaction.fields.getTextInputValue('leaderboard_role_id_input').trim();
  const position = parseInt(positionValue);
  const serverConfig = await DatabaseUtils.getServerConfig(serverId);

  if (isNaN(position) || position < 1 || position > 10) {
    await interaction.followUp({ content: '❌ Invalid position value. Please enter a number between 1 and 10.', flags: MessageFlags.Ephemeral });
    return;
  }

  const roleIdString = String(roleIdValue);
  const role = interaction.guild.roles.cache.get(roleIdString);
  if (!role) {
    await interaction.followUp({ content: '❌ Role not found in this server. Please try again.', flags: MessageFlags.Ephemeral });
    return;
  }

  const currentLeaderboardRoles = serverConfig.leaderboard_roles || {};
  const currentTypeRoles = currentLeaderboardRoles[leaderboardType] || {};
  if (currentTypeRoles[position]) {
    await interaction.followUp({ content: `❌ A role is already configured for ${position}${getPositionSuffix(position)} place in the ${leaderboardType} leaderboard.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const canAssign = require('./autoRoles').getAssignableRoles(interaction.guild).some((r) => String(r.id) === roleIdString);
  if (!canAssign) {
    await interaction.followUp({ content: "❌ This role cannot be assigned by the bot.", flags: MessageFlags.Ephemeral });
    return;
  }

  const updatedLeaderboardRoles = { ...currentLeaderboardRoles };
  if (!updatedLeaderboardRoles[leaderboardType]) updatedLeaderboardRoles[leaderboardType] = {};
  updatedLeaderboardRoles[leaderboardType][position] = roleIdString;
  await updateServerConfig(serverId, { leaderboard_roles: updatedLeaderboardRoles });

  try {
    await DatabaseUtils.assignLeaderboardRoles(serverId, interaction.guild);
  } catch {}

  await logConfigChange(
    interaction,
    'Leaderboard Roles',
    `Added ${leaderboardType} role configuration`,
    `${position}${getPositionSuffix(position)} place → @${role.name}`,
  );

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle(`✅ ${leaderboardType === 'positive' ? 'Positive' : 'Negative'} Leaderboard Role Added`)
    .setDescription(`Successfully configured ${leaderboardType} leaderboard role:\n\n**${position}${getPositionSuffix(position)} place → @${role.name}**`)
    .setFooter({ text: `Users will automatically receive this role when they reach this position on the ${leaderboardType} leaderboard.` });
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back to Leaderboard Roles').setStyle(ButtonStyle.Primary));
  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleEditLeaderboardRoleModal(interaction, serverId) {
  const positionValue = interaction.fields.getTextInputValue('leaderboard_edit_position_input');
  const oldPosition = interaction.fields.getTextInputValue('leaderboard_old_position_input');
  const roleId = interaction.fields.getTextInputValue('leaderboard_edit_role_input');
  const leaderboardType = interaction.fields.getTextInputValue('leaderboard_edit_type_input');
  const newPosition = parseInt(positionValue);
  const serverConfig = await DatabaseUtils.getServerConfig(serverId);

  if (isNaN(newPosition) || newPosition < 1 || newPosition > 10) {
    await interaction.followUp({ content: '❌ Invalid position value. Please enter a number between 1 and 10.', flags: MessageFlags.Ephemeral });
    return;
  }

  const currentLeaderboardRoles = serverConfig.leaderboard_roles || {};
  const currentTypeRoles = currentLeaderboardRoles[leaderboardType] || {};
  if (currentTypeRoles[newPosition] && newPosition.toString() !== oldPosition) {
    await interaction.followUp({ content: `❌ A role is already configured for ${newPosition}${getPositionSuffix(newPosition)} place in the ${leaderboardType} leaderboard.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const updatedLeaderboardRoles = { ...currentLeaderboardRoles };
  if (!updatedLeaderboardRoles[leaderboardType]) updatedLeaderboardRoles[leaderboardType] = {};
  delete updatedLeaderboardRoles[leaderboardType][oldPosition];
  updatedLeaderboardRoles[leaderboardType][newPosition] = String(roleId);
  await updateServerConfig(serverId, { leaderboard_roles: updatedLeaderboardRoles });

  const role = interaction.guild.roles.cache.get(roleId);
  await logConfigChange(
    interaction,
    'Leaderboard Roles',
    `${oldPosition}${getPositionSuffix(oldPosition)} place → @${role?.name || 'Unknown Role'}`,
    `${newPosition}${getPositionSuffix(newPosition)} place → @${role?.name || 'Unknown Role'}`,
  );

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('✅ Leaderboard Role Updated')
    .setDescription(
      `Successfully updated leaderboard role position:\n\n**${oldPosition}${getPositionSuffix(oldPosition)} place → ${newPosition}${getPositionSuffix(newPosition)} place → @${role?.name || 'Unknown Role'}**`,
    )
    .setFooter({ text: 'Users will automatically receive this role when they reach this position on the leaderboard.' });

  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('← Back to Leaderboard Roles').setStyle(ButtonStyle.Primary));
  await interaction.editReply({ embeds: [embed], components: [row] });
}

module.exports = {
  showLeaderboardRolesConfig,
  showAddLeaderboardRoleModal,
  showLeaderboardRolePositionModal,
  showEditLeaderboardRoleSelect,
  showRemoveLeaderboardRoleSelect,
  showLeaderboardRoleTestResults,
  showClearAllLeaderboardRolesConfirmation,
  clearAllLeaderboardRoles,
  toggleLeaderboardRoleStrategy,
  showEditLeaderboardRoleModal,
  removeLeaderboardRole,
  handleAddLeaderboardRoleModal,
  handleEditLeaderboardRoleModal,
  getPositionSuffix,
};