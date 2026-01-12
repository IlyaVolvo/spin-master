import fs from 'fs';
import path from 'path';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

class Logger {
  private logFile: string = '';
  private enabled: boolean = false;
  private logDir: string = '';
  private logToConsole: boolean = false;
  private logLevel: string = 'info';
  private debugEnabled: boolean = false;

  constructor() {
    // Support DEBUG=true to enable everything for debugging
    const debugMode = process.env.DEBUG === 'true';
    
    // Enable logging if DEBUG=true OR ENABLE_LOGGING=true
    this.enabled = debugMode || process.env.ENABLE_LOGGING === 'true';
    
    // Enable console logging if DEBUG=true OR LOG_TO_CONSOLE=true
    this.logToConsole = debugMode || process.env.LOG_TO_CONSOLE === 'true';
    
    // Set log level (debug mode enables debug level)
    this.logLevel = debugMode ? 'debug' : (process.env.LOG_LEVEL || 'info');
    this.debugEnabled = this.logLevel === 'debug';
    
    // Use __dirname to ensure logs are always in server/logs regardless of where the command is run from
    const serverDir = path.resolve(__dirname, '..', '..');
    this.logDir = path.join(serverDir, 'logs');
    this.logFile = path.join(this.logDir, `server-${new Date().toISOString().split('T')[0]}.log`);

    // Create logs directory if it doesn't exist (and logging is enabled)
    if (this.enabled && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private writeLog(level: string, message: string, data?: any): void {
    if (!this.enabled) return;

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      message,
      ...(data && { data }),
    };

    const logLine = JSON.stringify(entry) + '\n';

    try {
      fs.appendFileSync(this.logFile, logLine);
    } catch (error) {
      // Use raw console.error here to avoid recursion
      console.error('Failed to write to log file:', error);
    }
  }

  private formatConsoleMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? (typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)) : '';
    return `[${timestamp}] [${level}] ${message}${dataStr ? '\n' + dataStr : ''}`;
  }

  info(message: string, data?: any): void {
    this.writeLog('INFO', message, data);
    if (this.logToConsole) {
      console.log(this.formatConsoleMessage('INFO', message, data));
    }
  }

  error(message: string, data?: any): void {
    this.writeLog('ERROR', message, data);
    // Always log errors to console (even if LOG_TO_CONSOLE is false)
    console.error(this.formatConsoleMessage('ERROR', message, data));
  }

  warn(message: string, data?: any): void {
    this.writeLog('WARN', message, data);
    if (this.logToConsole) {
      console.warn(this.formatConsoleMessage('WARN', message, data));
    }
  }

  debug(message: string, data?: any): void {
    if (this.debugEnabled) {
      this.writeLog('DEBUG', message, data);
      if (this.logToConsole) {
        console.log(this.formatConsoleMessage('DEBUG', message, data));
      }
    }
  }
}

export const logger = new Logger();

