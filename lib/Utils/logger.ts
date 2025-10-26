import pino from 'pino'

export interface ILogger {
	level: string
	child(obj: Record<string, unknown>): ILogger
	trace(msg: string, obj?: unknown): void
	debug(msg: string, obj?: unknown): void
	info(msg: string, obj?: unknown): void
	warn(msg: string, obj?: unknown): void
	error(msg: string, obj?: unknown): void
}

// Membuat instance pino logger
const pinoLogger = pino({
	timestamp: () => `,"time":"${new Date().toJSON()}"`,
	level: process.env.LOG_LEVEL || 'info',
	serializers: {
		err: pino.stdSerializers.err
	},
	formatters: {
		level: (label: string) => {
			return { level: label.toUpperCase() }
		}
	}
})

// Cast pino logger ke ILogger interface
const logger: ILogger = {
	get level(): string {
		return pinoLogger.level
	},

	child(obj: Record<string, unknown>): ILogger {
		return pinoLogger.child(obj) as unknown as ILogger
	},

	trace(msg: string, obj?: unknown): void {
		if (obj) {
			pinoLogger.trace(obj, msg)
		} else {
			pinoLogger.trace(msg)
		}
	},

	debug(msg: string, obj?: unknown): void {
		if (obj) {
			pinoLogger.debug(obj, msg)
		} else {
			pinoLogger.debug(msg)
		}
	},

	info(msg: string, obj?: unknown): void {
		if (obj) {
			pinoLogger.info(obj, msg)
		} else {
			pinoLogger.info(msg)
		}
	},

	warn(msg: string, obj?: unknown): void {
		if (obj) {
			pinoLogger.warn(obj, msg)
		} else {
			pinoLogger.warn(msg)
		}
	},

	error(msg: string, obj?: unknown): void {
		if (obj) {
			pinoLogger.error(obj, msg)
		} else {
			pinoLogger.error(msg)
		}
	}
}

export default logger