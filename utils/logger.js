const pino = require('pino');

function getLogLevel() {
    const defaultLogLevel = 'info'

    if (process.env.DD_LOG_LEVEL === undefined) {
        return defaultLogLevel
    }

    const logLevel = process.env.DD_LOG_LEVEL.toLowerCase()

    if (logLevel === 'off') {
        return 'silent'
    }

    if (logLevel in pino.levels.values) {
        return logLevel
    }

    return defaultLogLevel
}

module.exports = pino({
    level: getLogLevel(),
    transport: {
        target: 'pino-pretty'
    },
});
