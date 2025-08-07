const { MessageFlags } = require('discord.js');
const DatabaseUtils = require('../../utils/database');
const { updateInteraction } = require('./ui');
const { showMainConfigMenu } = require('./menus/mainMenu');
const { showVotingConfig } = require('./menus/votingMenu');
const { showPointsConfig } = require('./menus/pointsMenu');
const { showAppearanceConfig } = require('./menus/appearanceMenu');
const { showAdvancedConfig } = require('./menus/advancedMenu');
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

function canHandle(customId) {
  return NAV_IDS.has(customId);
}

async function handleConfigInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  logger.config(`Config interaction: ${interaction.customId} by ${interaction.user.tag}`, 'INTERACTION');
  logger.verbose(`Interaction type: ${interaction.type}${interaction.values ? `, values: ${JSON.stringify(interaction.values)}` : ''}`, 'INTERACTION');

  if (!interaction.member.permissions.has('ManageGuild')) {
    await interaction.reply({
      content: '❌ You need "Manage Server" permission to access the configuration menu.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const message = interaction.message;
  if (message && message.interaction && message.interaction.user.id !== interaction.user.id) {
    await interaction.reply({
      content: '❌ Only the user who ran the `/config` command can use these controls.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const serverId = interaction.guild.id;
  const serverConfig = await DatabaseUtils.getServerConfig(serverId);

  // Allow legacy handler to manage 'custom' select → modal flows during migration
  if (interaction.isStringSelectMenu() && interaction.values && interaction.values[0] === 'custom') {
    return;
  }

  await interaction.deferUpdate();

  try {
    await routeConfigInteraction(interaction, serverConfig, serverId);
  } catch (error) {
    logger.errorWithStack('Error handling config interaction (router)', error, 'CONFIG');
    await updateInteraction(interaction, {
      content: '❌ There was an error updating the configuration. Please try again.',
      components: [],
    });
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
    return;
  }
}

module.exports = { handleConfigInteraction, routeConfigInteraction, canHandle };