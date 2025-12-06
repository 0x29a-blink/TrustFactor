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
const AutoRoles = require('./features/autoRoles');
const Reactions = require('./features/reactions');
const Blocked = require('./features/blockedChannels');
const Leaderboard = require('./features/leaderboardRoles');
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
  // features
  'config_autoroles',
  'config_reactions',
  'config_blocked_channels',
  'config_leaderboard_roles',
]);

const SIMPLE_SELECTS = {
  config_threshold_select: { condition: (v) => v !== 'custom', update: (v) => ({ threshold: parseInt(v) }), view: showVotingConfig },
  config_timeout_select: { condition: (v) => v !== 'custom', update: (v) => ({ voting_timeout: parseInt(v) }), view: showVotingConfig },
  config_formula_base_select: { condition: (v) => v !== 'custom', update: (v) => ({ formula_base: parseInt(v) }), view: showVotingConfig },
  config_formula_multiplier_select: { condition: (v) => v !== 'custom', update: (v) => ({ formula_multiplier: parseFloat(v) }), view: showVotingConfig },
  config_point_range_select: { condition: (v) => v !== 'custom', update: (v) => { const r = parseInt(v); return { min_points_per_award: -r, max_points_per_award: r }; }, view: showPointsConfig },
  config_min_vote_magnitude_select: { condition: (v) => v !== 'custom', update: (v) => ({ min_vote_magnitude: parseInt(v) }), view: showPointsConfig },
  config_cooldown_select: { condition: (v) => v !== 'custom', update: (v) => ({ user_cooldown_minutes: parseInt(v) }), view: showPointsConfig },
  config_color_select: { condition: (v) => v !== 'custom', update: (v) => ({ embed_color: v }), view: showAppearanceConfig },
};

const TOGGLE_IDS = new Set([
  'config_threshold_mode_toggle',
  'config_reaction_mode_toggle',
  'config_auto_approval_toggle',
  'config_bot_status_toggle',
  'config_success_feedback_toggle',
  'config_failed_feedback_toggle',
]);

