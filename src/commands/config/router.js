const { MessageFlags } = require('discord.js');
const DatabaseUtils = require('../../utils/database');
const { updateInteraction } = require('./ui');
const { showMainConfigMenu } = require('./menus/mainMenu');
const { showVotingConfig } = require('./menus/votingMenu');
const { showPointsConfig } = require('./menus/pointsMenu');
const { showAppearanceConfig } = require('./menus/appearanceMenu');
const { showAdvancedConfig } = require('./menus/advancedMenu');
const { updateServerConfig } = require('./services/configService');
const ShowModals = require('./modals/show');
const ModalHandlers = require('./modals/handlers');
const logger = require('../../utils/logger');

const NAV_IDS = new Set([
  'config_voting',
  'config_points',
  'config_appearance',
  'config_advanced',
  'config_points_next',
  'config_appearance_next',
  'config_refresh',
  'config_back_main',
  'config_main',
]);

const SIMPLE_SELECTS = {
  config_threshold_select: {
    condition: (val) => val !== 'custom',
    update: (val) => ({ threshold: parseInt(val) }),
    view: showVotingConfig,
  },
  config_timeout_select: {
    condition: (val) => val !== 'custom',
    update: (val) => ({ voting_timeout: parseInt(val) }),
    view: showVotingConfig,
  },
  config_formula_base_select: {
    condition: (val) => val !== 'custom',
    update: (val) => ({ formula_base: parseInt(val) }),
    view: showVotingConfig,
  },
  config_formula_multiplier_select: {
    condition: (val) => val !== 'custom',
    update: (val) => ({ formula_multiplier: parseFloat(val) }),
    view: showVotingConfig,
  },
  config_point_range_select: {
    condition: (val) => val !== 'custom',
    update: (val) => {
      const range = parseInt(val);
      return { min_points_per_award: -range, max_points_per_award: range };
    },
    view: showPointsConfig,
  },
  config_min_vote_magnitude_select: {
    condition: (val) => val !== 'custom',
    update: (val) => ({ min_vote_magnitude: parseInt(val) }),
    view: showPointsConfig,
  },
  config_cooldown_select: {
    condition: (val) => val !== 'custom',
    update: (val) => ({ user_cooldown_minutes: parseInt(val) }),
    view: showPointsConfig,
  },
  config_color_select: {
    condition: (val) => val !== 'custom',
    update: (val) => ({ embed_color: val }),
    view: showAppearanceConfig,
  },
};

function canHandle(customId) {
  return NAV_IDS.has(customId) || SIMPLE_SELECTS[customId] || TOGGLE_IDS.has(customId) || customId === 'config_log_channel_select';
}

const TOGGLE_IDS = new Set([
  'config_threshold_mode_toggle',
  'config_reaction_mode_toggle',
  'config_auto_approval_toggle',
  'config_bot_status_toggle',
  'config_success_feedback_toggle',
  'config_failed_feedback_toggle',
]);

async function handleConfigInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  logger.config(`Config interaction: ${interaction.customId} by ${interaction.user.tag}`, 'INTERACTION');
  logger.verbose(`Interaction type: ${interaction.type}${interaction.values ? `, values: ${JSON.stringify(interaction.values)}` : ''}`, 'INTERACTION');

  if (!interaction.member.permissions.has('ManageGuild')) {
    await interaction.reply({ content: '❌ You need "Manage Server" permission to access the configuration menu.', flags: MessageFlags.Ephemeral });
    return;
  }

  const message = interaction.message;
  if (message && message.interaction && message.interaction.user.id !== interaction.user.id) {
    await interaction.reply({ content: '❌ Only the user who ran the `/config` command can use these controls.', flags: MessageFlags.Ephemeral });
    return;
  }

  const serverId = interaction.guild.id;
  const serverConfig = await DatabaseUtils.getServerConfig(serverId);

  // Trigger modal on "custom" select values
  if (interaction.isStringSelectMenu() && interaction.values && interaction.values[0] === 'custom') {
    const map = {
      config_threshold_select: () => ShowModals.showCustomThresholdModal(interaction),
      config_timeout_select: () => ShowModals.showCustomTimeoutModal(interaction),
      config_cooldown_select: () => ShowModals.showCustomCooldownModal(interaction),
      config_color_select: () => ShowModals.showCustomColorModal(interaction),
      config_point_range_select: () => ShowModals.showCustomPointRangeModal(interaction),
      config_daily_limit_select: () => ShowModals.showCustomDailyLimitModal(interaction),
      config_min_vote_magnitude_select: () => ShowModals.showCustomMinVoteMagnitudeModal(interaction, serverConfig.max_points_per_award),
      config_log_channel_select: () => ShowModals.showCustomLogChannelModal(interaction),
      config_formula_base_select: () => ShowModals.showCustomFormulaBaseModal(interaction),
      config_formula_multiplier_select: () => ShowModals.showCustomFormulaMultiplierModal(interaction),
    };
    const fn = map[interaction.customId];
    if (fn) {
      await fn();
      return;
    }
  }

  await interaction.deferUpdate();

  try {
    // Simple selects
    const simple = SIMPLE_SELECTS[interaction.customId];
    if (simple && interaction.values) {
      const val = interaction.values[0];
      if (simple.condition(val)) {
        await updateServerConfig(serverId, simple.update(val));
        const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
        await simple.view(interaction, updatedConfig);
        return;
      }
    }

    // Toggles
    if (TOGGLE_IDS.has(interaction.customId)) {
      await handleToggles(interaction, serverConfig, serverId);
      return;
    }

    await routeConfigInteraction(interaction, serverConfig, serverId);
  } catch (error) {
    logger.errorWithStack('Error handling config interaction (router)', error, 'CONFIG');
    await updateInteraction(interaction, { content: '❌ There was an error updating the configuration. Please try again.', components: [] });
  }
}

