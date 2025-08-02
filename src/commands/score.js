const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../utils/database');

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
                itemsPerPage: 5,
                viewMode: 'recent' // recent, all, positive, negative
            };

            // Generate initial score display
            const { embed, components } = await generateScoreDisplay(interaction, scoreState);
            
            // Determine if this is a self-check or other user check
            const isOwnScore = targetUser.id === interaction.user.id;
            
            const replyOptions = {
                embeds: [embed],
                components: components
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
                    console.warn('Score interaction already being processed:', interactionKey);
                    return;
                }
                processingInteractions.add(interactionKey);

                try {
                    // Check if interaction is still valid
                    if (buttonInteraction.replied || buttonInteraction.deferred) {
                        console.warn('Score button interaction already handled:', buttonInteraction.customId);
                        return;
                    }

                    // Acknowledge the interaction immediately
                    await buttonInteraction.deferUpdate();

                    if (buttonInteraction.user.id !== interaction.user.id) {
                        await buttonInteraction.followUp({
                            content: '❌ Only the user who ran the command can use these buttons.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    // Update state based on button pressed
                    switch (buttonInteraction.customId) {
                        case 'score_view_recent':
                            scoreState.viewMode = 'recent';
                            scoreState.page = 0;
                            break;
                        case 'score_view_all':
                            scoreState.viewMode = 'all';
                            scoreState.page = 0;
                            break;
                        case 'score_view_positive':
                            scoreState.viewMode = 'positive';
                            scoreState.page = 0;
                            break;
                        case 'score_view_negative':
                            scoreState.viewMode = 'negative';
                            scoreState.page = 0;
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
                            console.warn('Unknown score button interaction:', buttonInteraction.customId);
                            await buttonInteraction.followUp({
                                content: '❌ Unknown button action.',
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                    }

                    // Generate updated score display
                    const { embed: newEmbed, components: newComponents } = await generateScoreDisplay(buttonInteraction, scoreState);
                    
                    // Edit the original response
                    await buttonInteraction.editReply({ 
                        embeds: [newEmbed], 
                        components: newComponents 
                    });
                } catch (error) {
                    console.error('Error handling score button interaction:', error);
                    
                    // Try to send a followup error message
                    try {
                        if (buttonInteraction.deferred && !buttonInteraction.replied) {
                            await buttonInteraction.editReply({
                                content: '❌ There was an error processing your request. The score display may have expired.',
                                embeds: [],
                                components: []
                            });
                        }
                    } catch (replyError) {
                        console.error('Failed to send score error reply:', replyError.message);
                    }
                } finally {
                    // Always remove from processing set
                    processingInteractions.delete(interactionKey);
                }
            });

            collector.on('end', async (collected, reason) => {
                console.log(`Score collector ended. Reason: ${reason}, Collected: ${collected.size}`);
                
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
                    console.warn('Failed to disable score buttons on collector end:', error.message);
                }
            });

        } catch (error) {
            console.error('Error fetching user score:', error);
            await interaction.reply({
                content: '❌ There was an error fetching the score. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};

/**
 * Generate score display embed and components based on state
 * @param {Object} interaction - Discord interaction object
 * @param {Object} scoreState - Current score display state
 * @returns {Object} Object containing embed and components
 */
async function generateScoreDisplay(interaction, scoreState) {
    const { targetUser, serverId, serverConfig, page, itemsPerPage, viewMode } = scoreState;
    
    // Check if server is in sync group for display purposes
    const { getServerSyncStatus } = require('../utils/syncUtils');
    const syncStatus = await getServerSyncStatus(serverId);
    
    // Get user's current score (will be combined if in sync group)
    const currentScore = await DatabaseUtils.getUserScore(targetUser.id, serverId);
    
    // Get extended user history with message IDs (will be combined if in sync group)
    const allHistory = await getExtendedUserHistory(targetUser.id, serverId, 50, syncStatus);
    
    // Filter history based on view mode
    let filteredHistory = [];
    let title = `📊 ${targetUser.displayName}'s Score`;
    let color = serverConfig.embed_color || '#5865F2';
    
    switch (viewMode) {
        case 'recent':
            filteredHistory = allHistory.slice(0, 25); // Show recent 25
            title = `📊 ${targetUser.displayName}'s Recent Activity`;
            color = '#00ff00';
            break;
        case 'positive':
            filteredHistory = allHistory.filter(entry => entry.point_change > 0);
            title = `📊 ${targetUser.displayName}'s Positive Changes`;
            color = '#00ff00';
            break;
        case 'negative':
            filteredHistory = allHistory.filter(entry => entry.point_change < 0);
            title = `📊 ${targetUser.displayName}'s Negative Changes`;
            color = '#ff0000';
            break;
        case 'all':
        default:
            filteredHistory = allHistory;
            title = `📊 ${targetUser.displayName}'s Complete History`;
            color = serverConfig.embed_color || '#5865F2';
            break;
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
    const startIndex = page * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageHistory = filteredHistory.slice(startIndex, endIndex);
    
    // Create embed with sync group info if applicable
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setThumbnail(targetUser.displayAvatarURL());
    
    // Add sync group info if applicable
    if (syncStatus) {
        embed.setDescription(`🔗 **Sync Group:** ${syncStatus.sync_groups.group_name}\n*Score and history combined across all synced servers*`);
    }
    
    embed.addFields([
        { 
            name: 'Current Score', 
            value: `**${currentScore}** point${Math.abs(currentScore) !== 1 ? 's' : ''}`, 
            inline: true 
        },
        { 
            name: 'Total Changes', 
            value: `${allHistory.length} record${allHistory.length !== 1 ? 's' : ''}`, 
            inline: true 
        },
        {
            name: 'View Mode',
            value: `${viewMode.charAt(0).toUpperCase() + viewMode.slice(1)} (${filteredHistory.length} entries)`,
                inline: true
            }
        ])
        .setTimestamp();

    // Add history entries if available
    if (pageHistory.length > 0) {
        const historyText = pageHistory.map((entry, index) => {
            const globalIndex = startIndex + index + 1;
            const change = entry.point_change > 0 ? `+${entry.point_change}` : `${entry.point_change}`;
            const timeAgo = getTimeAgo(entry.created_at);
            
            // Add message link if available
            let messageLink = '';
            if (entry.message_id && entry.channel_id) {
                messageLink = ` [🔗](https://discord.com/channels/${serverId}/${entry.channel_id}/${entry.message_id})`;
            }
            
            return `${globalIndex}. **${change}** - ${entry.reason}${messageLink} *(${timeAgo})*`;
        }).join('\n');

        embed.addFields([
            { 
                name: `History ${totalPages > 1 ? `(Page ${page + 1}/${totalPages})` : ''}`, 
                value: historyText, 
                inline: false 
            }
        ]);
    } else {
        embed.addFields([
            { 
                name: 'History', 
                value: `No ${viewMode === 'all' ? '' : viewMode + ' '}score changes found`, 
                inline: false 
            }
        ]);
    }

    // Add footer with pagination info
    if (totalPages > 1) {
        embed.setFooter({ 
            text: `Page ${page + 1}/${totalPages} | ${filteredHistory.length} total entries | Expires in 5 minutes` 
        });
    } else {
        embed.setFooter({ 
            text: `${filteredHistory.length} total entries | Expires in 5 minutes` 
        });
    }

    // Create button components
    const viewRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('score_view_recent')
                .setLabel('Recent')
                .setEmoji('⚡')
                .setStyle(viewMode === 'recent' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('score_view_positive')
                .setLabel('Positive')
                .setEmoji('➕')
                .setStyle(viewMode === 'positive' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('score_view_negative')
                .setLabel('Negative')
                .setEmoji('➖')
                .setStyle(viewMode === 'negative' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('score_view_all')
                .setLabel('All')
                .setEmoji('📋')
                .setStyle(viewMode === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('score_refresh')
                .setLabel('Refresh')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary)
        );

    const components = [viewRow];

    // Add pagination row if needed
    if (totalPages > 1) {
        const paginationRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('score_page_prev')
                    .setLabel('Previous')
                    .setEmoji('⬅️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('score_page_next')
                    .setLabel('Next')
                    .setEmoji('➡️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= totalPages - 1)
            );
        components.push(paginationRow);
    }

    return {
        embed,
        components
    };
}

/**
 * Get extended user history with message IDs from pending votes (combined from sync group if applicable)
 * @param {string} userId - Discord user ID
 * @param {string} serverId - Discord server ID
 * @param {number} limit - Number of history entries to return
 * @param {Object} syncStatus - Sync status object (if server is in sync group)
 * @returns {Promise<Array>} Extended score history entries with message IDs
 */
async function getExtendedUserHistory(userId, serverId, limit = 50, syncStatus = null) {
    try {
        const { supabase } = require('../config/database');
        
        let serverIds = [serverId];
        
        // If server is in sync group, get history from all servers in the group
        if (syncStatus) {
            const { data: groupMembers } = await supabase
                .from('sync_group_members')
                .select('server_id::text')
                .eq('sync_code', syncStatus.sync_code)
                .eq('is_active', true);
            
            if (groupMembers && groupMembers.length > 0) {
                serverIds = groupMembers.map(m => m.server_id);
            }
        }
        
        // Get extended history with message IDs from all relevant servers
        const { data: extendedData, error: extendedError } = await supabase
            .from('score_history')
            .select(`
                point_change,
                reason,
                created_at,
                awarded_by,
                vote_id,
                message_id,
                channel_id,
                server_id::text
            `)
            .eq('user_id', userId)
            .in('server_id', serverIds)
            .order('created_at', { ascending: false })
            .limit(limit);
        
        if (extendedError) {
            console.warn('Error getting extended history, falling back to basic history:', extendedError);
            // Fallback to basic history from all relevant servers
            if (syncStatus && serverIds.length > 1) {
                // Get basic history from all synced servers
                const allBasicHistory = [];
                for (const sId of serverIds) {
                    const serverHistory = await DatabaseUtils.getUserHistory(userId, sId, Math.ceil(limit / serverIds.length));
                    allBasicHistory.push(...serverHistory);
                }
                // Sort by created_at and limit
                return allBasicHistory
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                    .slice(0, limit);
            } else {
                return await DatabaseUtils.getUserHistory(userId, serverId, limit);
            }
        }
        
        if (!extendedData || extendedData.length === 0) {
            console.log('No extended data found, falling back to basic history');
            // Same fallback as above
            if (syncStatus && serverIds.length > 1) {
                const allBasicHistory = [];
                for (const sId of serverIds) {
                    const serverHistory = await DatabaseUtils.getUserHistory(userId, sId, Math.ceil(limit / serverIds.length));
                    allBasicHistory.push(...serverHistory);
                }
                return allBasicHistory
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                    .slice(0, limit);
            } else {
                return await DatabaseUtils.getUserHistory(userId, serverId, limit);
            }
        }
        
        console.log(`Found ${extendedData.length} extended history entries`);
        
        // Transform the data to include message IDs
        const enhancedHistory = extendedData.map(entry => ({
            point_change: entry.point_change,
            reason: entry.reason,
            created_at: entry.created_at,
            awarded_by: entry.awarded_by,
            vote_id: entry.vote_id,
            message_id: entry.message_id,
            channel_id: entry.channel_id
        }));
        
        console.log(`Returning ${enhancedHistory.length} enhanced history entries`);
        return enhancedHistory;
        
    } catch (error) {
        console.error('Error getting extended user history:', error);
        // Fallback to basic history
        console.log('Falling back to basic history due to error');
        return await DatabaseUtils.getUserHistory(userId, serverId, limit);
    }
}

/**
 * Get human-readable time ago string
 * @param {Date} date - The date to compare
 * @returns {string} Time ago string
 */
function getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - new Date(date)) / 1000);

    if (diffInSeconds < 60) {
        return `${diffInSeconds}s ago`;
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours}h ago`;
    } else {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days}d ago`;
    }
}