const ACTION_HANDLERS = {
  // Feature routing
  config_autoroles: (i, c) => AutoRoles.showAutoRolesConfig(i, c),
  config_reactions: (i, c) => Reactions.showReactionConfig(i, c),
  config_blocked_channels: (i, c) => Blocked.showBlockedChannelsConfig(i, c),
  config_leaderboard_roles: (i, c) => Leaderboard.showLeaderboardRolesConfig(i, c),

  // AutoRoles actions
  config_autoroles_add: (i) => AutoRoles.showAddAutoRoleModal(i),
  config_autoroles_edit: (i, c) => AutoRoles.showEditAutoRoleSelect(i, c),
  config_autoroles_remove: (i, c) => AutoRoles.showRemoveAutoRoleSelect(i, c),
  config_autoroles_test: (i, c) => AutoRoles.showAutoRoleTestResults(i, c),
  config_autoroles_clear_all: (i, c) => AutoRoles.showClearAllAutoRolesConfirmation(i, c),
  config_autoroles_confirm_clear: (i, c) => AutoRoles.clearAllAutoRoles(i, c),
  config_autoroles_cancel_clear: (i, c) => AutoRoles.showAutoRolesConfig(i, c),

  // Reactions actions
  config_reactions_add: (i) => Reactions.startEmojiAddProcess(i),
  config_reactions_edit: (i, c) => Reactions.showEditReactionSelect(i, c),
  config_reactions_remove: (i, c) => Reactions.showRemoveReactionSelect(i, c),
  config_reactions_defaults: (i, c) => Reactions.showDefaultReactionsPreview(i, c),
  config_reactions_confirm_defaults: (i, c) => Reactions.setupDefaultReactions(i, c),
  config_reactions_cancel_defaults: (i, c) => Reactions.showReactionConfig(i, c),
  config_reactions_clear: (i) => Reactions.showClearAllReactionsConfirmation(i),
  config_reactions_confirm_clear: (i) => Reactions.clearAllReactions(i),
  config_reactions_cancel_clear: (i, c) => Reactions.showReactionConfig(i, c),
  config_reactions_cancel_add: (i) => Reactions.handleEmojiAddCancel(i),
  config_reaction_remove_select: (i, c) => {
    const emoji = i.values[0];
    return Reactions.removeReaction(i, c, emoji);
  },

  // Blocked Channels actions
  config_blocked_channels_remove: (i, c) => Blocked.showRemoveBlockedChannelSelect(i, c),
  config_blocked_channels_clear: (i, c) => Blocked.showClearAllBlockedChannelsConfirmation(i, c),
  config_blocked_channels_clear_confirm: (i, c) => Blocked.clearAllBlockedChannels(i, c),
  config_blocked_channels_cancel_clear: (i, c) => Blocked.showBlockedChannelsConfig(i, c),
  config_blocked_channels_cancel_add: (i, c) => Blocked.showBlockedChannelsConfig(i, c),
  config_blocked_channels_remove_select: (i, c) => {
    const value = i.values[0];
    return Blocked.removeBlockedChannel(i, c, value);
  },
  config_blocked_channels_add: (i) => Blocked.startBlockedChannelAddProcess(i),

  // Leaderboard roles actions
  config_leaderboard_roles_add_positive: (i) => Leaderboard.showAddLeaderboardRoleModal(i, 'positive'),
  config_leaderboard_roles_add_negative: (i) => Leaderboard.showAddLeaderboardRoleModal(i, 'negative'),
  config_leaderboard_roles_edit: (i, c) => Leaderboard.showEditLeaderboardRoleSelect(i, c),
  config_leaderboard_roles_remove: (i, c) => Leaderboard.showRemoveLeaderboardRoleSelect(i, c),
  config_leaderboard_roles_test: (i, c) => Leaderboard.showLeaderboardRoleTestResults(i, c),
  config_leaderboard_roles_clear_all: (i, c) => Leaderboard.showClearAllLeaderboardRolesConfirmation(i, c),
  config_leaderboard_roles_confirm_clear: (i, c) => Leaderboard.clearAllLeaderboardRoles(i, c),
  config_leaderboard_roles_cancel_clear: (i, c) => Leaderboard.showLeaderboardRolesConfig(i, c),
  config_leaderboard_roles_strategy_positive: (i, c) => Leaderboard.toggleLeaderboardRoleStrategy(i, c, 'positive'),
  config_leaderboard_roles_strategy_negative: (i, c) => Leaderboard.toggleLeaderboardRoleStrategy(i, c, 'negative'),
  config_leaderboard_role_remove_select: (i, c) => {
    const [position, roleId, leaderboardType] = i.values[0].split(':');
    return Leaderboard.removeLeaderboardRole(i, c, position, roleId, leaderboardType);
  },
};

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

  // Pre-deferral modal triggers for selects that open modals
  if (interaction.isStringSelectMenu()) {
    const id = interaction.customId;
    if (id === 'config_reaction_edit_select') {
      const emoji = interaction.values[0];
      await Reactions.showEditReactionModal(interaction, serverConfig, emoji);
      return;
    }
    if (id === 'config_autorole_edit_select') {
      const [threshold, roleId] = interaction.values[0].split(':');
      await AutoRoles.showEditAutoRoleModal(interaction, threshold, roleId);
      return;
    }
    if (id.startsWith('config_leaderboard_role_select_role_')) {
      const leaderboardType = id.split('_').pop();
      const roleId = interaction.values[0];
      await Leaderboard.showLeaderboardRolePositionModal(interaction, roleId, leaderboardType);
      return;
    }
    if (id === 'config_leaderboard_role_edit_select') {
      const [position, roleId, leaderboardType] = interaction.values[0].split(':');
      await Leaderboard.showEditLeaderboardRoleModal(interaction, position, roleId, leaderboardType);
      return;
    }
    if (id === 'config_autorole_select_role') {
      const roleId = interaction.values[0];
      await AutoRoles.showAutoRoleThresholdModal(interaction, roleId);
      return;
    }
  }

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

    // Complex selects with special value handling
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      const val = interaction.values && interaction.values[0];
      if (id === 'config_daily_limit_select' && val && val !== 'custom') {
        const limitToSet = val === 'none' ? null : parseInt(val);
        await updateServerConfig(serverId, { daily_point_limit: limitToSet });
        const updated = await DatabaseUtils.getServerConfig(serverId);
        await showPointsConfig(interaction, updated);
        return;
      }
      if (id === 'config_log_channel_select' && val && val !== 'custom') {
        let channelId = null;
        if (val === 'current') channelId = interaction.channel.id;
        else if (val !== 'none') channelId = val;
        await updateServerConfig(serverId, { log_channel: channelId });
        const updated = await DatabaseUtils.getServerConfig(serverId);
        await showAdvancedConfig(interaction, updated);
        return;
      }
    }

    if (TOGGLE_IDS.has(interaction.customId)) {
      await handleToggles(interaction, serverConfig, serverId);
      return;
    }

    // Feature and action routing via map
    const handler = ACTION_HANDLERS[interaction.customId];
    if (handler) {
      await handler(interaction, serverConfig);
      return;
    }

    // Navigation fallback
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
    // core
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
    // features
    config_edit_reaction_modal: ModalHandlers.handleEditReactionModal,
    config_add_autorole_threshold_modal: ModalHandlers.handleAddAutoRoleModal,
    config_edit_autorole_modal: ModalHandlers.handleEditAutoRoleModal,
  };

  // dynamic leaderboard add
  if (interaction.customId.startsWith('config_add_leaderboard_role_position_modal_')) {
    return ModalHandlers.handleAddLeaderboardRoleModal(interaction, serverId);
  }

  const handler = map[interaction.customId];
  if (handler) {
    await handler(interaction, serverId);
  }
}

module.exports = { handleConfigInteraction, routeConfigInteraction, handleModalSubmit };