const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { exec } = require('child_process');
const { promisify } = require('util');
const logger = require('../utils/logger');

const execAsync = promisify(exec);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Pull latest changes and restart the bot (Owner only)')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('confirm')
                .setDescription('Type "UPDATE" to confirm the update')
                .setRequired(true)),
    // Mark this command to be deployed only to the owner guild
    ownerGuildOnly: true,

    async execute(interaction) {
        // Ensure this command is only used in a guild and in the owner guild
        const ownerGuildId = process.env.OWNER_GUILD_ID;
        if (!interaction.inGuild()) {
            return await interaction.reply({
                content: '❌ This command can only be used within a server.',
                flags: MessageFlags.Ephemeral
            });
        }
        if (ownerGuildId && interaction.guildId !== ownerGuildId) {
            return await interaction.reply({
                content: '❌ This command is not available in this server.',
                flags: MessageFlags.Ephemeral
            });
        }
        // Check if user is the bot owner
        const ownerId = process.env.OWNER_ID;
        if (!ownerId || interaction.user.id !== ownerId) {
            return await interaction.reply({
                content: '❌ This command is restricted to the bot owner only.',
                flags: MessageFlags.Ephemeral
            });
        }

        const confirmation = interaction.options.getString('confirm');
        
        if (confirmation !== 'UPDATE') {
            return await interaction.reply({
                content: '❌ Update cancelled. You must type "UPDATE" exactly to proceed.',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            // Defer reply since this might take some time
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const embed = new EmbedBuilder()
                .setColor('#ffa500')
                .setTitle('🔄 Bot Update in Progress')
                .setDescription('Pulling latest changes and restarting the bot...')
                .addFields([
                    { name: 'Status', value: '⏳ Starting update process...', inline: true },
                    { name: 'Triggered By', value: `${interaction.user}`, inline: true }
                ])
                .setFooter({ text: 'Owner command' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Execute git pull
            logger.info('Starting bot update process', 'UPDATE');
            
            const { stdout: pullOutput, stderr: pullError } = await execAsync('git pull origin main');
            
            if (pullError) {
                logger.error(`Git pull error: ${pullError}`, 'UPDATE');
                throw new Error(`Git pull failed: ${pullError}`);
            }

            logger.info(`Git pull successful: ${pullOutput.trim()}`, 'UPDATE');

            // Check if there were any changes
            const hasChanges = !pullOutput.includes('Already up to date');
            
            if (!hasChanges) {
                const noChangesEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ No Updates Available')
                    .setDescription('The bot is already up to date!')
                    .addFields([
                        { name: 'Status', value: '✅ No changes to pull', inline: true },
                        { name: 'Triggered By', value: `${interaction.user}`, inline: true }
                    ])
                    .setFooter({ text: 'Owner command' })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [noChangesEmbed] });
            }

            // Update embed with pull results
            const pullEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('📥 Changes Pulled Successfully')
                .setDescription('Latest changes have been pulled from the repository.')
                .addFields([
                    { name: 'Status', value: '✅ Git pull completed', inline: true },
                    { name: 'Changes', value: '📦 New changes detected', inline: true },
                    { name: 'Next Step', value: '🔄 Preparing restart...', inline: true }
                ])
                .setFooter({ text: 'Owner command' })
                .setTimestamp();

            await interaction.editReply({ embeds: [pullEmbed] });

            // Install dependencies if package.json was updated
            if (pullOutput.includes('package.json') || pullOutput.includes('package-lock.json')) {
                logger.info('Package files updated, installing dependencies...', 'UPDATE');
                
                const { stdout: installOutput, stderr: installError } = await execAsync('npm install');
                
                if (installError) {
                    logger.error(`NPM install error: ${installError}`, 'UPDATE');
                    throw new Error(`Dependency installation failed: ${installError}`);
                }

                logger.info('Dependencies installed successfully', 'UPDATE');
            }

            // Final restart embed
            const restartEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🔄 Bot Restarting')
                .setDescription('The bot will restart in 3 seconds to apply the updates...')
                .addFields([
                    { name: 'Status', value: '🔄 Restarting...', inline: true },
                    { name: 'Changes Applied', value: '✅ Updates pulled and installed', inline: true },
                    { name: 'Triggered By', value: `${interaction.user}`, inline: true }
                ])
                .setFooter({ text: 'Owner command - Bot will restart shortly' })
                .setTimestamp();

            await interaction.editReply({ embeds: [restartEmbed] });

            // Log the update action
            logger.info(`Bot update completed by ${interaction.user.tag} (${interaction.user.id})`, 'UPDATE');

            // Wait 3 seconds then restart
            setTimeout(() => {
                logger.info('Restarting bot after update...', 'UPDATE');
                process.exit(0); // Exit with code 0 to indicate clean restart
            }, 3000);

        } catch (error) {
            logger.errorWithStack('Error during bot update', error, 'UPDATE');
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Update Failed')
                .setDescription('An error occurred during the update process.')
                .addFields([
                    { name: 'Error', value: error.message || 'Unknown error', inline: false },
                    { name: 'Status', value: '❌ Update aborted', inline: true },
                    { name: 'Triggered By', value: `${interaction.user}`, inline: true }
                ])
                .setFooter({ text: 'Owner command - Error occurred' })
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};
