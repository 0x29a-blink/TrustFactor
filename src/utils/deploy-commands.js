require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Get bot token and client ID from environment
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token) {
    console.error('❌ DISCORD_TOKEN is required in .env file');
    process.exit(1);
}

if (!clientId) {
    console.error('❌ CLIENT_ID is required in .env file');
    console.log('💡 Get your CLIENT_ID from Discord Developer Portal > General Information > Application ID');
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
        console.log(`✅ Loaded command: ${command.data.name}`);
    } else {
        console.log(`⚠️ Command at ${filePath} is missing required "data" or "execute" property.`);
    }
}

// Create REST instance
const rest = new REST().setToken(token);

// Deploy commands
async function deployCommands() {
    try {
        console.log(`🚀 Started refreshing ${commands.length} application (/) commands.`);

        // Register commands globally (available in all servers)
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
        console.log('📝 Registered commands:');
        data.forEach(cmd => console.log(`  - /${cmd.name}: ${cmd.description}`));
        
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
        process.exit(1);
    }
}

// Run deployment
deployCommands();
