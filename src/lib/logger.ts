/**
 * Simple logger utility for consistent error/info logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFn = (message: string, error?: unknown) => void;

const isDevelopment = process.env.NODE_ENV === 'development';

class Logger {
	private logLevel: LogLevel;

	constructor(level: LogLevel = isDevelopment ? 'debug' : 'info') {
		this.logLevel = level;
	}

	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
		return levels.indexOf(level) >= levels.indexOf(this.logLevel);
	}

	private formatMessage(level: LogLevel, message: string): string {
		const timestamp = new Date().toISOString();
		return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
	}

	debug: LogFn = (message: string, error?: unknown) => {
		if (this.shouldLog('debug')) {
			console.debug(this.formatMessage('debug', message), error);
		}
	};

	info: LogFn = (message: string, error?: unknown) => {
		if (this.shouldLog('info')) {
			console.info(this.formatMessage('info', message), error);
		}
	};

	warn: LogFn = (message: string, error?: unknown) => {
		if (this.shouldLog('warn')) {
			console.warn(this.formatMessage('warn', message), error);
		}
	};

	error: LogFn = (message: string, error?: unknown) => {
		if (this.shouldLog('error')) {
			console.error(this.formatMessage('error', message), error);
		}
	};
}

export const logger = new Logger();
