import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join, basename, dirname } from 'path';
import { logger, Logger } from './utils/log';
import { LIB_VERSION as packageVersion } from './version';

const defaultLogger = logger(__filename);

enum CloudEnvironment {
  AWS = 'AWS',
  AZURE_FUNCTION = 'Azure Function',
  GOOGLE_CLOUD_RUN_FUNCTION_1ST_GEN = 'Google Cloud Run Function 1st gen',
  GOOGLE_CLOUD_RUN_FUNCTION_2ND_GEN = 'Google Cloud Run Function 2nd gen',
  UNKNOWN = 'Unknown',
}

function getEnvironment(): CloudEnvironment {
  if (process.env.AWS_LAMBDA_INITIALIZATION_TYPE != undefined) {
    return CloudEnvironment.AWS
  }

  if (
    process.env.FUNCTIONS_EXTENSION_VERSION !== undefined &&
    process.env.FUNCTIONS_WORKER_RUNTIME !== undefined
  ) {
    return CloudEnvironment.AZURE_FUNCTION;
  }

  if (
    process.env.FUNCTION_NAME !== undefined &&
    process.env.GCP_PROJECT !== undefined
  ) {
    return CloudEnvironment.GOOGLE_CLOUD_RUN_FUNCTION_1ST_GEN;
  }

  if (
    process.env.K_SERVICE !== undefined &&
    process.env.FUNCTION_TARGET !== undefined
  ) {
    return CloudEnvironment.GOOGLE_CLOUD_RUN_FUNCTION_2ND_GEN;
  }

  return CloudEnvironment.UNKNOWN;
}

let resolvedBinaryPath: string | undefined;

function getBinaryPath(logger: Logger = defaultLogger): string | undefined {
  if (resolvedBinaryPath !== undefined) {
    return resolvedBinaryPath;
  }

  if (process.env.DD_SERVERLESS_COMPAT_PATH !== undefined) {
    logger.debug(`Using DD_SERVERLESS_COMPAT_PATH: ${process.env.DD_SERVERLESS_COMPAT_PATH}`);
    resolvedBinaryPath = process.env.DD_SERVERLESS_COMPAT_PATH;
    return resolvedBinaryPath;
  }

  // npm/Node.js cpu convention: 'x64', 'arm64', or 'ia32'
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'ia32' : 'x64';
  logger.debug(`getBinaryPath - process.arch: ${process.arch}, selected arch: ${arch}`);

  const osName = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const binaryExtension = process.platform === 'win32' ? '.exe' : '';
  const binaryFilename = `datadog-serverless-compat${binaryExtension}`;

  // Resolve binary from the installed optional platform-specific package
  const pkgName = `@datadog/serverless-compat-${osName}-${arch}`;
  try {
    const pkgJsonPath = require.resolve(`${pkgName}/package.json`);
    resolvedBinaryPath = join(dirname(pkgJsonPath), 'bin', binaryFilename);
    logger.debug(`getBinaryPath - resolved from ${pkgName}: ${resolvedBinaryPath}`);
    return resolvedBinaryPath;
  } catch {
    logger.debug(`getBinaryPath - ${pkgName} not installed`);
  }

  return undefined;
}

function isAzureFlexWithoutDDAzureResourceGroup(): boolean {
  return (
    process.env.WEBSITE_SKU === "FlexConsumption" &&
    (!process.env.DD_AZURE_RESOURCE_GROUP || !process.env.DD_AZURE_RESOURCE_GROUP.trim())
  );
}

function start(logger: Logger = defaultLogger): void {
  const environment = getEnvironment();
  logger.debug(`Environment detected: ${environment}`);

  if (environment === CloudEnvironment.UNKNOWN) {
    logger.error(
      `${environment} environment detected, will not start the Datadog Serverless Compatibility Layer`
    );
    return;
  }

  logger.debug(`Platform detected: ${process.platform}`);
  logger.debug(`Architecture detected: ${process.arch}`);

  const supportedPlatformArchPairs = new Set([
    'linux-x64',
    'linux-arm64',
    'win32-x64',
    'win32-ia32',
    'darwin-arm64',
  ]);

  if (!supportedPlatformArchPairs.has(`${process.platform}-${process.arch}`)) {
    logger.error(
      `Platform/architecture ${process.platform}/${process.arch} is not supported by the Datadog Serverless Compatibility Layer`
    );
    return;
  }

  if (environment === CloudEnvironment.AZURE_FUNCTION && isAzureFlexWithoutDDAzureResourceGroup()) {
    logger.error(
      "Azure function detected on flex consumption plan without DD_AZURE_RESOURCE_GROUP set. Please set the DD_AZURE_RESOURCE_GROUP environment variable to your resource group name in Azure app settings. Shutting down Datadog Serverless Compatibility Layer."
    );
    return;
  }

  try {
    const binaryPath = getBinaryPath(logger);
    if (binaryPath === undefined || !existsSync(binaryPath)) {
      logger.error(
        `Serverless Compatibility Layer did not start, ${binaryPath === undefined
          ? 'could not find platform binary package'
          : `could not find binary at path ${binaryPath}`}`
      );
      return;
    }
    logger.debug(`Selected binary path: ${binaryPath}`);

    logger.debug(`Found package version ${packageVersion}`);

    const tempDir = join(tmpdir(), 'datadog');
    mkdirSync(tempDir, { recursive: true });
    const executableFilePath = join(tempDir, basename(binaryPath));
    // TODO: check if binaryPath already has execute permissions and spawn it
    // directly if so, skipping the copy+chmod to reduce cold-start overhead.
    // Fall back to the copy+chmod path for read-only node_modules mounts or
    // when the execute bit is not set.
    copyFileSync(binaryPath, executableFilePath);
    chmodSync(executableFilePath, 0o744);
    logger.debug(`Spawning process from binary at path ${executableFilePath}`);


    if (
      process.platform === 'win32' &&
      !process.env.DD_APM_WINDOWS_PIPE_NAME &&
      !process.env.DD_TRACE_AGENT_URL
    ) {
      const pipeName = `dd-trace-${randomUUID()}`;
      process.env.DD_APM_WINDOWS_PIPE_NAME = pipeName;
      process.env.DD_TRACE_AGENT_URL = `unix://./pipe/${pipeName}`;
    }
    const env = {
      ...process.env,
      DD_SERVERLESS_COMPAT_VERSION: packageVersion,
    };
    // TODO: add error and exit event handlers on the child process to log
    // spawn failures and non-zero exit codes / termination signals gracefully.
    spawn(executableFilePath, { stdio: 'inherit', env });
  } catch (err) {
    logger.error(
      `An unexpected error occurred while starting the Serverless Compatibility Layer: ${err}`
    );
  }
}

export { start };
