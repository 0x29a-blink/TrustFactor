const fs = require('fs');
const path = require('path');

/**
 * Log levels in order of severity
 */
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    VERBOSE: 4
};

/**
 * Log level names for display
 */
const LOG_LEVEL_NAMES = {
    0: 'ERROR',
    1: 'WARN',
    2: 'INFO',
    3: 'DEBUG',
    4: 'VERBOSE'
};

/**
 * Log colors for console output
 */
const LOG_COLORS = {
    ERROR: '\x1b[31m',   // Red
    WARN: '\x1b[33m',    // Yellow
    INFO: '\x1b[36m',    // Cyan
    DEBUG: '\x1b[35m',   // Magenta
    VERBOSE: '\x1b[90m', // Gray
    RESET: '\x1b[0m'     // Reset
};

/**
 * Logger class with configurable log levels
 */
class Logger {
    constructor() {
        this.logLevel = this.getLogLevel();
        this.logToFile = process.env.LOG_TO_FILE === 'true';
        this.logFilePath = process.env.LOG_FILE_PATH || 'logs/trustfactor-bot.log';
        this.maxLogFileSize = parseInt(process.env.MAX_LOG_FILE_SIZE) || 10 * 1024 * 1024; // 10MB default
        
        // Ensure logs directory exists
        if (this.logToFile) {
            this.ensureLogDirectory();
        }
    }

    /**
     * Get the current log level from environment variables
     */
    getLogLevel() {
        const level = process.env.LOG_LEVEL || 'VERBOSE';
        const upperLevel = level.toUpperCase();
        
        if (LOG_LEVELS[upperLevel] !== undefined) {
            return LOG_LEVELS[upperLevel];
        }
        
        console.warn(`Invalid LOG_LEVEL "${level}", defaulting to VERBOSE`);
        return LOG_LEVELS.VERBOSE;
    }

    /**
     * Ensure the logs directory exists
     */
    ensureLogDirectory() {
        const logDir = path.dirname(this.logFilePath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    /**
     * Rotate log file if it's too large
     */
    rotateLogFile() {
        if (!this.logToFile) return;

        try {
            const stats = fs.statSync(this.logFilePath);
            if (stats.size > this.maxLogFileSize) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupPath = `${this.logFilePath}.${timestamp}`;
                fs.renameSync(this.logFilePath, backupPath);
                console.log(`📁 Log file rotated to: ${backupPath}`);
            }
        } catch (error) {
            // File doesn't exist or other error, ignore
        }
    }

    /**
     * Format timestamp for logging
     */
    formatTimestamp() {
        return new Date().toISOString();
    }

    /**
     * Format log message
     */
    formatMessage(level, message, context = null) {
        const timestamp = this.formatTimestamp();
        const levelName = LOG_LEVEL_NAMES[level];
        const contextStr = context ? ` [${context}]` : '';
        return `[${timestamp}] ${levelName}${contextStr}: ${message}`;
    }

    /**
     * Write log to file
     */
    writeToFile(message) {
        if (!this.logToFile) return;

        try {
            this.rotateLogFile();
            fs.appendFileSync(this.logFilePath, message + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    /**
     * Log a message if the current log level allows it
     */
    log(level, message, context = null) {
        if (level > this.logLevel) return;

        const formattedMessage = this.formatMessage(level, message, context);
        const levelName = LOG_LEVEL_NAMES[level];
        const color = LOG_COLORS[levelName] || LOG_COLORS.RESET;

        // Console output with colors
        console.log(`${color}${formattedMessage}${LOG_COLORS.RESET}`);

        // File output (without colors)
        this.writeToFile(formattedMessage);
    }

    /**
     * Log error messages
     */
    error(message, context = null) {
        this.log(LOG_LEVELS.ERROR, message, context);
    }

    /**
     * Log warning messages
     */
    warn(message, context = null) {
        this.log(LOG_LEVELS.WARN, message, context);
    }

    /**
     * Log info messages
     */
    info(message, context = null) {
        this.log(LOG_LEVELS.INFO, message, context);
    }

    /**
     * Log debug messages
     */
    debug(message, context = null) {
        this.log(LOG_LEVELS.DEBUG, message, context);
    }

    /**
     * Log verbose messages
     */
    verbose(message, context = null) {
        this.log(LOG_LEVELS.VERBOSE, message, context);
    }

    /**
     * Log database operations
     */
    db(message, context = null) {
        this.debug(`🗄️ ${message}`, context ? `DB-${context}` : 'DB');
    }

    /**
     * Log Discord API operations
     */
    discord(message, context = null) {
        this.debug(`🤖 ${message}`, context ? `DISCORD-${context}` : 'DISCORD');
    }

    /**
     * Log sync operations
     */
    sync(message, context = null) {
        this.info(`🔄 ${message}`, context ? `SYNC-${context}` : 'SYNC');
    }

    /**
     * Log voting operations
     */
    vote(message, context = null) {
        this.info(`🗳️ ${message}`, context ? `VOTE-${context}` : 'VOTE');
    }

    /**
     * Log configuration operations
     */
    config(message, context = null) {
        this.info(`⚙️ ${message}`, context ? `CONFIG-${context}` : 'CONFIG');
    }

    /**
     * Log user interactions
     */
    user(message, context = null) {
        this.verbose(`👤 ${message}`, context ? `USER-${context}` : 'USER');
    }

    /**
     * Log command executions
     */
    command(message, context = null) {
        this.info(`📝 ${message}`, context ? `CMD-${context}` : 'CMD');
    }

    /**
     * Log event handling
     */
    event(message, context = null) {
        this.debug(`📡 ${message}`, context ? `EVENT-${context}` : 'EVENT');
    }

    /**
     * Log performance metrics
     */
    perf(message, context = null) {
        this.verbose(`⏱️ ${message}`, context ? `PERF-${context}` : 'PERF');
    }

    /**
     * Log security events
     */
    security(message, context = null) {
        this.warn(`🔒 ${message}`, context ? `SECURITY-${context}` : 'SECURITY');
    }

    /**
     * Log startup/shutdown events
     */
    lifecycle(message, context = null) {
        this.info(`🚀 ${message}`, context ? `LIFECYCLE-${context}` : 'LIFECYCLE');
    }

    /**
     * Log with object details (for debugging)
     */
    object(message, obj, context = null) {
        if (this.logLevel >= LOG_LEVELS.DEBUG) {
            const objStr = typeof obj === 'object' ? JSON.stringify(obj, null, 2) : String(obj);
            this.debug(`${message}\n${objStr}`, context);
        }
    }

    /**
     * Log with stack trace for errors
     */
    errorWithStack(message, error, context = null) {
        this.error(`${message}: ${error.message}`, context);
        if (error.stack && this.logLevel >= LOG_LEVELS.DEBUG) {
            this.debug(`Stack trace:\n${error.stack}`, context);
        }
    }

    /**
     * Get current log level name
     */
    getCurrentLevelName() {
        return LOG_LEVEL_NAMES[this.logLevel];
    }

    /**
     * Check if a log level is enabled
     */
    isLevelEnabled(level) {
        return level <= this.logLevel;
    }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger; 