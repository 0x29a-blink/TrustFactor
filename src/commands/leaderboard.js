const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the server leaderboard with interactive filters')
        .addIntegerOption(option =>
            option
                .setName('limit')
                .setDescription('Number of users to show (1-25)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(25)
        ),

    async execute(interaction) {
        const limit = interaction.options.getInteger('limit') || 10;
        const serverId = interaction.guild.id;

        try {
            // Get server configuration
            const serverConfig = await DatabaseUtils.getServerConfig(serverId);
            
            // Check if bot is active for this server
            if (!serverConfig.is_active) {
                return await interaction.reply({
                    content: '🚫 **TrustFactor bot is currently disabled** for this server.\n\nServer administrators can re-enable it using `/config` → Advanced → Bot Status.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            // Initialize with default filter (positive)
            const filterState = {
                type: 'positive',
                limit: limit,
                serverId: serverId,
                serverConfig: serverConfig
            };

            // Generate initial leaderboard
            const { embed, components } = await generateLeaderboard(interaction, filterState);
            
            const response = await interaction.reply({ 
                embeds: [embed], 
                components: components
            }).then(() => interaction.fetchReply());

            // Create collector for button interactions
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes
            });

            // Track processing interactions to prevent race conditions
            const processingInteractions = new Set();

            collector.on('collect', async (buttonInteraction) => {
                // Prevent duplicate processing
                const interactionKey = `${buttonInteraction.id}_${buttonInteraction.customId}`;
                if (processingInteractions.has(interactionKey)) {
                    console.warn('Interaction already being processed:', interactionKey);
                    return;
                }
                processingInteractions.add(interactionKey);

                try {
                    // Check if interaction is still valid
                    if (buttonInteraction.replied || buttonInteraction.deferred) {
                        console.warn('Button interaction already handled:', buttonInteraction.customId);
                        return;
                    }

                    // Acknowledge the interaction immediately to prevent timeout
                    await buttonInteraction.deferUpdate();

                    if (buttonInteraction.user.id !== interaction.user.id) {
                        await buttonInteraction.followUp({
                            content: '❌ Only the user who ran the command can use these buttons.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    // Update filter based on button pressed
                    switch (buttonInteraction.customId) {
                        case 'leaderboard_filter_positive':
                            filterState.type = 'positive';
                            break;
                        case 'leaderboard_filter_negative':
                            filterState.type = 'negative';
                            break;
                        case 'leaderboard_filter_recent':
                            filterState.type = 'recent';
                            break;
                        case 'leaderboard_filter_volatile':
                            filterState.type = 'volatile';
                            break;
                        case 'leaderboard_filter_all':
                            filterState.type = 'all';
                            break;
                        case 'leaderboard_limit_increase':
                            filterState.limit = Math.min(25, filterState.limit + 5);
                            break;
                        case 'leaderboard_limit_decrease':
                            filterState.limit = Math.max(5, filterState.limit - 5);
                            break;
                        default:
                            console.warn('Unknown leaderboard button interaction:', buttonInteraction.customId);
                            await buttonInteraction.followUp({
                                content: '❌ Unknown button action.',
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                    }

                    // Generate updated leaderboard
                    const { embed: newEmbed, components: newComponents } = await generateLeaderboard(buttonInteraction, filterState);
                    
                    // Edit the original response
                    await buttonInteraction.editReply({ 
                        embeds: [newEmbed], 
                        components: newComponents 
                    });
                } catch (error) {
                    const logger = require('../utils/logger');
                    logger.errorWithStack('Error handling button interaction', error, 'LEADERBOARD');
                    
                    // Try to send a followup error message
                    try {
                        if (buttonInteraction.deferred && !buttonInteraction.replied) {
                            await buttonInteraction.editReply({
                                content: '❌ There was an error processing your request. The leaderboard may have expired.',
                                embeds: [],
                                components: []
                            });
                        } else if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                            await buttonInteraction.reply({
                                content: '❌ There was an error processing your request.',
                                flags: MessageFlags.Ephemeral
                            });
                        }
                    } catch (replyError) {
                        const logger2 = require('../utils/logger');
                        logger2.debug(`Failed to send error reply: ${replyError.message}`, 'LEADERBOARD');
                    }
                } finally {
                    // Always remove from processing set
                    processingInteractions.delete(interactionKey);
                }
            });

            collector.on('end', async (collected, reason) => {
                const logger = require('../utils/logger');
                logger.debug(`Leaderboard collector ended. Reason: ${reason}, Collected: ${collected.size}`, 'LEADERBOARD');
                
                // Disable all buttons when collector expires
                try {
                    const disabledComponents = components.map(row => {
                        const newRow = new ActionRowBuilder();
                        row.components.forEach(component => {
                            newRow.addComponents(
                                ButtonBuilder.from(component).setDisabled(true)
                            );
                        });
                        return newRow;
                    });

                    await response.edit({ components: disabledComponents });
                } catch (error) {
                    const logger2 = require('../utils/logger');
                    logger2.debug(`Failed to disable buttons on collector end: ${error.message}`, 'LEADERBOARD');
                    // This is expected if the interaction has expired
                }
            });

        } catch (error) {
            const logger3 = require('../utils/logger');
            logger3.errorWithStack('Error fetching leaderboard', error, 'LEADERBOARD');
            await interaction.reply({
                content: '❌ There was an error fetching the leaderboard. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};

/**
 * Generate leaderboard embed and components based on filter state
 * @param {Object} interaction - Discord interaction object
 * @param {Object} filterState - Current filter state
 * @returns {Object} Object containing embed and components
 */
async function generateLeaderboard(interaction, filterState) {
    const { type, limit, serverId, serverConfig } = filterState;
    
    // Check if server is in sync group for display purposes
    const { getServerSyncStatus } = require('../utils/syncUtils');
    const syncStatus = await getServerSyncStatus(serverId);
    
    // Get raw leaderboard data (we'll filter it ourselves for creative options)
    const allScores = await DatabaseUtils.getLeaderboard(serverId, 100); // Get more data to work with
    
    let filteredData = [];
    let title = '🏆 Server Leaderboard';
    let description = '';
    let color = serverConfig.embed_color || '#5865F2';

    switch (type) {
        case 'positive':
            filteredData = allScores.filter(entry => entry.total_score > 0).slice(0, limit);
            title = '🏆 Positive Leaderboard';
            description = `Top ${Math.min(filteredData.length, limit)} users with positive scores`;
            color = '#00ff00';
            break;
            
        case 'negative':
            filteredData = allScores.filter(entry => entry.total_score < 0)
                .sort((a, b) => a.total_score - b.total_score) // Sort by lowest (most negative) first
                .slice(0, limit);
            title = '💀 Negative Leaderboard';
            description = `Users with negative scores (most negative first)`;
            color = '#ff0000';
            break;
            
        case 'recent':
            // Sort by most recently updated scores
            filteredData = allScores
                .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
                .slice(0, limit);
            title = '⚡ Recently Active';
            description = `Users with most recent score changes`;
            color = '#ffff00';
            break;
            
        case 'volatile':
            // Show users with scores closest to zero (most volatile/contested)
            filteredData = allScores
                .filter(entry => entry.total_score !== 0)
                .sort((a, b) => Math.abs(a.total_score) - Math.abs(b.total_score))
                .slice(0, limit);
            title = '🎲 Most Contested';
            description = `Users with scores closest to zero (most volatile)`;
            color = '#ff8c00';
            break;
            
        case 'all':
        default:
            filteredData = allScores.slice(0, limit);
            title = '📊 Complete Leaderboard';
            description = `All users ranked by score`;
            color = serverConfig.embed_color || '#5865F2';
            break;
    }

    // Add sync group info to description if applicable
    let finalDescription = description;
    if (syncStatus) {
        finalDescription += `\n\n🔗 **Sync Group:** ${syncStatus.sync_groups.group_name}\n*Scores combined across all synced servers*`;
    }
    
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(finalDescription)
        .setTimestamp();

    if (filteredData.length === 0) {
        embed.setDescription('No users found for this filter!');
        embed.addFields([{
            name: 'Try a different filter',
            value: 'Use the buttons below to switch between different leaderboard views.',
            inline: false
        }]);
    } else {
        // Build leaderboard text
        let leaderboardText = '';
        const medals = ['🥇', '🥈', '🥉'];
        
        for (let i = 0; i < filteredData.length; i++) {
            const entry = filteredData[i];
            const position = i + 1;
            const medal = i < 3 ? medals[i] : `${position}.`;
            
            try {
                const user = await interaction.client.users.fetch(entry.user_id);
                const displayName = user.globalName || user.username;
                
                // Add special indicators based on filter type
                let indicator = '';
                if (type === 'recent') {
                    const timeDiff = Date.now() - new Date(entry.updated_at).getTime();
                    const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));
                    indicator = ` ⏰ ${hoursAgo}h ago`;
                } else if (type === 'volatile') {
                    indicator = ` 🎯 ${Math.abs(entry.total_score)} from zero`;
                }
                
                leaderboardText += `${medal} **${displayName}** | **${entry.total_score}** point${Math.abs(entry.total_score) !== 1 ? 's' : ''}${indicator}\n`;
            } catch (error) {
                leaderboardText += `${medal} **Unknown User** | **${entry.total_score}** point${Math.abs(entry.total_score) !== 1 ? 's' : ''}\n`;
            }
        }

        embed.addFields([{
            name: 'Rankings',
            value: leaderboardText,
            inline: false
        }]);
    }

    // Add footer with filter info
    embed.setFooter({ 
        text: `Filter: ${type.charAt(0).toUpperCase() + type.slice(1)} | Showing ${filteredData.length}/${limit} users | Expires in 5 minutes` 
    });

    // Create button components
    const filterRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('leaderboard_filter_positive')
                .setLabel('Positive')
                .setEmoji('🏆')
                .setStyle(type === 'positive' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('leaderboard_filter_negative')
                .setLabel('Negative')
                .setEmoji('💀')
                .setStyle(type === 'negative' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('leaderboard_filter_recent')
                .setLabel('Recent')
                .setEmoji('⚡')
                .setStyle(type === 'recent' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('leaderboard_filter_volatile')
                .setLabel('Contested')
                .setEmoji('🎲')
                .setStyle(type === 'volatile' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('leaderboard_filter_all')
                .setLabel('All')
                .setEmoji('📊')
                .setStyle(type === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        );

    const controlRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('leaderboard_limit_decrease')
                .setLabel(`-5 (${limit})`)
                .setEmoji('➖')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(limit <= 5),
            new ButtonBuilder()
                .setCustomId('leaderboard_limit_increase')
                .setLabel(`+5 (${limit})`)
                .setEmoji('➕')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(limit >= 25)
        );

    return {
        embed,
        components: [filterRow, controlRow]
    };
}
