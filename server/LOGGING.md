# Logging Configuration

The server includes comprehensive request logging with execution time tracking.

## Features

- **Request/Response Logging**: Logs all API requests with method, path, query params, and body
- **Execution Time**: Tracks and logs how long each request takes to process
- **File-based Logging**: Logs are written to daily log files in JSON format
- **Slow Request Detection**: Automatically flags requests taking longer than 1 second
- **Sensitive Data Protection**: Passwords and tokens are automatically redacted
- **Easily Disabled**: Can be turned on/off via environment variable

## Configuration

Add these variables to your `.env` file:

```env
# Quick debug mode: enables file + console + debug level (recommended for debugging)
DEBUG=true

# Or configure individually:
# Enable/disable logging (default: false)
ENABLE_LOGGING=true

# Also log to console (default: false)
LOG_TO_CONSOLE=true

# Log level: 'info' or 'debug' (DEBUG=true automatically sets this to 'debug')
LOG_LEVEL=info
```

**Important:** You must restart the server after changing environment variables for them to take effect.

## Log File Location

Logs are stored in: `server/logs/server-YYYY-MM-DD.log`

Each day gets a new log file. The `logs/` directory is automatically created when logging is enabled.

## Log Format

Each log entry is a JSON object with:
- `timestamp`: ISO 8601 timestamp
- `level`: Log level (INFO, ERROR, WARN, DEBUG)
- `message`: Log message
- `data`: Additional context (request details, errors, etc.)

### Example Log Entry

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "INFO",
  "message": "Request completed",
  "data": {
    "requestId": "abc123",
    "method": "GET",
    "path": "/api/players",
    "statusCode": 200,
    "duration": "45ms",
    "responseSize": "2.34KB"
  }
}
```

## Disabling Logging

To disable logging, simply set:
```env
ENABLE_LOGGING=false
```

Or remove the variable entirely (defaults to false).

## Viewing Logs

### View latest log file:
```bash
tail -f server/logs/server-$(date +%Y-%m-%d).log
```

### Search for slow requests:
```bash
grep "Slow request" server/logs/server-*.log
```

### View requests by endpoint:
```bash
grep "/api/players" server/logs/server-*.log
```

### Parse JSON logs with jq:
```bash
cat server/logs/server-*.log | jq '.data.duration' | sort -n
```

### View only DEBUG level logs:
```bash
# Using grep
grep '"level":"DEBUG"' server/logs/server-*.log

# Using jq (better formatted)
cat server/logs/server-$(date +%Y-%m-%d).log | jq 'select(.level == "DEBUG")'
```

## Performance Impact

Logging has minimal performance impact:
- File writes are synchronous but fast (JSON strings)
- Logging is disabled by default
- Can be enabled only when needed for debugging

