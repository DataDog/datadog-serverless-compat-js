/* eslint-disable no-console */

var DD_LOG_LEVEL = process.env.DD_LOG_LEVEL

var logLevels = {
    trace: 20,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    critical: 50,
    off: 100
}

var logLevel = logLevels[(DD_LOG_LEVEL || '').toLowerCase()] || logLevels.info

var log = {
    debug: logLevel <= 20 ? (console.debug || console.log).bind(console) : function () { },
    info: logLevel <= 30 ? console.info.bind(console) : function () { },
    warn: logLevel <= 40 ? console.warn.bind(console) : function () { },
    error: logLevel <= 50 ? console.error.bind(console) : function () { }
}

module.exports = log
