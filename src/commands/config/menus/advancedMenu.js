const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { updateInteraction } = require('../ui');

async function showAdvancedConfig(interaction, serverConfig) {
  const embed = new EmbedBuilder()
    .setColor(serverConfig.embed_color || '#5865F2')
    .setTitle('🤖 Advanced Configuration')
    .setDescription('Configure advanced bot settings, logging, and feedback options')
    .addFields([
      { name: 'Log Channel', value: serverConfig.log_channel ? `<#${serverConfig.log_channel}>` : 'Not set', inline: true },
      { name: 'Bot Active', value: serverConfig.is_active ? '✅ Active' : '❌ Inactive', inline: true },
      { name: 'Sync Group Display', value: serverConfig.sync_group || 'None', inline: true },
      { name: 'Success Message', value: serverConfig.success_feedback ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: 'Failure Message', value: serverConfig.failed_feedback ? '✅ Enabled' : '❌ Disabled', inline: true },
    ])
    .setFooter({ text: 'Configure advanced settings and feedback options' });

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('config_log_channel_select')
      .setPlaceholder('Set log channel...')
      .addOptions([
        { label: 'Disable logging', value: 'none', description: 'Turn off audit logging' },
        { label: 'Current channel', value: 'current', description: 'Use this channel for logs' },
        { label: 'Custom channel...', value: 'custom', description: 'Enter channel ID manually' },
      ]),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_bot_status_toggle').setLabel(`Bot Active: ${serverConfig.is_active ? 'ON' : 'OFF'}`).setStyle(serverConfig.is_active ? ButtonStyle.Success : ButtonStyle.Danger).setEmoji('🤖'),
    new ButtonBuilder().setCustomId('config_success_feedback_toggle').setLabel(`Success Message: ${serverConfig.success_feedback ? 'ON' : 'OFF'}`).setStyle(serverConfig.success_feedback ? ButtonStyle.Success : ButtonStyle.Danger).setEmoji('✅'),
    new ButtonBuilder().setCustomId('config_failed_feedback_toggle').setLabel(`Failure Message: ${serverConfig.failed_feedback ? 'ON' : 'OFF'}`).setStyle(serverConfig.failed_feedback ? ButtonStyle.Success : ButtonStyle.Danger).setEmoji('❌'),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_back_main').setLabel('← Back').setStyle(ButtonStyle.Primary),
  );

  await updateInteraction(interaction, { embeds: [embed], components: [row1, row2, row3] });
}

module.exports = { showAdvancedConfig };