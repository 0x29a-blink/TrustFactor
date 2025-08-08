const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { updateInteraction } = require('../ui');

async function showAppearanceConfig(interaction, serverConfig) {
  const embed = new EmbedBuilder()
    .setColor(serverConfig.embed_color || '#5865F2')
    .setTitle('🎨 Appearance Configuration')
    .setDescription('Customize the visual appearance of bot messages')
    .addFields([{ name: 'Embed Color', value: serverConfig.embed_color || '#5865F2', inline: true }])
    .setFooter({ text: 'Customize appearance settings' });

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('config_color_select')
      .setPlaceholder('Choose embed color...')
      .addOptions([
        { label: 'Discord Blue', value: '#5865F2', description: 'Default Discord blue' },
        { label: 'Green', value: '#00ff00', description: 'Success green' },
        { label: 'Red', value: '#ff0000', description: 'Alert red' },
        { label: 'Purple', value: '#9932cc', description: 'Royal purple' },
        { label: 'Orange', value: '#ff8c00', description: 'Vibrant orange' },
        { label: 'Custom...', value: 'custom', description: 'Enter custom hex color' },
      ]),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_back_main').setLabel('← Back').setStyle(ButtonStyle.Primary),
  );

  await updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
}

module.exports = { showAppearanceConfig };