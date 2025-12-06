require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

// Initialize Discord client with required intents and partials
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember
    ]
});

// Initialize command collection
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
let loadedCommands = 0;
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            loadedCommands++;
    } else {
        logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`, 'LOAD');
    }    
}
logger.command(`Loaded ${loadedCommands} commands.`, 'LOAD');

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
let loadedEvents = 0;
for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
        loadedEvents++;
    } else {
        client.on(event.name, (...args) => event.execute(...args));
        loadedEvents++;
    }
}
logger.event(`Loaded ${loadedEvents} events.`, 'LOAD');

// If running under ShardingManager, log shard id
if (client.shard) {
    client.once('ready', () => {
        try {
            const shardId = client.shard.ids?.[0];
            if (typeof shardId === 'number') {
                logger.lifecycle(`Client ready on shard ${shardId}`, 'SHARD');
            }
        } catch (_) { /* ignore */ }
    });
}

// Global error handling
process.on('unhandledRejection', error => {
    logger.errorWithStack('Unhandled promise rejection', error, 'PROCESS');
});

process.on('uncaughtException', error => {
    logger.errorWithStack('Uncaught exception', error, 'PROCESS');
    process.exit(1);
});

// Resolve environment profile (e.g., 'main' or 'dev') and pick suffixed vars if present
const PROFILE = (process.env.BOT_PROFILE || process.env.ENV_PROFILE || 'dev').toLowerCase();
const SUFFIX = PROFILE.toUpperCase();
const resolveEnv = (base) => process.env[`${base}_${SUFFIX}`] ?? process.env[base];

// Login to Discord
const discordToken = resolveEnv('DISCORD_TOKEN');
if (!discordToken) {
    logger.error(`Missing DISCORD_TOKEN (or DISCORD_TOKEN_${SUFFIX}) for profile '${PROFILE}'`, 'LOGIN');
    process.exit(1);
}

client.login(discordToken).catch(error => {
    logger.errorWithStack('Failed to login to Discord', error, 'LOGIN');
    process.exit(1);
});
