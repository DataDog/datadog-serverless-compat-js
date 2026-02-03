import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join, basename } from 'path';
import { logger, Logger } from './utils/log';
import { LIB_VERSION as packageVersion } from './version';

const defaultLogger = logger(__filename);

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
  return (
    process.env.WEBSITE_SKU === "FlexConsumption" &&
    (!process.env.DD_AZURE_RESOURCE_GROUP || !process.env.DD_AZURE_RESOURCE_GROUP.trim())
  );
}

function configurePipeNames(logger: Logger): void {
  // Generate a unique GUID for this function instance to avoid conflicts
  // when running multiple Azure Functions in the same namespace
  const guid = randomUUID();

  // Windows pipe limit is 256 chars including \\.\pipe\ prefix (9 chars), leaving 247 for the name
  // Pipe name format: {base}_{guid}, where guid is always 36 chars, leaving 210 chars for base
  const MAX_BASE_LENGTH = 210;

  // DogStatsD uses DD_TRACE_AGENT_URL as metricsProxyUrl, so there's only one pipe for the whole layer
  // Priority: DD_TRACE_WINDOWS_PIPE_NAME > DD_DOGSTATSD_WINDOWS_PIPE_NAME > extract from DD_TRACE_AGENT_URL > default
  let baseName = process.env.DD_TRACE_WINDOWS_PIPE_NAME
    || process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME
    || (process.env.DD_TRACE_AGENT_URL ? process.env.DD_TRACE_AGENT_URL.replace(/^unix:\\\\\.\\pipe\\/, '') : null)
    || 'dd_compat_pipe';

  // Truncate base name if needed to ensure base_guid fits within limit
  if (baseName.length > MAX_BASE_LENGTH) {
    logger.warn(
      `Pipe base name is too long (${baseName.length} chars). Truncating to ${MAX_BASE_LENGTH} chars to fit within 256 character limit with GUID.`
    );
    baseName = baseName.substring(0, MAX_BASE_LENGTH);
  }

  const pipeName = `${baseName}_${guid}`;
  const agentUrl = `unix:\\\\.\\pipe\\${pipeName}`;

  // Alert if DD_TRACE_AGENT_URL is manually set and differs from generated value
  if (process.env.DD_TRACE_AGENT_URL && process.env.DD_TRACE_AGENT_URL !== agentUrl) {
    logger.warn(
      `DD_TRACE_AGENT_URL (${process.env.DD_TRACE_AGENT_URL}) differs from generated value (${agentUrl}). Using generated value with GUID suffix.`
    );
  }

  // Set DD_TRACE_AGENT_URL for both tracer and dogstatsd (DogStatsD uses it as metricsProxyUrl)
  process.env.DD_TRACE_AGENT_URL = agentUrl;
  // Set pipe names for rust binary
  process.env.DD_TRACE_WINDOWS_PIPE_NAME = pipeName;
  process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME = pipeName;

  logger.debug(`Configured agent URL: ${agentUrl}`);
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

  if (environment === CloudEnvironment.AZURE_FUNCTION && isAzureFlexWithoutDDAzureResourceGroup()) {
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

  // Configure unique named pipes to avoid conflicts when running multiple functions
  configurePipeNames(logger);

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

export { start, configurePipeNames };