async function handleToggles(interaction, serverConfig, serverId) {
  const id = interaction.customId;
  if (id === 'config_threshold_mode_toggle') {
    const newMode = serverConfig.threshold_mode === 'formula' ? 'fixed' : 'formula';
    await updateServerConfig(serverId, { threshold_mode: newMode });
    const updated = await DatabaseUtils.getServerConfig(serverId);
    await showVotingConfig(interaction, updated);
    return;
  }
  if (id === 'config_reaction_mode_toggle') {
    const newValue = !serverConfig.reaction_mode;
    await updateServerConfig(serverId, { reaction_mode: newValue });
    const updated = await DatabaseUtils.getServerConfig(serverId);
    await showVotingConfig(interaction, updated);
    return;
  }
  if (id === 'config_auto_approval_toggle') {
    const newValue = serverConfig.auto_approval === false ? true : false;
    await updateServerConfig(serverId, { auto_approval: newValue });
    const updated = await DatabaseUtils.getServerConfig(serverId);
    await showVotingConfig(interaction, updated);
    return;
  }
  if (id === 'config_bot_status_toggle') {
    const newStatus = !serverConfig.is_active;
    await updateServerConfig(serverId, { is_active: newStatus });
    const updated = await DatabaseUtils.getServerConfig(serverId);
    await showAdvancedConfig(interaction, updated);
    return;
  }
  if (id === 'config_success_feedback_toggle') {
    await updateServerConfig(serverId, { success_feedback: !serverConfig.success_feedback });
    const updated = await DatabaseUtils.getServerConfig(serverId);
    await showAdvancedConfig(interaction, updated);
    return;
  }
  if (id === 'config_failed_feedback_toggle') {
    await updateServerConfig(serverId, { failed_feedback: !serverConfig.failed_feedback });
    const updated = await DatabaseUtils.getServerConfig(serverId);
    await showAdvancedConfig(interaction, updated);
    return;
  }
}

async function routeConfigInteraction(interaction, serverConfig, serverId) {
  const navigationHandlers = {
    config_voting: () => showVotingConfig(interaction, serverConfig),
    config_points: () => showPointsConfig(interaction, serverConfig),
    config_appearance: () => showAppearanceConfig(interaction, serverConfig),
    config_advanced: () => showAdvancedConfig(interaction, serverConfig),
    config_points_next: () => showAppearanceConfig(interaction, serverConfig),
    config_appearance_next: () => showAdvancedConfig(interaction, serverConfig),
  };

  if (['config_refresh', 'config_back_main', 'config_main'].includes(interaction.customId)) {
    const updatedConfig = await DatabaseUtils.getServerConfig(serverId);
    await showMainConfigMenu(interaction, updatedConfig);
    return;
  }

  const navigationHandler = navigationHandlers[interaction.customId];
  if (navigationHandler) {
    await navigationHandler();
  }
}

async function handleModalSubmit(interaction) {
  const serverId = interaction.guild.id;
  await interaction.deferUpdate();

  const map = {
    config_custom_threshold_modal: ModalHandlers.handleThresholdModal,
    config_custom_timeout_modal: ModalHandlers.handleTimeoutModal,
    config_custom_cooldown_modal: ModalHandlers.handleCooldownModal,
    config_custom_color_modal: ModalHandlers.handleColorModal,
    config_custom_point_range_modal: ModalHandlers.handlePointRangeModal,
    config_custom_daily_limit_modal: ModalHandlers.handleDailyLimitModal,
    config_custom_min_vote_magnitude_modal: ModalHandlers.handleMinVoteMagnitudeModal,
    config_custom_log_channel_modal: ModalHandlers.handleLogChannelModal,
    config_custom_formula_base_modal: ModalHandlers.handleFormulaBaseModal,
    config_custom_formula_multiplier_modal: ModalHandlers.handleFormulaMultiplierModal,
  };
  const handler = map[interaction.customId];
  if (handler) {
    await handler(interaction, serverId);
  }
}

module.exports = { handleConfigInteraction, routeConfigInteraction, canHandle, handleModalSubmit };