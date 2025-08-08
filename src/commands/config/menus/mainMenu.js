const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getServerSyncStatus, isServerPriority } = require('../../../utils/syncUtils');
const DatabaseUtils = require('../../../utils/database');
const { updateInteraction } = require('../ui');

async function showMainConfigMenu(interaction, serverConfig) {
  const customReactions = await DatabaseUtils.getCustomReactions(interaction.guild.id);
  const reactionCount = customReactions.length;

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
        inline: true,
      },
      {
        name: '📊 Point Settings',
        value: `Range: ${serverConfig.min_points_per_award} to ${serverConfig.max_points_per_award}\nMin Vote Size: ±${serverConfig.min_vote_magnitude || 1}\nDaily Limit: ${serverConfig.daily_point_limit || 'None'}\nCooldown: ${serverConfig.user_cooldown_minutes} min`,
        inline: true,
      },
      {
        name: '🤖 Advanced',
        value: `Status: ${serverConfig.is_active ? '✅ Active' : '❌ Inactive'}\nLog Channel: ${serverConfig.log_channel ? 'Set' : 'None'}\nSync Group: ${serverConfig.sync_group || 'None'}\nSuccess Feedback: ${serverConfig.success_feedback ? '✅' : '❌'}\nFailure Feedback: ${serverConfig.failed_feedback ? '✅' : '❌'}`,
        inline: true,
      },
      {
        name: '🎨 Appearance',
        value: `Color: ${serverConfig.embed_color || '#5865F2'}\nTimezone: ${serverConfig.timezone || 'UTC'}`,
        inline: true,
      },
      {
        name: '😀 Reaction Voting',
        value: `Custom Emojis: ${reactionCount}`,
        inline: true,
      },
      {
        name: '🏆 Auto Roles',
        value: `Configured: ${Object.keys(serverConfig.auto_role_thresholds || {}).length} roles`,
        inline: true,
      },
    ])
    .setFooter({ text: 'Select a category to configure specific settings' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_voting').setLabel('🗳️ Voting').setStyle(ButtonStyle.Primary).setDisabled(isInSyncButNotPriority),
    new ButtonBuilder().setCustomId('config_points').setLabel('📊 Points').setStyle(ButtonStyle.Primary).setDisabled(isInSyncButNotPriority),
    new ButtonBuilder().setCustomId('config_advanced').setLabel('🤖 Advanced').setStyle(ButtonStyle.Primary).setDisabled(isInSyncButNotPriority),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_appearance').setLabel('🎨 Appearance').setStyle(ButtonStyle.Secondary).setDisabled(isInSyncButNotPriority),
    new ButtonBuilder().setCustomId('config_reactions').setLabel('😀 Reactions').setStyle(ButtonStyle.Secondary).setDisabled(isInSyncButNotPriority),
    new ButtonBuilder().setCustomId('config_autoroles').setLabel('🏆 Auto Roles').setStyle(ButtonStyle.Secondary).setDisabled(isInSyncButNotPriority),
    new ButtonBuilder().setCustomId('config_leaderboard_roles').setLabel('🥇 Leaderboard Roles').setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Success),
  );

  const components = isInSyncButNotPriority ? [row1, row2, row3] : [row1, row2];
  await updateInteraction(interaction, { embeds: [embed], components });
}

module.exports = { showMainConfigMenu };