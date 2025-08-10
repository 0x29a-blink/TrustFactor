const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');

/**
 * Map Discord application command option type to human-readable label
 */
function getOptionTypeLabel(optionType) {
  const typeMap = {
    1: 'Subcommand',
    2: 'Subcommand Group',
    3: 'String',
    4: 'Integer',
    5: 'Boolean',
    6: 'User',
    7: 'Channel',
    8: 'Role',
    9: 'Mentionable',
    10: 'Number',
    11: 'Attachment',
  };
  return typeMap[optionType] || 'Unknown';
}

/**
 * Format a single option line
 */
function formatOptionLine(option) {
  const type = getOptionTypeLabel(option.type);
  const required = option.required ? 'required' : 'optional';
  const pieces = [`• ${option.name}`];
  pieces.push(`(${type}, ${required})`);
  if (option.description) pieces.push(`— ${option.description}`);
  return pieces.join(' ');
}

/**
 * Extract subcommands and top-level options from a command JSON
 */
function extractCommandStructure(commandJson) {
  const structure = {
    topLevelOptions: [],
    subcommands: [],
  };

  const options = Array.isArray(commandJson.options) ? commandJson.options : [];

  for (const option of options) {
    if (option.type === 1) {
      // Subcommand
      structure.subcommands.push({
        path: option.name,
        description: option.description || '',
        options: Array.isArray(option.options) ? option.options : [],
      });
    } else if (option.type === 2) {
      // Subcommand group → flatten to group subcommand
      const groupName = option.name;
      const groupOptions = Array.isArray(option.options) ? option.options : [];
      for (const sub of groupOptions) {
        if (sub.type === 1) {
          structure.subcommands.push({
            path: `${groupName} ${sub.name}`,
            description: sub.description || '',
            options: Array.isArray(sub.options) ? sub.options : [],
          });
        }
      }
    } else {
      // Top-level option
      structure.topLevelOptions.push(option);
    }
  }

  return structure;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show information about available commands and their options')
    .addStringOption(option =>
      option
        .setName('command')
        .setDescription('Get detailed help for a specific command (e.g., award, score, admin)')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      const requestedCommand = interaction.options.getString('command');
      const ownerGuildId = process.env.OWNER_GUILD_ID;

      // Collect visible commands for this guild (filter out owner-guild-only when not in owner guild)
      const allCommands = Array.from(interaction.client.commands.values());
      const visibleCommands = allCommands.filter(cmd => {
        if (!cmd) return false;
        if (cmd.ownerGuildOnly && interaction.inGuild() && ownerGuildId && interaction.guildId !== ownerGuildId) {
          return false;
        }
        return Boolean(cmd.data && cmd.execute);
      });

      // If a specific command is requested, show detailed help
      if (requestedCommand) {
        // Find command by name (case-insensitive)
        const cmd = visibleCommands.find(c => c.data.name.toLowerCase() === requestedCommand.toLowerCase());

        if (!cmd) {
          return await interaction.reply({
            content: `❌ Unknown command: \`${requestedCommand}\`. Try \`/help\` to see all commands.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const json = cmd.data.toJSON();
        const { topLevelOptions, subcommands } = extractCommandStructure(json);

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`/${json.name}`)
          .setDescription(json.description || 'No description available')
          .setTimestamp();

        // Add permission hint if set
        if (json.default_member_permissions) {
          embed.addFields({
            name: 'Permissions',
            value: 'This command may require specific server permissions to use.',
            inline: false,
          });
        }

        // Subcommands section
        if (subcommands.length > 0) {
          const lines = [];
          for (const sc of subcommands) {
            lines.push(`• /${json.name} ${sc.path} — ${sc.description || 'No description'}`);
            if (Array.isArray(sc.options) && sc.options.length > 0) {
              for (const opt of sc.options) {
                lines.push(`  ${formatOptionLine(opt)}`);
              }
            }
          }

          // Respect Discord field length limits
          const subcommandsText = lines.join('\n').slice(0, 1024);
          embed.addFields({ name: 'Subcommands', value: subcommandsText, inline: false });
        }

        // Top-level options section
        if (topLevelOptions.length > 0) {
          const optLines = topLevelOptions.map(formatOptionLine);
          const optionsText = optLines.join('\n').slice(0, 1024);
          embed.addFields({ name: 'Options', value: optionsText, inline: false });
        }

        // Footer hint
        embed.setFooter({ text: 'Tip: Use /help without arguments to see all commands.' });

        return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // Otherwise, show a general list of commands
      const sorted = visibleCommands
        .map(c => c.data.toJSON())
        .sort((a, b) => a.name.localeCompare(b.name));

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('TrustFactor Bot Commands')
        .setDescription('Basic descriptions of available commands. Use `/help command:<name>` for details.')
        .setTimestamp();

      for (const json of sorted) {
        // Build a compact hint about whether the command has subcommands or options
        const hasSubcommands = (json.options || []).some(o => o.type === 1 || o.type === 2);
        const hasOptions = (json.options || []).some(o => o.type !== 1 && o.type !== 2);
        const hintParts = [];
        if (hasSubcommands) hintParts.push('subcommands');
        if (hasOptions) hintParts.push('options');
        const hint = hintParts.length ? ` (${hintParts.join(', ')})` : '';

        embed.addFields({
          name: `/${json.name}`,
          value: `${json.description || 'No description'}${hint}`,
          inline: false,
        });
      }

      embed.setFooter({ text: 'Tip: /help command:<name> for detailed options' });

      return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      logger.errorWithStack('Error executing help command', error, 'HELP');
      if (interaction.replied || interaction.deferred) {
        return await interaction.followUp({ content: '❌ Failed to display help.', flags: MessageFlags.Ephemeral });
      }
      return await interaction.reply({ content: '❌ Failed to display help.', flags: MessageFlags.Ephemeral });
    }
  },
};


