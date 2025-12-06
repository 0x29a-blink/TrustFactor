const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../utils/database');
const { getServerSyncStatus, isServerPriority } = require('../utils/syncUtils');
const logger = require('../utils/logger');
const { showMainConfigMenu } = require('./config/menus/mainMenu');
const Router = require('./config/router');

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
      const syncStatus = await getServerSyncStatus(serverId);
      const isPriority = await isServerPriority(serverId);
      if (syncStatus && !isPriority) {
        logger.sync(`Using priority server config for ${serverId}`, 'CONFIG');
        const priorityServerId = syncStatus.sync_groups.priority_server;
        serverConfig = await DatabaseUtils.getServerConfig(priorityServerId);
        serverConfig.original_server_id = serverId;
        serverConfig.is_view_only = true;
      }
      await showMainConfigMenu(interaction, serverConfig);
      logger.command('Config menu displayed successfully', 'CONFIG');
    } catch (error) {
      logger.errorWithStack('Error handling config command', error, 'CONFIG');
      await interaction.reply({ content: '❌ There was an error loading the configuration. Please try again.', flags: MessageFlags.Ephemeral });
    }
  },

  // Delegate all config interactions to the router
  async handleConfigInteraction(interaction) {
    return Router.handleConfigInteraction(interaction);
  },

  // Delegate modal submissions to the router
  async handleModalSubmit(interaction) {
    return Router.handleModalSubmit(interaction);
  },
};
