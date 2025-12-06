const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, AttachmentBuilder } = require('discord.js');
const DatabaseUtils = require('../utils/database');
const logger = require('../utils/logger');
const { renderScoreImage } = require('../utils/scoreImage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('score')
        .setDescription('View a user\'s current score and interactive history')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to check (defaults to yourself)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const serverId = interaction.guild.id;

        // Prevent checking bot scores
        if (targetUser.bot) {
            return await interaction.reply({
                content: '❌ Bots don\'t have scores!',
                flags: MessageFlags.Ephemeral
            });
        }

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
            
            // Initialize state for interactive score display
            const scoreState = {
                targetUser: targetUser,
                serverId: serverId,
                serverConfig: serverConfig,
                page: 0,
                itemsPerPage: 10,
                viewMode: 'recent', // recent, all, positive, negative
                linkMode: false, // Controls whether to show link buttons or view buttons
                currentHistoryPage: [] // Store current page items for button access
            };

            // Generate initial score display
            const { files, components } = await generateScoreDisplay(interaction, scoreState);
            
            // Determine if this is a self-check or other user check
            const isOwnScore = targetUser.id === interaction.user.id;
            
            const replyOptions = {
                files: files,
                components: components,
                embeds: [] // Ensure no embeds are sent
            };
            
            if (isOwnScore) {
                replyOptions.flags = MessageFlags.Ephemeral;
            }
            
            const response = await interaction.reply(replyOptions).then(() => interaction.fetchReply());

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
                    logger.debug(`Score interaction already being processed: ${interactionKey}`, 'SCORE');
                    return;
                }
                processingInteractions.add(interactionKey);

                try {
                    // Check if interaction is still valid
                    if (buttonInteraction.replied || buttonInteraction.deferred) {
                        logger.debug(`Score button interaction already handled: ${buttonInteraction.customId}`, 'SCORE');
                        return;
                    }

                    if (buttonInteraction.user.id !== interaction.user.id) {
                        await buttonInteraction.reply({
                            content: '❌ Only the user who ran the command can use these buttons.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    // Handle Link Buttons separately (Ephemeral response)
                    if (buttonInteraction.customId.startsWith('score_link_')) {
                        const index = parseInt(buttonInteraction.customId.split('_')[2]);
                        const entry = scoreState.currentHistoryPage[index];

                        if (!entry) {
                             await buttonInteraction.reply({
                                content: '❌ Could not find entry details.',
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }

                        let content = `**Entry #${index + 1} Details**\n`;
                        content += `**Change:** ${entry.point_change > 0 ? '+' : ''}${entry.point_change}\n`;
                        content += `**Reason:** ${entry.reason}\n`;
                        content += `**Date:** <t:${Math.floor(new Date(entry.created_at).getTime() / 1000)}:f>\n`;

                        if (entry.message_id && entry.channel_id) {
                            content += `\n🔗 **Link:** https://discord.com/channels/${serverId}/${entry.channel_id}/${entry.message_id}`;
                        } else {
                            content += '\n*No message link available for this entry.*';
                        }

                        await buttonInteraction.reply({
                            content: content,
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    // Acknowledge the interaction for navigation/view updates
                    await buttonInteraction.deferUpdate();

                    // Update state based on button pressed
                    switch (buttonInteraction.customId) {
                        case 'score_mode_links':
                            scoreState.linkMode = true;
                            break;
                        case 'score_mode_menu':
                            scoreState.linkMode = false;
                            break;
                        case 'score_view_recent':
                            scoreState.viewMode = 'recent';
                            scoreState.page = 0;
                            scoreState.linkMode = false;
                            break;
                        case 'score_view_all':
                            scoreState.viewMode = 'all';
                            scoreState.page = 0;
                            scoreState.linkMode = false;
                            break;
                        case 'score_view_positive':
                            scoreState.viewMode = 'positive';
                            scoreState.page = 0;
                            scoreState.linkMode = false;
                            break;
                        case 'score_view_negative':
                            scoreState.viewMode = 'negative';
                            scoreState.page = 0;
                            scoreState.linkMode = false;
                            break;
                        case 'score_page_prev':
                            scoreState.page = Math.max(0, scoreState.page - 1);
                            break;
                        case 'score_page_next':
                            scoreState.page = scoreState.page + 1;
                            break;
                        case 'score_refresh':
                            // Just refresh with current state
                            break;
                        default:
                            logger.warn(`Unknown score button interaction: ${buttonInteraction.customId}`, 'SCORE');
                            return;
                    }

                    // Generate updated score display
                    const { files: newFiles, components: newComponents } = await generateScoreDisplay(buttonInteraction, scoreState);
                    
                    // Edit the original response
                    await buttonInteraction.editReply({ 
                        files: newFiles, 
                        components: newComponents,
                        embeds: []
                    });
                } catch (error) {
                    logger.errorWithStack('Error handling score button interaction', error, 'SCORE');
                    
                    // Try to send a followup error message
                    try {
                        if (buttonInteraction.deferred && !buttonInteraction.replied) {
                            await buttonInteraction.editReply({
                                content: '❌ There was an error processing your request. The score display may have expired.',
                                files: [],
                                components: []
                            });
                        }
                    } catch (replyError) {
                        logger.debug(`Failed to send score error reply: ${replyError.message}`, 'SCORE');
                    }
                } finally {
                    // Always remove from processing set
                    processingInteractions.delete(interactionKey);
                }
            });

            collector.on('end', async (collected, reason) => {
                logger.debug(`Score collector ended. Reason: ${reason}, Collected: ${collected.size}`, 'SCORE');
                
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
                    logger.debug(`Failed to disable score buttons on collector end: ${error.message}`, 'SCORE');
                }
            });

        } catch (error) {
            logger.errorWithStack('Error fetching user score', error, 'SCORE');
            await interaction.reply({
                content: '❌ There was an error fetching the score. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};

/**
 * Generate score display image and components based on state
 * @param {Object} interaction - Discord interaction object
 * @param {Object} scoreState - Current score display state
 * @returns {Object} Object containing files and components
 */
async function generateScoreDisplay(interaction, scoreState) {
    const { targetUser, serverId, serverConfig, page, itemsPerPage, viewMode } = scoreState;
    
    // Check if server is in sync group for display purposes
    const { getServerSyncStatus } = require('../utils/syncUtils');
    const syncStatus = await getServerSyncStatus(serverId);
    
    // Get user's current score (will be combined if in sync group)
    const currentScore = await DatabaseUtils.getUserScore(targetUser.id, serverId);
    
    // Get extended user history with message IDs (will be combined if in sync group)
    const allHistory = await DatabaseUtils.getUserHistory(targetUser.id, serverId, 50);
    
    // Filter history based on view mode
    let filteredHistory = [];
    
    switch (viewMode) {
        case 'recent':
            filteredHistory = allHistory.slice(0, 25); // Show recent 25
            break;
        case 'positive':
            filteredHistory = allHistory.filter(entry => entry.point_change > 0);
            break;
        case 'negative':
            filteredHistory = allHistory.filter(entry => entry.point_change < 0);
            break;
        case 'all':
        default:
            filteredHistory = allHistory;
            break;
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(filteredHistory.length / itemsPerPage) || 1;
    // Ensure page is within bounds (in case filter changed and reduced pages)
    scoreState.page = Math.min(Math.max(0, page), Math.max(0, totalPages - 1));
    
    const startIndex = scoreState.page * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageHistory = filteredHistory.slice(startIndex, endIndex);
    
    // Update state with current page items for button access
    scoreState.currentHistoryPage = pageHistory;
    
    // Render Image
    const imgBuffer = await renderScoreImage({
        targetUser,
        currentScore,
        totalChanges: allHistory.length,
        viewMode,
        history: pageHistory,
        page: scoreState.page,
        totalPages,
        syncStatus
    });
    
    const attachment = new AttachmentBuilder(imgBuffer, { name: 'trustfactor-score.png' });

    // Create button components
    const components = [];

    if (scoreState.linkMode) {
        // --- LINK SELECTION MODE ---
        // Row 1 & 2: Link Buttons (1-10)
        if (pageHistory.length > 0) {
            const firstRow = new ActionRowBuilder();
            const secondRow = new ActionRowBuilder();
            
            pageHistory.forEach((entry, index) => {
                const hasLink = !!(entry.message_id && entry.channel_id);
                const isPositive = entry.point_change > 0;
                
                const btn = new ButtonBuilder()
                    .setCustomId(`score_link_${index}`)
                    .setLabel(`${index + 1}`)
                    .setEmoji(hasLink ? '🔗' : (isPositive ? '📈' : '📉'))
                    .setStyle(hasLink ? ButtonStyle.Primary : ButtonStyle.Secondary);
                
                if (index < 5) {
                    firstRow.addComponents(btn);
                } else {
                    secondRow.addComponents(btn);
                }
            });
            
            components.push(firstRow);
            if (secondRow.components.length > 0) {
                components.push(secondRow);
            }
        }
        
        // Row 3: Back Button
        const backRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('score_mode_menu')
                    .setLabel('Back to Menu')
                    .setEmoji('↩️')
                    .setStyle(ButtonStyle.Danger)
            );
        components.push(backRow);

    } else {
        // --- DEFAULT VIEW MODE ---
        // Row 1: View Mode Buttons
        const viewRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('score_view_recent')
                    .setLabel('Recent')
                    .setStyle(viewMode === 'recent' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('score_view_positive')
                    .setLabel('Pos (+)')
                    .setStyle(viewMode === 'positive' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('score_view_negative')
                    .setLabel('Neg (-)')
                    .setStyle(viewMode === 'negative' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('score_view_all')
                    .setLabel('All')
                    .setStyle(viewMode === 'all' ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('score_refresh')
                    .setEmoji('🔄')
                    .setStyle(ButtonStyle.Secondary)
            );
        components.push(viewRow);

        // Row 2: Navigation & Select Links
        const navRow = new ActionRowBuilder();

        // Select Links Button
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId('score_mode_links')
                .setLabel('Select Links')
                .setEmoji('🔗')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(pageHistory.length === 0)
        );

        // Pagination
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId('score_page_prev')
                .setLabel('Previous')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(scoreState.page === 0),
            new ButtonBuilder()
                .setCustomId('score_page_next')
                .setLabel('Next')
                .setEmoji('➡️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(scoreState.page >= totalPages - 1)
        );
        
        components.push(navRow);
    }

    return {
        files: [attachment],
        components
    };
}
