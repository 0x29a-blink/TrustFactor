const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { updateInteraction } = require('../ui');

async function showVotingConfig(interaction, serverConfig) {
  const embed = new EmbedBuilder()
    .setColor(serverConfig.embed_color || '#5865F2')
    .setTitle('🗳️ Voting Configuration');

  if (serverConfig.threshold_mode === 'formula') {
    embed
      .setDescription('**Mode: Dynamic Threshold** - Voting requirements calculated using formula: Base + (Point Value × Multiplier)')
      .addFields([
        { name: 'Current Threshold', value: `Formula-based (base: ${serverConfig.formula_base || 2}, mult: ${serverConfig.formula_multiplier || 1}x)`, inline: true },
        { name: 'Voting Timeout', value: `${serverConfig.voting_timeout} minutes`, inline: true },
        { name: 'Formula Preview', value: `For 5 points: ${Math.ceil((serverConfig.formula_base || 2) + (5 * (serverConfig.formula_multiplier || 1)))} votes needed`, inline: true },
        { name: 'Reaction Mode', value: serverConfig.reaction_mode ? '✅ Enabled (vote with 👍/👎)' : '❌ Disabled (vote with buttons)', inline: true },
        { name: 'Auto-Approval', value: serverConfig.auto_approval !== false ? '✅ Enabled (proposers automatically approve their own proposals)' : '❌ Disabled (proposers must wait for others to vote)', inline: true },
      ]);
  } else {
    embed
      .setDescription('**Mode: Fixed Threshold** - A set number of votes required for all proposals')
      .addFields([
        { name: 'Current Threshold', value: `${serverConfig.threshold} votes required`, inline: true },
        { name: 'Voting Timeout', value: `${serverConfig.voting_timeout} minutes`, inline: true },
        { name: 'Reaction Mode', value: serverConfig.reaction_mode ? '✅ Enabled (vote with 👍/👎)' : '❌ Disabled (vote with buttons)', inline: true },
        { name: 'Auto-Approval', value: serverConfig.auto_approval !== false ? '✅ Enabled (proposers automatically approve their own proposals)' : '❌ Disabled (proposers must wait for others to vote)', inline: true },
      ]);
  }

  const row1 = new ActionRowBuilder();
  if (serverConfig.threshold_mode === 'formula') {
    row1.addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('config_formula_base_select')
        .setPlaceholder('Set formula base...')
        .addOptions([
          { label: '1 (Minimum)', value: '1', description: 'Base threshold of 1' },
          { label: '2 (Standard)', value: '2', description: 'Base threshold of 2' },
          { label: '3 (Moderate)', value: '3', description: 'Base threshold of 3' },
          { label: 'Custom...', value: 'custom', description: 'Enter custom base value' },
        ]),
    );
  } else {
    row1.addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('config_threshold_select')
        .setPlaceholder('Set voting threshold...')
        .addOptions([
          { label: '1 vote', value: '1', description: 'Minimal threshold' },
          { label: '2 votes', value: '2', description: 'Light moderation' },
          { label: '3 votes', value: '3', description: 'Standard threshold' },
          { label: '4 votes', value: '4', description: 'Moderate threshold' },
          { label: '5 votes', value: '5', description: 'High threshold' },
          { label: 'Custom...', value: 'custom', description: 'Enter custom value' },
        ]),
    );
  }

  const row2 = new ActionRowBuilder();
  if (serverConfig.threshold_mode === 'formula') {
    row2.addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('config_formula_multiplier_select')
        .setPlaceholder('Set formula multiplier...')
        .addOptions([
          { label: '0.5x (Half)', value: '0.5', description: 'Half point value' },
          { label: '1x (Equal)', value: '1', description: 'Equal to point value' },
          { label: '1.5x (Higher)', value: '1.5', description: '1.5x point value' },
          { label: '2x (Double)', value: '2', description: 'Double point value' },
          { label: 'Custom...', value: 'custom', description: 'Enter custom multiplier' },
        ]),
    );
  } else {
    row2.addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('config_timeout_select')
        .setPlaceholder('Set voting timeout...')
        .addOptions([
          { label: '5 minutes', value: '5', description: 'Quick voting' },
          { label: '15 minutes', value: '15', description: 'Standard timeout' },
          { label: '30 minutes', value: '30', description: 'Extended voting' },
          { label: '60 minutes', value: '60', description: 'Long voting period' },
          { label: '2 hours', value: '120', description: 'Very long period' },
          { label: 'Custom...', value: 'custom', description: 'Enter custom value' },
        ]),
    );
  }

  const row3 = new ActionRowBuilder();
  if (serverConfig.threshold_mode === 'formula') {
    row3.addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('config_timeout_select')
        .setPlaceholder('Set voting timeout...')
        .addOptions([
          { label: '5 minutes', value: '5', description: 'Quick voting' },
          { label: '15 minutes', value: '15', description: 'Standard timeout' },
          { label: '30 minutes', value: '30', description: 'Extended voting' },
          { label: '60 minutes', value: '60', description: 'Long voting period' },
          { label: '2 hours', value: '120', description: 'Very long period' },
          { label: 'Custom...', value: 'custom', description: 'Enter custom value' },
        ]),
    );
  } else {
    row3.addComponents(
      new ButtonBuilder().setCustomId('config_threshold_mode_toggle').setLabel('Switch to Dynamic').setStyle(ButtonStyle.Secondary).setEmoji('📊'),
      new ButtonBuilder()
        .setCustomId('config_reaction_mode_toggle')
        .setLabel(`Reactions: ${serverConfig.reaction_mode ? 'ON' : 'OFF'}`)
        .setStyle(serverConfig.reaction_mode ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji(serverConfig.reaction_mode ? '👍' : '🔘'),
      new ButtonBuilder()
        .setCustomId('config_auto_approval_toggle')
        .setLabel(`Auto-Approval: ${serverConfig.auto_approval !== false ? 'ON' : 'OFF'}`)
        .setStyle(serverConfig.auto_approval !== false ? ButtonStyle.Success : ButtonStyle.Danger)
        .setEmoji('⚡'),
    );
  }

  const row4 = new ActionRowBuilder();
  if (serverConfig.threshold_mode === 'formula') {
    row4.addComponents(
      new ButtonBuilder().setCustomId('config_threshold_mode_toggle').setLabel('Switch to Fixed').setStyle(ButtonStyle.Primary).setEmoji('🔢'),
      new ButtonBuilder()
        .setCustomId('config_reaction_mode_toggle')
        .setLabel(`Reactions: ${serverConfig.reaction_mode ? 'ON' : 'OFF'}`)
        .setStyle(serverConfig.reaction_mode ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji(serverConfig.reaction_mode ? '👍' : '🔘'),
      new ButtonBuilder()
        .setCustomId('config_auto_approval_toggle')
        .setLabel(`Auto-Approval: ${serverConfig.auto_approval !== false ? 'ON' : 'OFF'}`)
        .setStyle(serverConfig.auto_approval !== false ? ButtonStyle.Success : ButtonStyle.Danger)
        .setEmoji('⚡'),
    );
  } else {
    row4.addComponents(new ButtonBuilder().setCustomId('config_back_main').setLabel('← Back to Main').setStyle(ButtonStyle.Primary));
  }

  const row5 = new ActionRowBuilder();
  if (serverConfig.threshold_mode === 'formula') {
    row5.addComponents(new ButtonBuilder().setCustomId('config_back_main').setLabel('← Back to Main').setStyle(ButtonStyle.Primary));
  }

  const components = serverConfig.threshold_mode === 'formula' ? [row1, row2, row3, row4, row5] : [row1, row2, row3, row4];
  await updateInteraction(interaction, { embeds: [embed], components });
}

module.exports = { showVotingConfig };