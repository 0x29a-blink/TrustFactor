const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

async function showCustomThresholdModal(interaction) {
  const modal = new ModalBuilder().setCustomId('config_custom_threshold_modal').setTitle('Set Custom Voting Threshold');
  const input = new TextInputBuilder()
    .setCustomId('threshold_input')
    .setLabel('Voting Threshold')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter number of votes required (1-50)')
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showCustomTimeoutModal(interaction) {
  const modal = new ModalBuilder().setCustomId('config_custom_timeout_modal').setTitle('Set Custom Voting Timeout');
  const input = new TextInputBuilder()
    .setCustomId('timeout_input')
    .setLabel('Voting Timeout (minutes)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter timeout in minutes (1-1440)')
    .setMinLength(1)
    .setMaxLength(4)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showCustomCooldownModal(interaction) {
  const modal = new ModalBuilder().setCustomId('config_custom_cooldown_modal').setTitle('Set Custom User Cooldown');
  const input = new TextInputBuilder()
    .setCustomId('cooldown_input')
    .setLabel('User Cooldown (minutes)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter cooldown in minutes (0-1440)')
    .setMinLength(1)
    .setMaxLength(4)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showCustomColorModal(interaction) {
  const modal = new ModalBuilder().setCustomId('config_custom_color_modal').setTitle('Set Custom Embed Color');
  const input = new TextInputBuilder()
    .setCustomId('color_input')
    .setLabel('Hex Color Code')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter hex color (e.g., #ff0000, #00ff00)')
    .setMinLength(4)
    .setMaxLength(7)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showCustomPointRangeModal(interaction) {
  const modal = new ModalBuilder().setCustomId('config_custom_point_range_modal').setTitle('Set Custom Point Range');
  const min = new TextInputBuilder()
    .setCustomId('min_points_input')
    .setLabel('Minimum Points (negative number)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter minimum points (e.g., -25)')
    .setMinLength(1)
    .setMaxLength(4)
    .setRequired(true);
  const max = new TextInputBuilder()
    .setCustomId('max_points_input')
    .setLabel('Maximum Points (positive number)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter maximum points (e.g., 25)')
    .setMinLength(1)
    .setMaxLength(4)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(min), new ActionRowBuilder().addComponents(max));
  await interaction.showModal(modal);
}

async function showCustomDailyLimitModal(interaction) {
  const modal = new ModalBuilder().setCustomId('config_custom_daily_limit_modal').setTitle('Set Custom Daily Point Limit');
  const input = new TextInputBuilder()
    .setCustomId('daily_limit_input')
    .setLabel('Daily Point Limit')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter daily limit (0 for no limit)')
    .setMinLength(1)
    .setMaxLength(4)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showCustomMinVoteMagnitudeModal(interaction, currentMax) {
  const modal = new ModalBuilder().setCustomId('config_custom_min_vote_magnitude_modal').setTitle('Set Custom Minimum Vote Size');
  const input = new TextInputBuilder()
    .setCustomId('min_vote_magnitude_input')
    .setLabel('Minimum Vote Magnitude (±)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`Enter minimum (1-${currentMax})`)
    .setMinLength(1)
    .setMaxLength(3)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showCustomLogChannelModal(interaction) {
  const modal = new ModalBuilder().setCustomId('config_custom_log_channel_modal').setTitle('Set Custom Log Channel');
  const input = new TextInputBuilder()
    .setCustomId('log_channel_input')
    .setLabel('Discord Channel ID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter Discord channel ID (e.g., 123456789012345678)')
    .setRequired(true)
    .setMinLength(17)
    .setMaxLength(20);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showCustomFormulaBaseModal(interaction) {
  const modal = new ModalBuilder().setCustomId('config_custom_formula_base_modal').setTitle('Set Custom Formula Base');
  const input = new TextInputBuilder()
    .setCustomId('formula_base_input')
    .setLabel('Formula Base Threshold')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter base threshold (1-20)')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(2);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function showCustomFormulaMultiplierModal(interaction) {
  const modal = new ModalBuilder().setCustomId('config_custom_formula_multiplier_modal').setTitle('Set Custom Formula Multiplier');
  const input = new TextInputBuilder()
    .setCustomId('formula_multiplier_input')
    .setLabel('Formula Multiplier')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter multiplier (0.1-5.0, e.g., 1.5)')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(4);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

module.exports = {
  showCustomThresholdModal,
  showCustomTimeoutModal,
  showCustomCooldownModal,
  showCustomColorModal,
  showCustomPointRangeModal,
  showCustomDailyLimitModal,
  showCustomMinVoteMagnitudeModal,
  showCustomLogChannelModal,
  showCustomFormulaBaseModal,
  showCustomFormulaMultiplierModal,
};