const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { updateInteraction } = require('../ui');

async function showPointsConfig(interaction, serverConfig) {
  const embed = new EmbedBuilder()
    .setColor(serverConfig.embed_color || '#5865F2')
    .setTitle('📊 Points Configuration')
    .setDescription('Configure point limits, vote restrictions, and cooldowns')
    .addFields([
      { name: 'Point Range', value: `${serverConfig.min_points_per_award} to ${serverConfig.max_points_per_award}`, inline: true },
      { name: 'Minimum Vote Size', value: `±${serverConfig.min_vote_magnitude || 1}`, inline: true },
      { name: 'Daily Limit', value: serverConfig.daily_point_limit ? `${serverConfig.daily_point_limit} points` : 'No limit', inline: true },
      { name: 'User Cooldown', value: `${serverConfig.user_cooldown_minutes} minutes`, inline: false },
    ])
    .setFooter({ text: 'Minimum vote size applies to /award and reply voting (not reactions)' });

  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('config_point_range_select')
      .setPlaceholder('Set point range...')
      .addOptions([
        { label: '±5 points', value: '5', description: 'Conservative range (-5 to +5)' },
        { label: '±10 points', value: '10', description: 'Standard range (-10 to +10)' },
        { label: '±25 points', value: '25', description: 'Wide range (-25 to +25)' },
        { label: '±50 points', value: '50', description: 'Very wide range (-50 to +50)' },
        { label: 'Custom...', value: 'custom', description: 'Enter custom min/max values' },
      ]),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('config_min_vote_magnitude_select')
      .setPlaceholder('Set minimum vote size...')
      .addOptions([
        { label: '±1 (allow any)', value: '1', description: 'Allow +1/-1 votes (no restriction)' },
        { label: '±2 minimum', value: '2', description: 'Require at least ±2 points' },
        { label: '±3 minimum', value: '3', description: 'Require at least ±3 points' },
        { label: '±5 minimum', value: '5', description: 'Require at least ±5 points' },
        { label: '±10 minimum', value: '10', description: 'Require at least ±10 points' },
        { label: 'Custom...', value: 'custom', description: 'Enter custom minimum vote size' },
      ]),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('config_daily_limit_select')
      .setPlaceholder('Set daily point limit...')
      .addOptions([
        { label: 'No limit', value: 'none', description: 'Unlimited daily points' },
        { label: '50 points/day', value: '50', description: 'Conservative daily limit' },
        { label: '100 points/day', value: '100', description: 'Standard daily limit' },
        { label: '250 points/day', value: '250', description: 'High daily limit' },
        { label: 'Custom...', value: 'custom', description: 'Enter custom daily limit' },
      ]),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('config_cooldown_select')
      .setPlaceholder('Set user cooldown...')
      .addOptions([
        { label: 'No cooldown', value: '0', description: 'Users can award immediately' },
        { label: '15 minutes', value: '15', description: 'Short cooldown' },
        { label: '30 minutes', value: '30', description: 'Medium cooldown' },
        { label: '60 minutes', value: '60', description: 'Standard cooldown' },
        { label: '2 hours', value: '120', description: 'Long cooldown' },
        { label: 'Custom...', value: 'custom', description: 'Enter custom value' },
      ]),
  );

  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_points_next').setLabel('➡️ Next Section').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_back_main').setLabel('← Back to Main').setStyle(ButtonStyle.Primary),
  );

  await updateInteraction(interaction, { embeds: [embed], components: [row1, row2, row3, row4, row5] });
}

module.exports = { showPointsConfig };