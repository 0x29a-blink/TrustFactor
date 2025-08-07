const { spawn } = require('child_process');
const path = require('path');

class BotProcessManager {
    constructor() {
        this.isRestarting = false;
        this.restartCount = 0;
        this.maxRestarts = 5;
        this.restartDelay = 2000; // 2 seconds
    }

    startBot() {
        if (this.isRestarting) {
            console.log('Bot is already restarting, skipping...');
            return;
        }

        console.log('Starting Discord bot...');
        
        const botProcess = spawn('node', ['src/index.js'], {
            stdio: 'inherit',
            cwd: __dirname
        });

        botProcess.on('exit', (code) => {
            console.log(`Bot process exited with code: ${code}`);
            
            if (code === 0 && this.restartCount < this.maxRestarts) {
                // Clean exit, restart the bot
                this.restartBot();
            } else if (code !== 0) {
                // Error exit, don't restart
                console.log('Bot crashed with error, not restarting automatically');
                process.exit(code);
            } else {
                // Max restarts reached or normal shutdown
                console.log('Max restarts reached or normal shutdown');
                process.exit(0);
            }
        });

        botProcess.on('error', (error) => {
            console.error('Failed to start bot process:', error);
            process.exit(1);
        });

        // Handle process termination signals
        process.on('SIGINT', () => {
            console.log('Received SIGINT, shutting down...');
            botProcess.kill('SIGINT');
        });

        process.on('SIGTERM', () => {
            console.log('Received SIGTERM, shutting down...');
            botProcess.kill('SIGTERM');
        });
    }

    restartBot() {
        if (this.isRestarting) {
            return;
        }

        this.isRestarting = true;
        this.restartCount++;

        console.log(`Restarting bot in ${this.restartDelay}ms... (Attempt ${this.restartCount}/${this.maxRestarts})`);

        setTimeout(() => {
            this.isRestarting = false;
            this.startBot();
        }, this.restartDelay);
    }
}

// Start the process manager
const manager = new BotProcessManager();
manager.startBot();
