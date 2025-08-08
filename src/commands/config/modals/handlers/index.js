const { MessageFlags } = require('discord.js');
const DatabaseUtils = require('../../../../utils/database');
const { updateServerConfig } = require('../../services/configService');

async function handleThresholdModal(interaction, serverId) {
  const value = interaction.fields.getTextInputValue('threshold_input');
  const threshold = parseInt(value);
  if (isNaN(threshold) || threshold < 1 || threshold > 50) {
    await interaction.followUp({ content: '❌ Invalid threshold value. Enter 1-50.', flags: MessageFlags.Ephemeral });
    return;
  }
  await updateServerConfig(serverId, { threshold });
  const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
  const { showVotingConfig } = require('../../menus/votingMenu');
  await showVotingConfig(interaction, updatedConfig);
}

async function handleTimeoutModal(interaction, serverId) {
  const value = interaction.fields.getTextInputValue('timeout_input');
  const timeout = parseInt(value);
  if (isNaN(timeout) || timeout < 1 || timeout > 1440) {
    await interaction.followUp({ content: '❌ Invalid timeout. Enter 1-1440 minutes.', flags: MessageFlags.Ephemeral });
    return;
  }
  await updateServerConfig(serverId, { voting_timeout: timeout });
  const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
  const { showVotingConfig } = require('../../menus/votingMenu');
  await showVotingConfig(interaction, updatedConfig);
}

async function handleCooldownModal(interaction, serverId) {
  const value = interaction.fields.getTextInputValue('cooldown_input');
  const cooldown = parseInt(value);
  if (isNaN(cooldown) || cooldown < 0 || cooldown > 1440) {
    await interaction.followUp({ content: '❌ Invalid cooldown. Enter 0-1440 minutes.', flags: MessageFlags.Ephemeral });
    return;
  }
  await updateServerConfig(serverId, { user_cooldown_minutes: cooldown });
  const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
  const { showPointsConfig } = require('../../menus/pointsMenu');
  await showPointsConfig(interaction, updatedConfig);
}

async function handleColorModal(interaction, serverId) {
  const colorValue = interaction.fields.getTextInputValue('color_input').trim();
  const hexColorRegex = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
  if (!hexColorRegex.test(colorValue)) {
    await interaction.followUp({ content: '❌ Invalid color. Use #rrggbb or rrr.', flags: MessageFlags.Ephemeral });
    return;
  }
  const formatted = colorValue.startsWith('#') ? colorValue : `#${colorValue}`;
  await updateServerConfig(serverId, { embed_color: formatted });
  const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
  const { showAppearanceConfig } = require('../../menus/appearanceMenu');
  await showAppearanceConfig(interaction, updatedConfig);
}

async function handlePointRangeModal(interaction, serverId) {
  const minValue = interaction.fields.getTextInputValue('min_points_input');
  const maxValue = interaction.fields.getTextInputValue('max_points_input');
  const minPoints = parseInt(minValue);
  const maxPoints = parseInt(maxValue);
  if (isNaN(minPoints) || isNaN(maxPoints) || minPoints >= 0 || maxPoints <= 0 || minPoints >= maxPoints) {
    await interaction.followUp({ content: '❌ Invalid range. Min negative, max positive, and min < max.', flags: MessageFlags.Ephemeral });
    return;
  }
  await updateServerConfig(serverId, { min_points_per_award: minPoints, max_points_per_award: maxPoints });
  const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
  const { showPointsConfig } = require('../../menus/pointsMenu');
  await showPointsConfig(interaction, updatedConfig);
}

async function handleDailyLimitModal(interaction, serverId) {
  const value = interaction.fields.getTextInputValue('daily_limit_input');
  const dailyLimit = parseInt(value);
  if (isNaN(dailyLimit) || dailyLimit < 0) {
    await interaction.followUp({ content: '❌ Invalid daily limit. Enter >= 0.', flags: MessageFlags.Ephemeral });
    return;
  }
  const limitToSet = dailyLimit === 0 ? null : dailyLimit;
  await updateServerConfig(serverId, { daily_point_limit: limitToSet });
  const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
  const { showPointsConfig } = require('../../menus/pointsMenu');
  await showPointsConfig(interaction, updatedConfig);
}

async function handleMinVoteMagnitudeModal(interaction, serverId) {
  const value = interaction.fields.getTextInputValue('min_vote_magnitude_input');
  const magnitude = parseInt(value);
  const current = await DatabaseUtils.getServerConfig(serverId);
  if (isNaN(magnitude) || magnitude < 1) {
    await interaction.followUp({ content: '❌ Invalid minimum vote magnitude. Enter >= 1.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (magnitude > current.max_points_per_award) {
    await interaction.followUp({ content: `❌ Minimum cannot exceed max points per award (${current.max_points_per_award}).`, flags: MessageFlags.Ephemeral });
    return;
  }
  const maxAllowed = Math.max(current.max_points_per_award, Math.abs(current.min_points_per_award));
  if (magnitude > maxAllowed) {
    await interaction.followUp({ content: `❌ Minimum cannot exceed ±${maxAllowed}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await updateServerConfig(serverId, { min_vote_magnitude: magnitude });
  const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
  const { showPointsConfig } = require('../../menus/pointsMenu');
  await showPointsConfig(interaction, updatedConfig);
}

async function handleLogChannelModal(interaction, serverId) {
  const value = interaction.fields.getTextInputValue('log_channel_input');
  const channelIdRegex = /^\d{17,20}$/;
  if (!channelIdRegex.test(value)) {
    await interaction.followUp({ content: '❌ Invalid channel ID. 17-20 digits.', flags: MessageFlags.Ephemeral });
    return;
  }
  await updateServerConfig(serverId, { log_channel: value });
  const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
  const { showAdvancedConfig } = require('../../menus/advancedMenu');
  await showAdvancedConfig(interaction, updatedConfig);
}

async function handleFormulaBaseModal(interaction, serverId) {
  const value = interaction.fields.getTextInputValue('formula_base_input');
  const base = parseInt(value);
  if (isNaN(base) || base < 1 || base > 20) {
    await interaction.followUp({ content: '❌ Invalid base. Enter 1-20.', flags: MessageFlags.Ephemeral });
    return;
  }
  await updateServerConfig(serverId, { formula_base: base });
  const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
  const { showVotingConfig } = require('../../menus/votingMenu');
  await showVotingConfig(interaction, updatedConfig);
}

async function handleFormulaMultiplierModal(interaction, serverId) {
  const value = interaction.fields.getTextInputValue('formula_multiplier_input');
  const multiplier = parseFloat(value);
  if (isNaN(multiplier) || multiplier < 0.1 || multiplier > 5.0) {
    await interaction.followUp({ content: '❌ Invalid multiplier. Enter 0.1-5.0.', flags: MessageFlags.Ephemeral });
    return;
  }
  await updateServerConfig(serverId, { formula_multiplier: multiplier });
  const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
  const { showVotingConfig } = require('../../menus/votingMenu');
  await showVotingConfig(interaction, updatedConfig);
}

module.exports = {
  handleThresholdModal,
  handleTimeoutModal,
  handleCooldownModal,
  handleColorModal,
  handlePointRangeModal,
  handleDailyLimitModal,
  handleMinVoteMagnitudeModal,
  handleLogChannelModal,
  handleFormulaBaseModal,
  handleFormulaMultiplierModal,
};