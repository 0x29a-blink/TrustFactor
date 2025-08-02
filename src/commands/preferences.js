const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const DatabaseUtils = require('../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('preferences')
        .setDescription('Manage your personal bot preferences')
        .addSubcommand(subcommand =>
            subcommand
                .setName('dm-notifications')
                .setDescription('Toggle whether you receive DM notifications from the bot')
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Enable or disable DM notifications')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View your current preferences')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        try {
            if (subcommand === 'dm-notifications') {
                const enabled = interaction.options.getBoolean('enabled');
                
                // Update user's DM preference
                const success = await DatabaseUtils.setUserDMPreference(userId, enabled);
                
                if (!success) {
                    return await interaction.reply({
                        content: '❌ Failed to update your DM notification preference. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(enabled ? '#00ff00' : '#ff8c00')
                    .setTitle('✅ DM Notifications Updated')
                    .setDescription(`DM notifications have been **${enabled ? 'enabled' : 'disabled'}**.`)
                    .addFields([
                        {
                            name: enabled ? '📬 You will receive DMs' : '📭 You will not receive DMs',
                            value: enabled 
                                ? 'The bot will send you direct messages for vote confirmations, score updates, and other notifications.'
                                : 'The bot will not send you any direct messages. You may miss some feedback and notifications.',
                            inline: false
                        }
                    ])
                    .setFooter({ text: 'You can change this setting anytime with /preferences dm-notifications' })
                    .setTimestamp();

                await interaction.reply({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });

            } else if (subcommand === 'view') {
                // Get user's current preferences
                const dmEnabled = await DatabaseUtils.getUserDMPreference(userId);
                
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('⚙️ Your Bot Preferences')
                    .setDescription('Here are your current bot preferences:')
                    .addFields([
                        {
                            name: '📬 DM Notifications',
                            value: dmEnabled ? '✅ Enabled' : '❌ Disabled',
                            inline: true
                        },
                        {
                            name: 'What this affects',
                            value: dmEnabled 
                                ? 'You will receive DMs for vote confirmations, score updates, and notifications.'
                                : 'You will not receive any DMs from the bot.',
                            inline: false
                        }
                    ])
                    .setFooter({ text: 'Use /preferences dm-notifications to change your DM setting' })
                    .setTimestamp();

                await interaction.reply({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });
            }

        } catch (error) {
            console.error('Error in preferences command:', error);
            await interaction.reply({
                content: '❌ An error occurred while managing your preferences. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
