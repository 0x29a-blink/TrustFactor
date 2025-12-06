const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../../../utils/database');
const logger = require('../../../utils/logger');
const { updateInteraction } = require('../ui');

async function showReactionConfig(interaction, serverConfig) {
  try {
    const customReactions = await DatabaseUtils.getCustomReactions(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(serverConfig.embed_color || '#5865F2')
      .setTitle('😀 Reaction-Based Voting Configuration')
      .setDescription('Configure emoji reactions that award points directly when used on messages.')
      .addFields(
        {
          name: '📋 Current Custom Reactions',
          value: customReactions.length > 0 ? customReactions.map((r) => `${r.emoji} → ${r.point_value > 0 ? '+' : ''}${r.point_value} points`).join('\n') : 'No custom reactions configured',
          inline: false,
        },
        {
          name: '🎯 How It Works',
          value: '• Users react to messages with configured emojis\n• Points are awarded based on emoji values\n• Voting thresholds still apply\n• Bypasses max point limits per award',
          inline: false,
        },
      )
      .setFooter({ text: 'Manage your custom reaction emojis below' });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('config_reactions_add').setLabel('➕ Add Emoji').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('config_reactions_edit').setLabel('✏️ Edit Emoji').setStyle(ButtonStyle.Primary).setDisabled(customReactions.length === 0),
      new ButtonBuilder().setCustomId('config_reactions_remove').setLabel('🗑️ Remove Emoji').setStyle(ButtonStyle.Danger).setDisabled(customReactions.length === 0),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('config_reactions_defaults').setLabel('🔍 Preview Defaults').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('config_reactions_clear').setLabel('🧹 Clear All').setStyle(ButtonStyle.Danger).setDisabled(customReactions.length === 0),
      new ButtonBuilder().setCustomId('config_blocked_channels').setLabel('🚫 Blocked Channels').setStyle(ButtonStyle.Secondary),
    );

    const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_main').setLabel('← Back to Main').setStyle(ButtonStyle.Primary));

    await updateInteraction(interaction, { embeds: [embed], components: [row1, row2, row3] });
  } catch (error) {
    logger.errorWithStack('Error showing reaction config', error, 'REACTIONS');
    await updateInteraction(interaction, { content: '❌ Error loading reaction configuration. Please try again.', components: [] });
  }
}

async function showEditReactionModal(interaction, serverConfig, emoji) {
  try {
    const currentReaction = await DatabaseUtils.getCustomReaction(interaction.guild.id, emoji);
    const currentPoints = currentReaction ? currentReaction.point_value : 0;
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

    const modal = new ModalBuilder().setCustomId('config_edit_reaction_modal').setTitle('Edit Reaction Point Value');
    const emojiInput = new TextInputBuilder().setCustomId('reaction_emoji_input').setLabel('Emoji (read-only)').setStyle(TextInputStyle.Short).setValue(emoji).setRequired(false);
    const pointsInput = new TextInputBuilder().setCustomId('reaction_edit_points_input').setLabel('Point Value').setStyle(TextInputStyle.Short).setPlaceholder('Enter point value (e.g., 5, -3, 100)').setValue(currentPoints.toString()).setMinLength(1).setMaxLength(5).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(emojiInput), new ActionRowBuilder().addComponents(pointsInput));
    await interaction.showModal(modal);
  } catch (error) {
    try {
      await interaction.followUp({ content: '❌ Error showing edit dialog. Please try again.', flags: MessageFlags.Ephemeral });
    } catch { /* ignore */ }
  }
}

async function showEditReactionSelect(interaction, serverConfig) {
  try {
    const customReactions = await DatabaseUtils.getCustomReactions(interaction.guild.id);
    if (customReactions.length === 0) {
      await updateInteraction(interaction, { content: '❌ No custom reactions configured to edit.', components: [] });
      return;
    }
    const embed = new EmbedBuilder().setColor(serverConfig.embed_color || '#5865F2').setTitle('✏️ Edit Custom Reaction').setDescription('Select a reaction to edit from the dropdown below.');
    const options = customReactions.map((reaction) => ({ label: `${reaction.emoji} → ${reaction.point_value > 0 ? '+' : ''}${reaction.point_value} points`, value: reaction.emoji, description: 'Edit this reaction\'s point value' }));
    const selectMenu = new StringSelectMenuBuilder().setCustomId('config_reaction_edit_select').setPlaceholder('Choose a reaction to edit').addOptions(options);
    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_reactions').setLabel('← Back to Reactions').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
  } catch (error) {
    await updateInteraction(interaction, { content: '❌ Error loading reactions. Please try again.', components: [] });
  }
}

