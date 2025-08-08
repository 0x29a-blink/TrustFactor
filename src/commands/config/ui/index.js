const { MessageFlags } = require('discord.js');
const logger = require('../../../utils/logger');

async function updateInteraction(interaction, options) {
  try {
    if (interaction.deferred) {
      await interaction.editReply(options);
    } else if (interaction.replied) {
      await interaction.editReply(options);
    } else {
      await interaction.reply(options);
    }
  } catch (error) {
    logger.errorWithStack('Error updating interaction', error, 'CONFIG');
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ There was an error updating the interface. Please try again.',
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.followUp({
          content: '❌ There was an error updating the interface. Please try again.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (fallbackError) {
      logger.errorWithStack('Error sending fallback error message', fallbackError, 'CONFIG');
    }
  }
}

module.exports = { updateInteraction };