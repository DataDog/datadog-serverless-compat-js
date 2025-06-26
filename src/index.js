const childProcess = require('child_process')
const fs = require('fs')
const logger = require('./utils/logger');
const os = require('os');
const path = require('path');

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
        ? path.resolve(__dirname, '../bin/windows-amd64')
        : path.resolve(__dirname, '../bin/linux-amd64')
    const binaryExtension = process.platform === 'win32' ? '.exe' : ''
    const binaryPath = path.join(binaryPathOsFolder, `datadog-serverless-compat${binaryExtension}`)

    return binaryPath
}

function getPackageVersion() {
    let packageVersion

    try {
        const { version } = require('../package.json')
        packageVersion = version
    } catch (err) {
        logger.error(`Unable to identify package version: ${err}`)
        packageVersion = "unknown"
    }

    return packageVersion
}

function start() {
    const environment = getEnvironment()
    logger.debug(`Environment detected: ${environment}`)

    if (environment === cloudEnvironment.UNKNOWN) {
        logger.error(`${environment} environment detected, will not start the Datadog Serverless Compatibility Layer`)
        return
    }

    logger.debug(`Platform detected: ${process.platform}`)

    if (process.platform !== 'win32' && process.platform !== 'linux') {
        logger.error(`Platform ${process.platform} detected, the Datadog Serverless Compatibility Layer is only supported on Windows and Linux`)
        return
    }

    const binaryPath = getBinaryPath()

    if (!fs.existsSync(binaryPath)) {
        logger.error(`Serverless Compatibility Layer did not start, could not find binary at path ${binaryPath}`)
        return
    }

    const packageVersion = getPackageVersion()
    logger.debug(`Found package version ${packageVersion}`)

    try {
        const tempDir = path.join(os.tmpdir(), "datadog")
        fs.mkdirSync(tempDir, { recursive: true });
        const executableFilePath = path.join(tempDir, path.basename(binaryPath));
        fs.copyFileSync(binaryPath, executableFilePath);
        fs.chmodSync(executableFilePath, 0o744);
        logger.debug(`Spawning process from binary at path ${executableFilePath}`)

        const env = { ...process.env, DD_SERVERLESS_COMPAT_VERSION: packageVersion }
        childProcess.spawn(executableFilePath, { stdio: 'inherit', env: env })
    } catch (err) {
        logger.error(err, `An unexpected error occurred while spawning Serverless Compatibility Layer process`)
    }
}

module.exports = {
    start
}
