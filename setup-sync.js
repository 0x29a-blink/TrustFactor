#!/usr/bin/env node

/**
 * Setup script for TrustFactor Bot Server Sync functionality
 * This script helps initialize the database with sync tables and test the functionality
 */

require('dotenv').config();
const { runMigrations, initializeDatabase } = require('./src/utils/runMigrations');

async function setupSync() {
    console.log('🚀 Setting up TrustFactor Bot Server Sync functionality...\n');
    
    try {
        // Step 1: Initialize database if needed
        console.log('📊 Step 1: Checking database initialization...');
        const initialized = await initializeDatabase();
        if (!initialized) {
            console.error('❌ Database initialization failed');
            process.exit(1);
        }
        console.log('✅ Database initialization complete\n');

        // Step 2: Run migrations
        console.log('🔄 Step 2: Running database migrations...');
        const migrationSuccess = await runMigrations();
        if (!migrationSuccess) {
            console.error('❌ Migration failed');
            process.exit(1);
        }
        console.log('✅ Database migrations complete\n');

        // Step 3: Display setup completion
        console.log('🎉 Server Sync setup completed successfully!\n');
        
        console.log('📋 What was added:');
        console.log('  • New /sync command with subcommands:');
        console.log('    - /sync request - Create a sync group');
        console.log('    - /sync confirm <code> - Join a sync group');
        console.log('    - /sync leave - Leave current sync group');
        console.log('    - /sync status - View sync group status');
        console.log('    - /sync list-servers - List all servers in group');
        console.log('    - /sync set-priority - Set priority server (interactive dropdown)');
        console.log('  • Database tables for sync group management');
        console.log('  • Automatic settings synchronization when priority server changes config');
        console.log('  • Server settings backup and restore functionality\n');
        
        console.log('🔧 Next steps:');
        console.log('  1. Start your bot: node src/index.js');
        console.log('  2. Use /sync request in a server to create a sync group');
        console.log('  3. Share the generated code with other servers');
        console.log('  4. Other servers can join with /sync confirm <code>');
        console.log('  5. Use /sync set-priority to choose which server\'s settings apply to all\n');
        
        console.log('⚠️  Important notes:');
        console.log('  • Original server settings are backed up before joining sync');
        console.log('  • Settings are restored when leaving a sync group');
        console.log('  • Only the priority server\'s settings are applied to all members');
        console.log('  • Config changes on priority server automatically sync to all members\n');

    } catch (error) {
        console.error('❌ Setup failed:', error);
        process.exit(1);
    }
}

// Run setup if this file is executed directly
if (require.main === module) {
    setupSync();
}

module.exports = { setupSync };
