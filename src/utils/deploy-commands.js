require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Resolve environment profile and pick suffixed or base vars
const PROFILE = (process.env.BOT_PROFILE || process.env.ENV_PROFILE || 'dev').toLowerCase();
const SUFFIX = PROFILE.toUpperCase();
const resolveEnv = (base) => process.env[`${base}_${SUFFIX}`] ?? process.env[base];

// Get bot token and client ID from environment
const token = resolveEnv('DISCORD_TOKEN');
const clientId = resolveEnv('CLIENT_ID');

if (!token) {
    const logger = require('./logger');
    logger.error('❌ DISCORD_TOKEN is required in .env file', 'DEPLOY');
    process.exit(1);
}

if (!clientId) {
    const logger2 = require('./logger');
    logger2.error('❌ CLIENT_ID is required in .env file', 'DEPLOY');
    logger2.info('💡 Get your CLIENT_ID from Discord Developer Portal > General Information > Application ID', 'DEPLOY');
    process.exit(1);
}

// Load all commands
const commands = [];
const commandsPath = path.join(__dirname, '..', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        const logger3 = require('./logger');
        logger3.info(`✅ Loaded command: ${command.data.name}`, 'DEPLOY');
    } else {
        console.log(`⚠️ Command at ${filePath} is missing required "data" or "execute" property.`);
    }
}

// Create REST instance
const rest = new REST().setToken(token);

// Deploy commands
async function deployCommands() {
    try {
        const logger4 = require('./logger');
        logger4.info(`🚀 Started refreshing ${commands.length} application (/) commands.`, 'DEPLOY');

        // Register commands globally (available in all servers)
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        const logger5 = require('./logger');
        logger5.info(`✅ Successfully reloaded ${data.length} application (/) commands.`, 'DEPLOY');
        logger5.info('📝 Registered commands:', 'DEPLOY');
        data.forEach(cmd => logger5.info(`  - /${cmd.name}: ${cmd.description}`,'DEPLOY'));
        
    } catch (error) {
        const logger6 = require('./logger');
        logger6.errorWithStack('❌ Error deploying commands', error, 'DEPLOY');
        process.exit(1);
    }
}

// Run deployment
deployCommands();
