const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../../../utils/database');
const logger = require('../../../utils/logger');
const { updateInteraction } = require('../ui');
const { logConfigChange } = require('../services/configService');

async function showBlockedChannelsConfig(interaction, serverConfig) {
  try {
    const blockedChannels = await DatabaseUtils.getBlockedChannels(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(serverConfig.embed_color || '#5865F2')
      .setTitle('🚫 Blocked Channels Configuration')
      .setDescription('Configure channels where reaction point awards are disabled. This is useful for announcement channels or other high-traffic areas where reaction spam could be overwhelming.')
      .addFields([
        {
          name: '📋 Current Blocked Channels',
          value:
            blockedChannels.length > 0
              ? blockedChannels
                  .map((bc) => {
                    const channelMention = `<#${bc.channel_id}>`;
                    const reason = bc.reason ? ` (${bc.reason})` : '';
                    return `• ${channelMention}${reason}`;
                  })
                  .join('\n')
              : 'No channels are currently blocked',
          inline: false,
        },
        {
          name: '🎯 How It Works',
          value: '• Blocked channels ignore all reaction point awards\n• Users can still react normally, but no points are awarded\n• Useful for announcement channels, spam channels, etc.\n• Only affects reaction-based point awards (not reply-based)',
          inline: false,
        },
      ])
      .setFooter({ text: 'Manage blocked channels below' });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('config_blocked_channels_add').setLabel('➕ Add Channel').setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('config_blocked_channels_remove')
        .setLabel('🗑️ Remove Channel')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(blockedChannels.length === 0),
      new ButtonBuilder()
        .setCustomId('config_blocked_channels_clear')
        .setLabel('🧹 Clear All')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(blockedChannels.length === 0),
    );

    const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_reactions').setLabel('← Back to Reactions').setStyle(ButtonStyle.Primary));

    await updateInteraction(interaction, { embeds: [embed], components: [row1, row2] });
  } catch (error) {
    logger.errorWithStack('Error showing blocked channels config:', error, 'BLOCKED_CHANNELS');
    await updateInteraction(interaction, { content: '❌ Error loading blocked channels configuration. Please try again.', components: [] });
  }
}

async function startBlockedChannelAddProcess(interaction) {
  try {
    logger.config(`Starting blocked channel add process for ${interaction.user.tag}`, 'BLOCKED_CHANNELS');

    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('📝 Add Blocked Channel')
      .setDescription(
        '**Step 1:** Mention the channel you want to block from reaction point awards.\n\n**Example:**\n`#announcements`\n`#general`\n`#spam`\n\n**Or send the channel ID directly:**\n`123456789012345678`',
      )
      .addFields(
        { name: '⏱️ Timeout', value: 'This will timeout in 60 seconds if no channel is provided', inline: false },
        { name: '💡 Tip', value: 'You can also provide a reason after the channel mention, like: `#announcements Spam prevention`', inline: false },
      )
      .setFooter({ text: 'Send a message with the channel mention or ID' });

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_blocked_channels_cancel_add').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary));

    await interaction.update({ embeds: [embed], components: [row] });

    const userId = interaction.user.id;
    const channelId = interaction.channel.id;
    const messageFilter = (msg) => msg.author.id === userId && msg.channel.id === channelId;
    const messageCollector = interaction.channel.createMessageCollector({ filter: messageFilter, time: 60000, max: 1 });

    messageCollector.on('collect', async (msg) => {
      try {
        await processBlockedChannelSelection(interaction, msg.content, msg);
      } catch (error) {
        logger.errorWithStack('Error processing blocked channel selection', error, 'BLOCKED_CHANNELS');
        await interaction.editReply({ content: '❌ Error processing channel selection. Please try again.', embeds: [], components: [] });
      }
    });

    messageCollector.on('end', async (collected) => {
      if (collected.size === 0) {
        await handleBlockedChannelTimeout(interaction);
      }
    });
  } catch (error) {
    logger.errorWithStack('Error starting blocked channel add process', error, 'BLOCKED_CHANNELS');
    await interaction.editReply({ content: '❌ Error starting blocked channel addition. Please try again.', embeds: [], components: [] });
  }
}

