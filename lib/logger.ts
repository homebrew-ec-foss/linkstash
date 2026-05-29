/**
 * Simple logger utility for consistent error/info logging
 */

import { LogLevel } from './constants';

type LogFn = (message: string, error?: unknown) => void;

const isDevelopment = process.env.NODE_ENV === 'development';

class Logger {
    private logLevel: LogLevel;

    constructor(level: LogLevel = isDevelopment ? LogLevel.DEBUG : LogLevel.INFO) {
        this.logLevel = level;
    }

    private shouldLog(level: LogLevel): boolean {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        return levels.indexOf(level) >= levels.indexOf(this.logLevel);
    }

    private formatMessage(level: LogLevel, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }

    debug: LogFn = (message: string, error?: unknown) => {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.debug(this.formatMessage(LogLevel.DEBUG, message), error);
        }
    };

    info: LogFn = (message: string, error?: unknown) => {
        if (this.shouldLog(LogLevel.INFO)) {
            console.info(this.formatMessage(LogLevel.INFO, message), error);
        }
    };

    warn: LogFn = (message: string, error?: unknown) => {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(this.formatMessage(LogLevel.WARN, message), error);
        }
    };

    error: LogFn = (message: string, error?: unknown) => {
        if (this.shouldLog(LogLevel.ERROR)) {
            console.error(this.formatMessage(LogLevel.ERROR, message), error);
        }
    };
}

export const logger = new Logger();
