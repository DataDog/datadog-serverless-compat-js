import { spawn } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join, basename } from 'path';
import defaultLogger, { Logger } from './utils/log';
import { LIB_VERSION as packageVersion } from './version';

enum CloudEnvironment {
  AZURE_FUNCTION = 'Azure Function',
  GOOGLE_CLOUD_RUN_FUNCTION_1ST_GEN = 'Google Cloud Run Function 1st gen',
  GOOGLE_CLOUD_RUN_FUNCTION_2ND_GEN = 'Google Cloud Run Function 2nd gen',
  UNKNOWN = 'Unknown',
}

function getEnvironment(): CloudEnvironment {
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

function getBinaryPath(): string {
  if (process.env.DD_SERVERLESS_COMPAT_PATH !== undefined) {
    return process.env.DD_SERVERLESS_COMPAT_PATH;
  }

  const binaryPathOsFolder =
    process.platform === 'win32'
      ? resolve(__dirname, '..', 'bin', 'windows-amd64')
      : resolve(__dirname, '..', 'bin', 'linux-amd64');
  const binaryExtension = process.platform === 'win32' ? '.exe' : '';
  return join(
    binaryPathOsFolder,
    `datadog-serverless-compat${binaryExtension}`
  );
}

function isAzureFlexWithoutDDAzureResourceGroup(): boolean {
  return (process.env.WEBSITE_SKU === "FlexConsumption" && process.env.DD_AZURE_RESOURCE_GROUP === undefined);
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

  if (process.platform !== 'win32' && process.platform !== 'linux') {
    logger.error(
      `Platform ${process.platform} detected, the Datadog Serverless Compatibility Layer is only supported on Windows and Linux`
    );
    return;
  }

  if (isAzureFlexWithoutDDAzureResourceGroup()) {
    logger.error(
      "Azure function detected on flex consumption plan without DD_AZURE_RESOURCE_GROUP set. Please set the DD_AZURE_RESOURCE_GROUP environment variable to your resource group name in Azure app settings. Shutting down Datadog Serverless Compatibility Layer."
    );
    return;
  }

  const binaryPath = getBinaryPath();

  if (!existsSync(binaryPath)) {
    logger.error(
      `Serverless Compatibility Layer did not start, could not find binary at path ${binaryPath}`
    );
    return;
  }

  logger.debug(`Found package version ${packageVersion}`);

  try {
    const tempDir = join(tmpdir(), 'datadog');
    mkdirSync(tempDir, { recursive: true });

    const executableFilePath = join(tempDir, basename(binaryPath));
    copyFileSync(binaryPath, executableFilePath);
    chmodSync(executableFilePath, 0o744);

    logger.debug(`Spawning process from binary at path ${executableFilePath}`);

    const env = {
      ...process.env,
      DD_SERVERLESS_COMPAT_VERSION: packageVersion,
    };
    spawn(executableFilePath, { stdio: 'inherit', env });
  } catch (err) {
    logger.error(
      `An unexpected error occurred while spawning Serverless Compatibility Layer process: ${err}`
    );
  }
}

export { start };