async function showRemoveReactionSelect(interaction, serverConfig) {
  try {
    const customReactions = await DatabaseUtils.getCustomReactions(interaction.guild.id);
    if (customReactions.length === 0) {
      await updateInteraction(interaction, { content: '❌ No custom reactions configured to remove.', components: [] });
      return;
    }
    const embed = new EmbedBuilder().setColor(serverConfig.embed_color || '#5865F2').setTitle('🗑️ Remove Custom Reaction').setDescription('Select a reaction to remove from the dropdown below.');
    const options = customReactions.map((reaction) => ({ label: `${reaction.emoji} → ${reaction.point_value > 0 ? '+' : ''}${reaction.point_value} points`, value: reaction.emoji, description: 'Remove this reaction' }));
    const selectMenu = new StringSelectMenuBuilder().setCustomId('config_reaction_remove_select').setPlaceholder('Choose a reaction to remove').addOptions(options);
    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_reactions').setLabel('← Back to Reactions').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
  } catch (error) {
    await updateInteraction(interaction, { content: '❌ Error loading reactions. Please try again.', components: [] });
  }
}

async function showDefaultReactionsPreview(interaction, serverConfig) {
  try {
    const defaults = [
      { emoji: '➕', point_value: 1 },
      { emoji: '➖', point_value: -1 },
      { emoji: '😄', point_value: 3 },
      { emoji: '😐', point_value: -3 },
      { emoji: '🥶', point_value: -5 },
      { emoji: '🔥', point_value: 5 },
    ];
    const embed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle('🔍 Preview: Default Emoji Reactions')
      .setDescription('These emojis and point values will be added to your server:')
      .addFields(
        { name: '📊 Default Reactions', value: defaults.map((r) => `${r.emoji} → ${r.point_value > 0 ? '+' : ''}${r.point_value} points`).join('\n'), inline: false },
        { name: '📝 What happens next?', value: '• These reactions will be added to your server configuration\n• Users can react with these emojis to award points\n• You can edit or remove them later in the reactions menu', inline: false },
      )
      .setFooter({ text: 'Choose an option below to continue' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('config_reactions_confirm_defaults').setLabel('✅ Add These Reactions').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('config_reactions_cancel_defaults').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('config_reactions').setLabel('← Back to Reactions').setStyle(ButtonStyle.Primary),
    );
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
  } catch (error) {
    await updateInteraction(interaction, { content: '❌ Error showing preview. Please try again.', components: [] });
  }
}

async function setupDefaultReactions(interaction, serverConfig) {
  try {
    const serverId = interaction.guild.id;
    const defaults = [
      { emoji: '➕', point_value: 1 },
      { emoji: '➖', point_value: -1 },
      { emoji: '😄', point_value: 3 },
      { emoji: '😐', point_value: -3 },
      { emoji: '🥶', point_value: -5 },
      { emoji: '🔥', point_value: 5 },
    ];
    for (const r of defaults) {
      await DatabaseUtils.setCustomReaction(serverId, r.emoji, r.point_value);
    }
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ Default Reactions Added')
      .setDescription('Successfully added default reaction emojis:')
      .addFields({ name: 'Added Reactions', value: defaults.map((r) => `${r.emoji} → ${r.point_value > 0 ? '+' : ''}${r.point_value} points`).join('\n'), inline: false })
      .setFooter({ text: 'You can now edit or remove these reactions as needed.' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_reactions').setLabel('← Back to Reactions').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
  } catch (error) {
    await updateInteraction(interaction, { content: '❌ Error setting up default reactions. Some may have been added already.', components: [] });
  }
}

async function showClearAllReactionsConfirmation(interaction) {
  const embed = new EmbedBuilder().setColor('#ff6b6b').setTitle('⚠️ Clear All Custom Reactions').setDescription('Are you sure you want to remove **ALL** custom reaction configurations?\n\n**This action cannot be undone!**').addFields({ name: '⚠️ Warning', value: 'This will permanently delete all custom emoji-to-point mappings for this server.', inline: false });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config_reactions_confirm_clear').setLabel('🗑️ Yes, Clear All').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('config_reactions_cancel_clear').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary),
  );
  await updateInteraction(interaction, { embeds: [embed], components: [row] });
}

async function clearAllReactions(interaction) {
  try {
    const serverId = interaction.guild.id;
    const customReactions = await DatabaseUtils.getCustomReactions(serverId);
    const reactionCount = customReactions.length;
    await DatabaseUtils.clearCustomReactions(serverId);
    const embed = new EmbedBuilder().setColor('#00ff00').setTitle('✅ All Reactions Cleared').setDescription(`Successfully removed all ${reactionCount} custom reaction configurations.`).setFooter({ text: 'You can add new reactions anytime.' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_reactions').setLabel('← Back to Reactions').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
  } catch (error) {
    await updateInteraction(interaction, { content: '❌ Error clearing reactions. Please try again.', components: [] });
  }
}

async function removeReaction(interaction, serverConfig, emoji) {
  try {
    const removed = await DatabaseUtils.removeCustomReaction(interaction.guild.id, emoji);
    if (removed) {
      const successEmbed = new EmbedBuilder().setColor('#00ff00').setTitle('✅ Reaction Removed Successfully!').setDescription(`**${emoji}** is no longer configured for reaction point awards`).addFields({ name: '🎉 All Set!', value: 'Users can still react with this emoji, but no points will be awarded.', inline: false });
      const successRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_reactions').setLabel('← Back to Reactions').setStyle(ButtonStyle.Primary));
      await updateInteraction(interaction, { embeds: [successEmbed], components: [successRow] });
    } else {
      await updateInteraction(interaction, { content: `❌ Reaction ${emoji} was not found in the configuration.`, embeds: [], components: [] });
    }
  } catch (error) {
    logger.errorWithStack('Error removing reaction', error, 'REACTIONS');
    await updateInteraction(interaction, { content: '❌ Error removing reaction. Please try again.', embeds: [], components: [] });
  }
}

// Add flow: chat or react to choose emoji, then enter points, then save
async function startEmojiAddProcess(interaction) {
  try {
    logger.config(`Starting emoji add process for ${interaction.user.tag}`, 'EMOJI');

    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('📝 Add Custom Emoji Reaction')
      .setDescription('Step 1: Choose how to provide the emoji you want to configure:\n\n• Send the emoji in chat\n• Or react to this message with the emoji\n\nSupported formats:\n• Standard emoji: 👍 😄 🔥\n• Custom emoji: <:name:id>')
      .addFields({ name: '⏱️ Timeout', value: 'This will timeout in 60 seconds if no emoji is provided', inline: false })
      .setFooter({ text: 'Send a message or react to this message with your emoji' });

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_reactions_cancel_add').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary));

    await updateInteraction(interaction, { embeds: [embed], components: [row] });
    const msg = await interaction.fetchReply();

    await setupEmojiCollectors(interaction, msg);
  } catch (error) {
    logger.errorWithStack('Error starting emoji add process', error, 'EMOJI');
    await updateInteraction(interaction, { content: '❌ Error starting emoji addition. Please try again.', components: [] });
  }
}

async function setupEmojiCollectors(interaction, message) {
  const userId = interaction.user.id;
  const channel = interaction.channel;

  const messageFilter = (m) => m.author.id === userId && m.channel.id === channel.id;
  const messageCollector = channel.createMessageCollector({ filter: messageFilter, time: 60000 });

  const reactionFilter = (reaction, user) => user.id === userId;
  const reactionCollector = message.createReactionCollector({ filter: reactionFilter, time: 60000, max: 1 });

  const cancelFilter = (i) => i.customId === 'config_reactions_cancel_add' && i.user.id === userId;
  const cancelCollector = message.createMessageComponentCollector({ filter: cancelFilter, time: 60000 });

  cancelCollector.on('collect', async (i) => {
    // The router handles the UI update for cancel, we just need to stop the background collectors
    messageCollector.stop('cancelled');
    reactionCollector.stop('cancelled');
    cancelCollector.stop('cancelled');
  });

  messageCollector.on('collect', async (m) => {
    const emoji = extractEmojiFromMessage(m.content);
    if (!emoji) {
      await m.reply('❌ I couldn\'t find a valid emoji in your message. Please try again with just the emoji.');
      return;
    }
    messageCollector.stop('got_emoji');
    reactionCollector.stop('message');
    cancelCollector.stop('got_emoji');
    await processEmojiSelection(interaction, emoji, m);
  });

  reactionCollector.on('collect', async (reaction) => {
    messageCollector.stop('reaction');
    cancelCollector.stop('reaction');
    const emojiStr = formatEmojiFromReaction(reaction.emoji);
    await processEmojiSelection(interaction, emojiStr);
  });

  const onEnd = async (reason) => {
    if (reason === 'time') {
      await handleEmojiTimeout(interaction, 'emoji');
    }
  };
  messageCollector.on('end', (_, r) => onEnd(r));
  reactionCollector.on('end', (_, r) => onEnd(r));
}

function extractEmojiFromMessage(content) {
  const trimmed = content.trim();
  const customEmojiMatch = trimmed.match(/^<a?:([^:]+):(\d+)>$/);
  if (customEmojiMatch) return trimmed;
  // naive single unicode emoji match (at least 1 code point)
  if (/^\p{Extended_Pictographic}$/u.test(trimmed)) return trimmed;
  return null;
}

function formatEmojiFromReaction(emoji) {
  if (emoji.id) return emoji.toString();
  return emoji.name;
}

async function validateCustomEmoji(emojiString, guild) {
  const match = emojiString.match(/^<a?:([^:]+):(\d+)>$/);
  if (!match) return { valid: false, error: 'Invalid emoji format' };
  const [, name, id] = match;
  let serverEmoji = guild.emojis.cache.get(id);
  if (!serverEmoji) {
    try {
      await guild.emojis.fetch();
      serverEmoji = guild.emojis.cache.get(id);
    } catch (e) { /* ignore */ }
  }
  if (!serverEmoji) return { valid: false, error: 'Emoji not found in server' };
  return { valid: true, id, name };
}

async function processEmojiSelection(interaction, emoji, userMessage = null) {
  try {
    if (userMessage && userMessage.deletable) {
      await userMessage.delete().catch(() => null);
    }

    // If custom emoji, ensure it belongs to this server
    if (emoji.startsWith('<')) {
      const validation = await validateCustomEmoji(emoji, interaction.guild);
      if (!validation.valid) {
        await interaction.followUp({ content: `❌ ${validation.error}. Please use a custom emoji from this server.`, flags: MessageFlags.Ephemeral });
        const cfg = await DatabaseUtils.getServerConfig(interaction.guild.id);
        await showReactionConfig(interaction, cfg);
        return;
      }
    }

    const pointsEmbed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle('🎯 Set Point Value')
      .setDescription(`Selected Emoji: ${emoji}\n\nReply with the point value for this emoji`)
      .addFields({ name: 'Rules', value: 'Any non-zero number, e.g., 5, -3, 100, -50' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_reactions_cancel_add').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary));
    await interaction.editReply({ embeds: [pointsEmbed], components: [row] });

    const pointsFilter = (m) => m.author.id === interaction.user.id && m.channel.id === interaction.channel.id;
    const pointsCollector = interaction.channel.createMessageCollector({ filter: pointsFilter, time: 30000 });

    pointsCollector.on('collect', async (m) => {
      const num = parseInt(m.content.trim().replace(/[^-\d]/g, ''));
      if (isNaN(num) || num === 0) {
        await m.reply('❌ Invalid point value. Please enter a non-zero number.');
        return;
      }
      pointsCollector.stop('got_points');
      if (m.deletable) await m.delete().catch(() => null);
      await finalizeEmojiAddition(interaction, emoji, num);
    });

    pointsCollector.on('end', async (_, reason) => {
      if (reason === 'time') await handleEmojiTimeout(interaction, 'points');
    });
  } catch (error) {
    logger.errorWithStack('Error processing emoji selection', error, 'EMOJI');
    await interaction.editReply({ content: '❌ Error processing emoji selection. Please try again.', embeds: [], components: [] });
  }
}

async function finalizeEmojiAddition(interaction, emoji, points) {
  try {
    const serverId = interaction.guild.id;
    await DatabaseUtils.setCustomReaction(serverId, emoji, points);
    const success = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ Emoji Added Successfully!')
      .setDescription(`Configured: ${emoji} → ${points > 0 ? '+' : ''}${points} points`)
      .setFooter({ text: 'Users can now react to award points.' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_reactions').setLabel('← Back to Reactions').setStyle(ButtonStyle.Primary));
    await interaction.editReply({ embeds: [success], components: [row] });
  } catch (error) {
    logger.errorWithStack('Error finalizing emoji addition', error, 'EMOJI');
    await interaction.editReply({ content: '❌ Error adding custom reaction. The emoji may already be configured or invalid.', embeds: [], components: [] });
  }
}

async function handleEmojiTimeout(interaction, step = 'emoji') {
  const msg = step === 'emoji' ? '⏰ Emoji addition timed out.' : '⏰ Point value input timed out.';
  await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => null);
  const cfg = await DatabaseUtils.getServerConfig(interaction.guild.id);
  await showReactionConfig(interaction, cfg);
}

async function handleEmojiAddCancel(interaction) {
  const cfg = await DatabaseUtils.getServerConfig(interaction.guild.id);
  await showReactionConfig(interaction, cfg);
}

module.exports = {
  showReactionConfig,
  showEditReactionModal,
  showEditReactionSelect,
  showRemoveReactionSelect,
  showDefaultReactionsPreview,
  setupDefaultReactions,
  showClearAllReactionsConfirmation,
  clearAllReactions,
  removeReaction,
  startEmojiAddProcess,
  handleEmojiAddCancel,
};