async function processBlockedChannelSelection(interaction, content, userMessage = null) {
  try {
    const channelMatch = content.match(/<#(\d+)>|(\d{17,19})/);
    if (!channelMatch) {
      await interaction.editReply({ content: '❌ Invalid channel format. Please mention a channel (e.g., `#general`) or provide a channel ID.', embeds: [], components: [] });
      return;
    }
    const channelId = channelMatch[1] || channelMatch[2];
    const channel = interaction.guild.channels.cache.get(String(channelId));
    if (!channel) {
      await interaction.editReply({ content: '❌ Channel not found. Please make sure the channel exists and is accessible.', embeds: [], components: [] });
      return;
    }

    const existingBlock = await DatabaseUtils.isChannelBlocked(interaction.guild.id, String(channelId));
    if (existingBlock) {
      await interaction.editReply({ content: `❌ Channel ${channel} is already blocked from reaction point awards.`, embeds: [], components: [] });
      return;
    }

    const reasonMatch = content.match(/(?:<#\d+>|\d{17,19})\s+(.+)/);
    const reason = reasonMatch ? reasonMatch[1].trim() : null;

    await DatabaseUtils.addBlockedChannel(interaction.guild.id, String(channelId), reason, interaction.user.id);

    await logConfigChange(interaction, 'Blocked Channels', 'New blocked channel', `${channel}${reason ? ` (${reason})` : ''}`);

    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ Channel Blocked Successfully!')
      .setDescription(`**${channel}** is now blocked from reaction point awards`)
      .addFields({ name: '🎉 All Set!', value: 'Users can still react normally in this channel, but no points will be awarded.', inline: false });

    if (reason) {
      successEmbed.addFields({ name: '📝 Reason', value: reason, inline: false });
    }

    const successRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_blocked_channels').setLabel('← Back to Blocked Channels').setStyle(ButtonStyle.Primary));

    await interaction.editReply({ embeds: [successEmbed], components: [successRow] });

    if (userMessage && userMessage.deletable) {
      await userMessage.delete().catch(() => {});
    }
  } catch (error) {
    logger.errorWithStack('Error processing blocked channel selection', error, 'BLOCKED_CHANNELS');
    await interaction.editReply({ content: '❌ Error adding blocked channel. Please try again.', embeds: [], components: [] });
  }
}

async function handleBlockedChannelTimeout(interaction) {
  const timeoutMessage = '⏰ Blocked channel addition timed out. No channel was provided within 60 seconds.';
  await interaction.followUp({ content: timeoutMessage, flags: MessageFlags.Ephemeral });
  try {
    const serverConfig = await DatabaseUtils.getServerConfig(interaction.guild.id);
    await showBlockedChannelsConfig(interaction, serverConfig);
  } catch (error) {
    logger.errorWithStack('Error redirecting to blocked channels config on timeout', error, 'BLOCKED_CHANNELS');
    const timeoutRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_blocked_channels').setLabel('← Back to Blocked Channels').setStyle(ButtonStyle.Primary));
    await interaction.editReply({ content: timeoutMessage, embeds: [], components: [timeoutRow] }).catch(() => {});
  }
}

async function showRemoveBlockedChannelSelect(interaction, serverConfig) {
  try {
    const blockedChannels = await DatabaseUtils.getBlockedChannels(interaction.guild.id);
    if (blockedChannels.length === 0) {
      await interaction.update({ content: '❌ No blocked channels configured to remove.', embeds: [], components: [] });
      return;
    }
    const embed = new EmbedBuilder().setTitle('🗑️ Remove Blocked Channel').setDescription('Select a channel to remove from the blocked list:').setColor('#ff6b6b');
    const options = blockedChannels.map((bc) => {
      const channel = interaction.guild.channels.cache.get(String(bc.channel_id));
      const channelName = channel ? `#${channel.name}` : `Channel ${bc.channel_id}`;
      const reason = bc.reason ? ` (${bc.reason})` : '';
      return { label: channelName + reason, value: String(bc.channel_id), description: `Blocked by ${interaction.guild.members.cache.get(String(bc.blocked_by))?.displayName || 'Unknown'}` };
    });
    const select = new StringSelectMenuBuilder().setCustomId('config_blocked_channels_remove_select').setPlaceholder('Choose a channel to unblock...').addOptions(options);
    const row = new ActionRowBuilder().addComponents(select);
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
  } catch (error) {
    logger.errorWithStack('Error showing remove blocked channel select', error, 'BLOCKED_CHANNELS');
    await updateInteraction(interaction, { content: '❌ Error loading blocked channels. Please try again.', embeds: [], components: [] });
  }
}

async function removeBlockedChannel(interaction, serverConfig, channelId) {
  try {
    const channelMention = `<#${channelId}>`;
    const removed = await DatabaseUtils.removeBlockedChannel(interaction.guild.id, String(channelId));
    if (removed) {
      await logConfigChange(interaction, 'Blocked Channels', `Blocked channel ${channelMention}`, 'Removed from blocked list');
      const successEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Channel Unblocked Successfully!')
        .setDescription(`**${channelMention}** is no longer blocked from reaction point awards`)
        .addFields({ name: '🎉 All Set!', value: 'Users can now receive reaction point awards in this channel.', inline: false });
      const successRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_blocked_channels').setLabel('← Back to Blocked Channels').setStyle(ButtonStyle.Primary));
      await updateInteraction(interaction, { embeds: [successEmbed], components: [successRow] });
    } else {
      await updateInteraction(interaction, { content: `❌ Channel ${channelMention} was not found in the blocked list.`, embeds: [], components: [] });
    }
  } catch (error) {
    logger.errorWithStack('Error removing blocked channel', error, 'BLOCKED_CHANNELS');
    await updateInteraction(interaction, { content: '❌ Error removing blocked channel. Please try again.', embeds: [], components: [] });
  }
}

async function showClearAllBlockedChannelsConfirmation(interaction, serverConfig) {
  try {
    const blockedChannels = await DatabaseUtils.getBlockedChannels(interaction.guild.id);
    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('⚠️ Clear All Blocked Channels')
      .setDescription('Are you sure you want to remove **ALL** blocked channel configurations?\n\n**This action cannot be undone!**')
      .addFields({
        name: '📋 Channels to Unblock',
        value: blockedChannels.length > 0 ? blockedChannels.map((bc) => `<#${bc.channel_id}>`).join('\n') : 'No channels are currently blocked',
        inline: false,
      });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('config_blocked_channels_clear_confirm').setLabel('✅ Yes, Clear All').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('config_blocked_channels').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary),
    );
    await updateInteraction(interaction, { embeds: [embed], components: [row] });
  } catch (error) {
    logger.errorWithStack('Error showing clear all blocked channels confirmation', error, 'BLOCKED_CHANNELS');
    await updateInteraction(interaction, { content: '❌ Error loading blocked channels. Please try again.', embeds: [], components: [] });
  }
}

async function clearAllBlockedChannels(interaction, serverConfig) {
  try {
    const blockedChannels = await DatabaseUtils.getBlockedChannels(interaction.guild.id);
    const channelCount = blockedChannels.length;
    await DatabaseUtils.clearBlockedChannels(interaction.guild.id);
    await logConfigChange(interaction, 'Blocked Channels', `${channelCount} blocked channels`, 'All blocked channels cleared');
    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ All Blocked Channels Cleared!')
      .setDescription(`Successfully unblocked all ${channelCount} channels.`)
      .addFields({ name: '🎉 All Set!', value: 'All channels can now receive reaction point awards.', inline: false });
    const successRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config_blocked_channels').setLabel('← Back to Blocked Channels').setStyle(ButtonStyle.Primary));
    await updateInteraction(interaction, { embeds: [successEmbed], components: [successRow] });
  } catch (error) {
    logger.errorWithStack('Error clearing all blocked channels', error, 'BLOCKED_CHANNELS');
    await updateInteraction(interaction, { content: '❌ Error clearing blocked channels. Please try again.', embeds: [], components: [] });
  }
}

module.exports = {
  showBlockedChannelsConfig,
  startBlockedChannelAddProcess,
  processBlockedChannelSelection,
  handleBlockedChannelTimeout,
  showRemoveBlockedChannelSelect,
  removeBlockedChannel,
  showClearAllBlockedChannelsConfirmation,
  clearAllBlockedChannels,
};