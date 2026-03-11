/**
 * Debug Logger Utility
 * Provides structured logging with module-specific enable/disable controls
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Module-specific debug flags - set to false in production
const DEBUG_FLAGS: Record<string, boolean> = {
  Symbols: false,
  SlotController: false,
  Dialogs: false,
  GameAPI: false,
  AudioManager: false,
  WinTracker: false,
  GameStateManager: false,
  ScatterAnimation: false,
  Tumble: false,
  FreeSpinAutoplay: false,
};

// Global minimum log level (errors always show)
const GLOBAL_MIN_LEVEL: LogLevel = 'warn';

class ModuleLogger {
  private module: string;
  private prefix: string;

  constructor(module: string) {
    this.module = module;
    this.prefix = `[${module}]`;
  }

  private shouldLog(level: LogLevel): boolean {
    // Errors always log
    if (level === 'error') return true;
    
    // Check if module debugging is enabled
    const moduleEnabled = DEBUG_FLAGS[this.module] ?? false;
    if (!moduleEnabled && LOG_LEVELS[level] < LOG_LEVELS[GLOBAL_MIN_LEVEL]) {
      return false;
    }
    
    return true;
  }

  debug(...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.prefix, ...args);
    }
  }

  info(...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(this.prefix, ...args);
    }
  }

  warn(...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.prefix, ...args);
    }
  }

  error(...args: any[]): void {
    console.error(this.prefix, ...args);
  }

  /**
   * Log with explicit level control
   */
  log(level: LogLevel, ...args: any[]): void {
    if (this.shouldLog(level)) {
      const method = level === 'error' ? console.error : 
                     level === 'warn' ? console.warn : console.log;
      method(this.prefix, ...args);
    }
  }

  /**
   * Conditional debug - only logs if condition is true
   */
  debugIf(condition: boolean, ...args: any[]): void {
    if (condition) {
      this.debug(...args);
    }
  }

  /**
   * Group related logs together
   */
  group(label: string, fn: () => void): void {
    if (this.shouldLog('debug')) {
      console.group(`${this.prefix} ${label}`);
      fn();
      console.groupEnd();
    }
  }
}

// Pre-created loggers for each module
export const Logger = {
  symbols: new ModuleLogger('Symbols'),
  slot: new ModuleLogger('SlotController'),
  dialogs: new ModuleLogger('Dialogs'),
  gameAPI: new ModuleLogger('GameAPI'),
  audio: new ModuleLogger('AudioManager'),
  winTracker: new ModuleLogger('WinTracker'),
  gameState: new ModuleLogger('GameStateManager'),
  scatter: new ModuleLogger('ScatterAnimation'),
  tumble: new ModuleLogger('Tumble'),
  freeSpin: new ModuleLogger('FreeSpinAutoplay'),

  /**
   * Create a custom logger for a specific module
   */
  create(module: string): ModuleLogger {
    return new ModuleLogger(module);
  },

  /**
   * Enable debugging for specific modules at runtime
   */
  enableModule(module: string): void {
    DEBUG_FLAGS[module] = true;
  },

  /**
   * Disable debugging for specific modules at runtime
   */
  disableModule(module: string): void {
    DEBUG_FLAGS[module] = false;
  },

  /**
   * Enable all module debugging
   */
  enableAll(): void {
    Object.keys(DEBUG_FLAGS).forEach(key => {
      DEBUG_FLAGS[key] = true;
    });
  },

  /**
   * Disable all module debugging
   */
  disableAll(): void {
    Object.keys(DEBUG_FLAGS).forEach(key => {
      DEBUG_FLAGS[key] = false;
    });
  },
};

// Expose to window for runtime debugging in browser console
if (typeof window !== 'undefined') {
  (window as any).Logger = Logger;
}

export default Logger;
