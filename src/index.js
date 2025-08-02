require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

// Initialize Discord client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Initialize command collection
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        logger.command(`Loaded command: ${command.data.name}`, 'LOAD');
    } else {
        logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`, 'LOAD');
    }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
    logger.event(`Loaded event: ${event.name}`, 'LOAD');
}

// Global error handling
process.on('unhandledRejection', error => {
    logger.errorWithStack('Unhandled promise rejection', error, 'PROCESS');
});

process.on('uncaughtException', error => {
    logger.errorWithStack('Uncaught exception', error, 'PROCESS');
    process.exit(1);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch(error => {
    logger.errorWithStack('Failed to login to Discord', error, 'LOGIN');
    process.exit(1);
});
