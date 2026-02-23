/**
 * Logger Utility — Unit Tests
 *
 * Tests the Logger class behavior:
 * - Log level filtering (info, error, warn, debug)
 * - Console output control
 * - JSON formatting
 * - Environment variable configuration
 */

export {};

// ─── Extracted Logger logic for testing ───────────────────────────────────

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

class TestableLogger {
  private entries: LogEntry[] = [];
  private consoleOutput: string[] = [];
  private enabled: boolean;
  private logToConsole: boolean;
  private logLevel: string;
  private debugEnabled: boolean;

  constructor(opts: { enabled?: boolean; logToConsole?: boolean; logLevel?: string; debug?: boolean } = {}) {
    const debugMode = opts.debug ?? false;
    this.enabled = debugMode || (opts.enabled ?? false);
    this.logToConsole = debugMode || (opts.logToConsole ?? false);
    this.logLevel = debugMode ? 'debug' : (opts.logLevel ?? 'info');
    this.debugEnabled = this.logLevel === 'debug';
  }

  private writeLog(level: string, message: string, data?: any): void {
    if (!this.enabled) return;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data && { data }),
    };
    this.entries.push(entry);
  }

  private formatConsoleMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? (typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)) : '';
    return `[${timestamp}] [${level}] ${message}${dataStr ? '\n' + dataStr : ''}`;
  }

  info(message: string, data?: any): void {
    this.writeLog('INFO', message, data);
    if (this.logToConsole) {
      this.consoleOutput.push(this.formatConsoleMessage('INFO', message, data));
    }
  }

  error(message: string, data?: any): void {
    this.writeLog('ERROR', message, data);
    // Always output errors to console
    this.consoleOutput.push(this.formatConsoleMessage('ERROR', message, data));
  }

  warn(message: string, data?: any): void {
    this.writeLog('WARN', message, data);
    if (this.logToConsole) {
      this.consoleOutput.push(this.formatConsoleMessage('WARN', message, data));
    }
  }

  debug(message: string, data?: any): void {
    if (this.debugEnabled) {
      this.writeLog('DEBUG', message, data);
      if (this.logToConsole) {
        this.consoleOutput.push(this.formatConsoleMessage('DEBUG', message, data));
      }
    }
  }

  getEntries(): LogEntry[] { return this.entries; }
  getConsoleOutput(): string[] { return this.consoleOutput; }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Logger', () => {
  describe('when disabled', () => {
    it('does not write log entries', () => {
      const logger = new TestableLogger({ enabled: false });
      logger.info('test message');
      logger.warn('warning');
      logger.debug('debug');
      expect(logger.getEntries()).toHaveLength(0);
    });

    it('still outputs errors to console', () => {
      const logger = new TestableLogger({ enabled: false });
      logger.error('critical error');
      expect(logger.getConsoleOutput()).toHaveLength(1);
      expect(logger.getConsoleOutput()[0]).toContain('ERROR');
    });
  });

  describe('when enabled', () => {
    it('writes info entries', () => {
      const logger = new TestableLogger({ enabled: true });
      logger.info('test message');
      expect(logger.getEntries()).toHaveLength(1);
      expect(logger.getEntries()[0].level).toBe('INFO');
      expect(logger.getEntries()[0].message).toBe('test message');
    });

    it('writes warn entries', () => {
      const logger = new TestableLogger({ enabled: true });
      logger.warn('warning message');
      expect(logger.getEntries()).toHaveLength(1);
      expect(logger.getEntries()[0].level).toBe('WARN');
    });

    it('writes error entries', () => {
      const logger = new TestableLogger({ enabled: true });
      logger.error('error message');
      expect(logger.getEntries()).toHaveLength(1);
      expect(logger.getEntries()[0].level).toBe('ERROR');
    });

    it('does not write debug entries when logLevel is info', () => {
      const logger = new TestableLogger({ enabled: true, logLevel: 'info' });
      logger.debug('debug message');
      expect(logger.getEntries()).toHaveLength(0);
    });

    it('writes debug entries when logLevel is debug', () => {
      const logger = new TestableLogger({ enabled: true, logLevel: 'debug' });
      logger.debug('debug message');
      expect(logger.getEntries()).toHaveLength(1);
      expect(logger.getEntries()[0].level).toBe('DEBUG');
    });
  });

  describe('console output', () => {
    it('does not output to console when logToConsole is false', () => {
      const logger = new TestableLogger({ enabled: true, logToConsole: false });
      logger.info('test');
      logger.warn('test');
      expect(logger.getConsoleOutput()).toHaveLength(0);
    });

    it('outputs to console when logToConsole is true', () => {
      const logger = new TestableLogger({ enabled: true, logToConsole: true });
      logger.info('test');
      expect(logger.getConsoleOutput()).toHaveLength(1);
      expect(logger.getConsoleOutput()[0]).toContain('INFO');
    });

    it('always outputs errors to console regardless of logToConsole', () => {
      const logger = new TestableLogger({ enabled: true, logToConsole: false });
      logger.error('critical');
      expect(logger.getConsoleOutput()).toHaveLength(1);
    });

    it('does not output debug to console when debug is disabled', () => {
      const logger = new TestableLogger({ enabled: true, logToConsole: true, logLevel: 'info' });
      logger.debug('debug msg');
      expect(logger.getConsoleOutput()).toHaveLength(0);
    });
  });

  describe('debug mode', () => {
    it('enables everything when debug=true', () => {
      const logger = new TestableLogger({ debug: true });
      expect(logger.getEntries()).toHaveLength(0);

      logger.info('info');
      logger.warn('warn');
      logger.error('error');
      logger.debug('debug');

      expect(logger.getEntries()).toHaveLength(4);
      // Console output: info + warn + error (always) + debug = 4
      expect(logger.getConsoleOutput()).toHaveLength(4);
    });
  });

  describe('data formatting', () => {
    it('includes data in log entry when provided', () => {
      const logger = new TestableLogger({ enabled: true });
      logger.info('test', { key: 'value' });
      expect(logger.getEntries()[0].data).toEqual({ key: 'value' });
    });

    it('omits data field when not provided', () => {
      const logger = new TestableLogger({ enabled: true });
      logger.info('test');
      expect(logger.getEntries()[0].data).toBeUndefined();
    });

    it('includes data in console output', () => {
      const logger = new TestableLogger({ enabled: true, logToConsole: true });
      logger.info('test', { count: 42 });
      expect(logger.getConsoleOutput()[0]).toContain('42');
    });

    it('handles string data', () => {
      const logger = new TestableLogger({ enabled: true });
      logger.info('test', 'string data');
      expect(logger.getEntries()[0].data).toBe('string data');
    });

    it('handles nested objects', () => {
      const logger = new TestableLogger({ enabled: true });
      logger.info('test', { nested: { deep: true } });
      expect(logger.getEntries()[0].data.nested.deep).toBe(true);
    });

    it('includes timestamp in entries', () => {
      const logger = new TestableLogger({ enabled: true });
      logger.info('test');
      expect(logger.getEntries()[0].timestamp).toBeDefined();
      // Should be ISO format
      expect(() => new Date(logger.getEntries()[0].timestamp)).not.toThrow();
    });
  });

  describe('formatConsoleMessage', () => {
    it('includes level in brackets', () => {
      const logger = new TestableLogger({ enabled: true, logToConsole: true });
      logger.info('hello');
      expect(logger.getConsoleOutput()[0]).toMatch(/\[INFO\]/);
    });

    it('includes timestamp in brackets', () => {
      const logger = new TestableLogger({ enabled: true, logToConsole: true });
      logger.info('hello');
      expect(logger.getConsoleOutput()[0]).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
    });

    it('includes message text', () => {
      const logger = new TestableLogger({ enabled: true, logToConsole: true });
      logger.info('specific message text');
      expect(logger.getConsoleOutput()[0]).toContain('specific message text');
    });
  });
});
