const child_process = require('child_process')
const fs = require('fs')
const logger = require('./utils/logger');

const cloudEnvironment = {
    AZURE_FUNCTION: 'Azure Function',
    GOOGLE_CLOUD_RUN_FUNCTION_1ST_GEN: 'Google Cloud Run Function 1st gen',
    GOOGLE_CLOUD_RUN_FUNCTION_2ND_GEN: 'Google Cloud Run Function 2nd gen',
    UNKNOWN: 'Unknown'
}

function getEnvironment() {
    if (process.env.FUNCTIONS_EXTENSION_VERSION !== undefined && process.env.FUNCTIONS_WORKER_RUNTIME !== undefined
    ) {
        return cloudEnvironment.AZURE_FUNCTION;
    }

    if (process.env.FUNCTION_NAME !== undefined && process.env.GCP_PROJECT !== undefined) {
        return cloudEnvironment.GOOGLE_CLOUD_RUN_FUNCTION_1ST_GEN;
    }

    if (process.env.K_SERVICE !== undefined && process.env.FUNCTION_TARGET !== undefined) {
        return cloudEnvironment.GOOGLE_CLOUD_RUN_FUNCTION_2ND_GEN;
    }

    return cloudEnvironment.UNKNOWN;
}

function getBinaryPath() {
    // Use user defined path if provided
    if (process.env.DD_SERVERLESS_COMPAT_PATH !== undefined) {
        return process.env.DD_SERVERLESS_COMPAT_PATH
    }

    const binaryPathOsFolder = process.platform === 'win32'
        ? 'datadog-serverless-compat/windows-amd64'
        : 'datadog-serverless-compat/linux-amd64'
    const binaryExtension = process.platform === 'win32' ? '.exe' : ''
    const binaryPath = `${__dirname}/${binaryPathOsFolder}/datadog-serverless-compat${binaryExtension}`

    return binaryPath
}

function setDefaultEnvVars() {
    if (process.env.DD_TRACE_STATS_COMPUTATION_ENABLED === undefined) {
        process.env.DD_TRACE_STATS_COMPUTATION_ENABLED = true
    }
}

function start() {
    const environment = getEnvironment()
    logger.debug(`Environment detected: ${environment}`)

    if (environment == cloudEnvironment.UNKNOWN) {
        logger.error(`${environment} environment detected, will not start the Datadog Serverless Compatibility Layer`)
        return
    }

    logger.debug(`Platform detected: ${process.platform}`)

    if (process.platform !== 'win32' && process.platform !== 'linux') {
        logger.error(`Platform ${process.platform} detected, the Datadog Serverless Compatibility Layer is only supported on Windows and Linux`)
        return
    }

    const binaryPath = getBinaryPath()
    logger.debug(`Spawning process from binary at path ${binaryPath}`)

    if (!fs.existsSync(binaryPath)) {
        logger.error(`Serverless Compatibility Layer did not start, could not find binary at path ${binaryPath}`)
        return
    }

    setDefaultEnvVars()

    try {
        child_process.spawn(binaryPath, { stdio: 'inherit' })
    } catch (err) {
        logger.error(err, `An unexpected error occurred while spawning Serverless Compatibility Layer process`)
    }
}

module.exports = {
    start
}
