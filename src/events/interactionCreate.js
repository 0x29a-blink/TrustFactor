const { Events, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Log all user interactions
        logger.user(`User ${interaction.user.tag} (${interaction.user.id}) initiated interaction`, 'INTERACTION');
        logger.verbose(`Interaction type: ${interaction.type}, Guild: ${interaction.guild?.name || 'DM'}`, 'INTERACTION');
        
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            
            // Log command execution
            logger.command(`Command executed: /${interaction.commandName} by ${interaction.user.tag}`, 'EXECUTE');
            logger.verbose(`Command options: ${JSON.stringify(interaction.options.data)}`, 'COMMAND');

            if (!command) {
                logger.error(`No command matching ${interaction.commandName} was found`, 'COMMAND');
                return;
            }

            try {
                await command.execute(interaction);
                logger.command(`Command /${interaction.commandName} completed successfully`, 'EXECUTE');
            } catch (error) {
                logger.errorWithStack(`Error executing command /${interaction.commandName}`, error, 'COMMAND');
                
                const errorMessage = 'There was an error while executing this command!';
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
                }
            }
        }
        
        // Handle button interactions (for voting and navigation)
        else if (interaction.isButton()) {
            logger.user(`Button clicked: ${interaction.customId} by ${interaction.user.tag}`, 'BUTTON');
            logger.verbose(`Button interaction details: ${JSON.stringify({ customId: interaction.customId, componentType: interaction.componentType })}`, 'BUTTON');
            
            try {
                await handleButtonInteraction(interaction);
                logger.user(`Button interaction completed: ${interaction.customId}`, 'BUTTON');
            } catch (error) {
                logger.errorWithStack(`Error handling button interaction ${interaction.customId}`, error, 'BUTTON');
                
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'There was an error processing your interaction!', flags: MessageFlags.Ephemeral });
                }
            }
        }
        
        // Handle select menu interactions (for config and other dropdowns)
        else if (interaction.isStringSelectMenu()) {
            logger.user(`Select menu used: ${interaction.customId} by ${interaction.user.tag}`, 'SELECT');
            logger.verbose(`Select menu values: ${JSON.stringify(interaction.values)}`, 'SELECT');
            
            try {
                await handleSelectMenuInteraction(interaction);
                logger.user(`Select menu interaction completed: ${interaction.customId}`, 'SELECT');
            } catch (error) {
                logger.errorWithStack(`Error handling select menu interaction ${interaction.customId}`, error, 'SELECT');
                
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'There was an error processing your interaction!', flags: MessageFlags.Ephemeral });
                }
            }
        }
        
        // Handle modal submit interactions (for custom input forms)
        else if (interaction.isModalSubmit()) {
            logger.user(`Modal submitted: ${interaction.customId} by ${interaction.user.tag}`, 'MODAL');
            logger.verbose(`Modal fields: ${JSON.stringify(interaction.fields.fields)}`, 'MODAL');
            
            try {
                await handleModalSubmitInteraction(interaction);
                logger.user(`Modal submission completed: ${interaction.customId}`, 'MODAL');
            } catch (error) {
                logger.errorWithStack(`Error handling modal submit interaction ${interaction.customId}`, error, 'MODAL');
                
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'There was an error processing your form submission!', flags: MessageFlags.Ephemeral });
                }
            }
        }
    },
};

/**
 * Handle modal submit interactions for custom input forms
 * @param {ModalSubmitInteraction} interaction - The modal submit interaction
 */
async function handleModalSubmitInteraction(interaction) {
    const { customId } = interaction;
    
    logger.verbose(`Processing modal submit: ${customId}`, 'MODAL');
    
    // Config menu modals (all config-related modals)
    if (customId.startsWith('config_')) {
        logger.config(`Config modal submitted: ${customId}`, 'MODAL');
        const ConfigCommand = require('../commands/config');
        await ConfigCommand.handleModalSubmit(interaction);
    }
    
    // Unknown modal
    else {
        logger.warn(`Unknown modal submit interaction: ${customId}`, 'MODAL');
        await interaction.reply({ content: 'Unknown form submission!', flags: MessageFlags.Ephemeral });
    }
}

/**
 * Handle select menu interactions for config and other dropdowns
 * @param {StringSelectMenuInteraction} interaction - The select menu interaction
 */
async function handleSelectMenuInteraction(interaction) {
    const { customId } = interaction;
    
    logger.verbose(`Processing select menu: ${customId}`, 'SELECT');
    
    // Config menu select menus
    if (customId.startsWith('config_')) {
        logger.config(`Config select menu used: ${customId}`, 'SELECT');
        const ConfigCommand = require('../commands/config');
        await ConfigCommand.handleConfigInteraction(interaction);
    }
    
    // Sync menu select menus
    else if (customId.startsWith('sync_')) {
        logger.sync(`Sync select menu used: ${customId}`, 'SELECT');
        const SyncCommand = require('../commands/sync');
        await SyncCommand.handleComponentInteraction(interaction);
    }
    
    // Unknown select menu
    else {
        logger.warn(`Unknown select menu interaction: ${customId}`, 'SELECT');
        await interaction.reply({ content: 'Unknown interaction!', flags: MessageFlags.Ephemeral });
    }
}

/**
 * Handle button interactions for voting and navigation
 * @param {ButtonInteraction} interaction - The button interaction
 */
async function handleButtonInteraction(interaction) {
    const { customId } = interaction;
    
    logger.verbose(`Processing button: ${customId}`, 'BUTTON');
    
    // Vote buttons (approve/reject)
    if (customId.startsWith('vote_')) {
        logger.vote(`Vote button clicked: ${customId}`, 'BUTTON');
        const VotingUtils = require('../utils/voting');
        await VotingUtils.handleVoteButton(interaction);
    }
    
    // Config menu buttons and selects
    else if (customId.startsWith('config_')) {
        logger.config(`Config button clicked: ${customId}`, 'BUTTON');
        const ConfigCommand = require('../commands/config');
        await ConfigCommand.handleConfigInteraction(interaction);
    }
    
    // Sync menu buttons
    else if (customId.startsWith('sync_') || customId === 'confirm_disband' || customId === 'confirm_dissolve' || customId === 'confirm_transfer' || customId === 'cancel_leave' || customId === 'cancel_disband') {
        logger.sync(`Sync button clicked: ${customId}`, 'BUTTON');
        const SyncCommand = require('../commands/sync');
        await SyncCommand.handleComponentInteraction(interaction);
    }
    
    // Leaderboard buttons are handled by the command collector, not here
    else if (customId.startsWith('leaderboard_')) {
        // These are handled by the leaderboard command's collector
        // No action needed here - the collector will handle it
        logger.verbose(`Leaderboard button ${customId} handled by command collector`, 'BUTTON');
        return;
    }
    
    // Score buttons are handled by the command collector, not here
    else if (customId.startsWith('score_')) {
        // These are handled by the score command's collector
        // No action needed here - the collector will handle it
        logger.verbose(`Score button ${customId} handled by command collector`, 'BUTTON');
        return;
    }
    
    // Unknown button
    else {
        logger.warn(`Unknown button interaction: ${customId}`, 'BUTTON');
        await interaction.reply({ content: 'Unknown interaction!', flags: MessageFlags.Ephemeral });
    }
}
