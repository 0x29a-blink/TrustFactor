# TrustFactor Bot Logging System

## Overview

The TrustFactor Bot includes a comprehensive logging system with configurable log levels and multiple output formats. The logging system is designed to provide detailed insights into bot operations while maintaining performance and flexibility.

## Features

- **Configurable Log Levels**: ERROR, WARN, INFO, DEBUG, VERBOSE
- **Colored Console Output**: Different colors for each log level
- **File Logging**: Optional file-based logging with automatic rotation
- **Contextual Logging**: Specialized logging methods for different operations
- **Error Stack Traces**: Automatic stack trace logging for errors
- **Performance Metrics**: Built-in performance logging capabilities

## Configuration

### Environment Variables

Add these variables to your `.env` file:

```env
# Logging Configuration
LOG_LEVEL=VERBOSE                    # ERROR, WARN, INFO, DEBUG, VERBOSE
LOG_TO_FILE=false                    # true/false - Enable file logging
LOG_FILE_PATH=logs/trustfactor-bot.log  # Path to log file
MAX_LOG_FILE_SIZE=10485760          # 10MB in bytes - Max file size before rotation
```

### Log Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| ERROR | Critical errors that prevent operation | Database failures, API errors |
| WARN | Warning conditions that don't stop operation | Missing permissions, timeouts |
| INFO | General operational information | Commands executed, votes processed |
| DEBUG | Detailed debugging information | API calls, database queries |
| VERBOSE | Very detailed information | User interactions, performance metrics |

## Usage

### Basic Logging

```javascript
const logger = require('./utils/logger');

// Basic log levels
logger.error('Critical error occurred', 'CONTEXT');
logger.warn('Warning condition detected', 'CONTEXT');
logger.info('Operation completed successfully', 'CONTEXT');
logger.debug('Debug information', 'CONTEXT');
logger.verbose('Very detailed information', 'CONTEXT');
```

### Specialized Logging Methods

The logger provides specialized methods for different types of operations:

```javascript
// Database operations
logger.db('Database query executed', 'QUERY');

// Discord API operations
logger.discord('API call to Discord', 'API');

// Sync operations
logger.sync('Settings synced between servers', 'SYNC');

// Voting operations
logger.vote('Vote recorded successfully', 'VOTE');

// Configuration operations
logger.config('Server settings updated', 'CONFIG');

// User interactions
logger.user('User executed command', 'USER');

// Command executions
logger.command('Command processed', 'CMD');

// Event handling
logger.event('Event received', 'EVENT');

// Performance metrics
logger.perf('Operation took 150ms', 'PERF');

// Security events
logger.security('Permission denied', 'SECURITY');

// Startup/shutdown events
logger.lifecycle('Bot started successfully', 'LIFECYCLE');
```

### Error Logging

For errors with stack traces:

```javascript
try {
    // Some operation
} catch (error) {
    logger.errorWithStack('Operation failed', error, 'CONTEXT');
}
```

### Object Logging

For debugging complex objects:

```javascript
logger.object('User data', userObject, 'CONTEXT');
```

## Log Output Format

### Console Output (Colored)

```
[2024-01-15T10:30:45.123Z] INFO [CMD]: Command processed
[2024-01-15T10:30:45.124Z] VOTE [VOTE]: Vote recorded successfully
[2024-01-15T10:30:45.125Z] ERROR [DB]: Database connection failed
```

### File Output (No Colors)

```
[2024-01-15T10:30:45.123Z] INFO [CMD]: Command processed
[2024-01-15T10:30:45.124Z] VOTE [VOTE]: Vote recorded successfully
[2024-01-15T10:30:45.125Z] ERROR [DB]: Database connection failed
```

## File Logging

When `LOG_TO_FILE=true`, logs are written to the specified file path. The system includes:

- **Automatic Directory Creation**: Creates log directories if they don't exist
- **File Rotation**: Automatically rotates log files when they exceed `MAX_LOG_FILE_SIZE`
- **Timestamped Backups**: Rotated files are renamed with timestamps

### File Rotation Example

```
logs/
├── trustfactor-bot.log          # Current log file
├── trustfactor-bot.log.2024-01-15T10-30-45-123Z  # Rotated file
└── trustfactor-bot.log.2024-01-15T09-15-30-456Z  # Previous rotated file
```

## Performance Considerations

- **Conditional Logging**: Logs are only processed if the current log level allows it
- **Async File Writing**: File operations don't block the main thread
- **Memory Efficient**: Large objects are only stringified when DEBUG level is enabled

## Best Practices

### 1. Use Appropriate Log Levels

```javascript
// Good
logger.error('Database connection failed', 'DB');
logger.info('User joined server', 'USER');
logger.debug('API response received', 'API');

// Avoid
logger.error('User clicked button', 'USER');  // Not an error
logger.verbose('Critical system failure', 'SYSTEM');  // Should be ERROR
```

### 2. Provide Context

```javascript
// Good
logger.vote('Vote recorded', 'VOTE');
logger.command('Command executed', 'CMD');

// Better
logger.vote('Vote recorded for user 123456', 'VOTE');
logger.command('Award command executed by user 123456', 'CMD');
```

### 3. Use Specialized Methods

```javascript
// Good
logger.vote('Vote processed', 'VOTE');
logger.db('Query executed', 'DB');

// Avoid
logger.info('Vote processed', 'VOTE');  // Use logger.vote instead
```

### 4. Handle Errors Properly

```javascript
try {
    await someOperation();
} catch (error) {
    logger.errorWithStack('Operation failed', error, 'CONTEXT');
    // Handle the error appropriately
}
```

## Migration from console.log

To migrate existing `console.log` statements:

```javascript
// Before
console.log('User voted successfully');
console.error('Database error:', error);

// After
logger.vote('User voted successfully', 'VOTE');
logger.errorWithStack('Database error', error, 'DB');
```

## Monitoring and Debugging

### Development Mode

For development, use `LOG_LEVEL=VERBOSE` to see all log messages:

```env
LOG_LEVEL=VERBOSE
LOG_TO_FILE=true
```

### Production Mode

For production, use a more restrictive log level:

```env
LOG_LEVEL=INFO
LOG_TO_FILE=true
LOG_FILE_PATH=logs/production.log
```

### Troubleshooting

1. **No Logs Appearing**: Check if `LOG_LEVEL` is set correctly
2. **File Not Created**: Ensure the log directory path is writable
3. **Performance Issues**: Consider reducing log level or disabling file logging
4. **Large Log Files**: Adjust `MAX_LOG_FILE_SIZE` or implement log rotation

## Integration with Monitoring

The logging system can be easily integrated with external monitoring services by:

1. **Parsing Log Files**: Use log parsing tools to extract metrics
2. **Log Aggregation**: Send logs to centralized logging services
3. **Alerting**: Set up alerts based on ERROR level logs
4. **Analytics**: Analyze user behavior patterns from USER level logs

## Example Configuration

### Development Environment

```env
LOG_LEVEL=VERBOSE
LOG_TO_FILE=true
LOG_FILE_PATH=logs/dev.log
MAX_LOG_FILE_SIZE=5242880  # 5MB
```

### Production Environment

```env
LOG_LEVEL=INFO
LOG_TO_FILE=true
LOG_FILE_PATH=logs/production.log
MAX_LOG_FILE_SIZE=20971520  # 20MB
```

### Testing Environment

```env
LOG_LEVEL=ERROR
LOG_TO_FILE=false
```

This logging system provides comprehensive visibility into bot operations while maintaining flexibility for different deployment scenarios. 