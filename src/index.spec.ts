import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock fs and child_process before any imports so Jest intercepts them
jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  copyFileSync: jest.fn(),
  chmodSync: jest.fn(),
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

describe('start()', () => {
  const baseEnv = { ...process.env };
  const azureFunctionEnv = {
    FUNCTIONS_EXTENSION_VERSION: '~4',
    FUNCTIONS_WORKER_RUNTIME: 'node',
  };

  let mockLogger: { debug: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let existsSyncMock: jest.Mock;
  let spawnMock: jest.Mock;
  let start: (logger: typeof mockLogger) => void;

  function setPlatform(platform: string) {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  }

  function setArch(arch: string) {
    Object.defineProperty(process, 'arch', { value: arch, configurable: true });
  }

  beforeEach(() => {
    process.env = { ...baseEnv, ...azureFunctionEnv };
    setPlatform('linux');
    setArch('x64');

    jest.resetModules();

    const fs = require('fs');
    existsSyncMock = fs.existsSync as jest.Mock;

    const cp = require('child_process');
    spawnMock = cp.spawn as jest.Mock;
    spawnMock.mockReturnValue(undefined);

    start = require('./index').start;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  });

  afterEach(() => {
    process.env = baseEnv;
    setPlatform(process.platform);
    setArch(process.arch);
    jest.restoreAllMocks();
  });

  it('logs a graceful error when the optional platform package is not installed', () => {
    // No DD_SERVERLESS_COMPAT_PATH set and no optional package installed in test env
    // → getBinaryPath() returns undefined
    start(mockLogger);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('could not find platform binary package')
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('logs a graceful error when the resolved binary does not exist on disk', () => {
    process.env.DD_SERVERLESS_COMPAT_PATH = '/some/path/to/binary';
    existsSyncMock.mockReturnValue(false);

    start(mockLogger);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('could not find binary at path /some/path/to/binary')
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('spawns the binary when DD_SERVERLESS_COMPAT_PATH points to an existing file', () => {
    process.env.DD_SERVERLESS_COMPAT_PATH = '/some/path/to/binary';
    existsSyncMock.mockReturnValue(true);

    start(mockLogger);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('does not start when no supported cloud environment is detected', () => {
    delete process.env.FUNCTIONS_EXTENSION_VERSION;
    delete process.env.FUNCTIONS_WORKER_RUNTIME;

    start(mockLogger);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown environment detected')
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('does not start on unsupported platforms', () => {
    setPlatform('darwin');
    jest.resetModules();
    start = require('./index').start;
    process.env.DD_SERVERLESS_COMPAT_PATH = '/some/path/to/binary';

    start(mockLogger);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Platform darwin detected')
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('does not start on unsupported architectures', () => {
    setArch('s390x');
    jest.resetModules();
    start = require('./index').start;
    process.env.DD_SERVERLESS_COMPAT_PATH = '/some/path/to/binary';

    start(mockLogger);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Architecture s390x detected')
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('does not start Azure Flex when DD_AZURE_RESOURCE_GROUP is missing', () => {
    process.env.WEBSITE_SKU = 'FlexConsumption';
    process.env.DD_SERVERLESS_COMPAT_PATH = '/some/path/to/binary';
    delete process.env.DD_AZURE_RESOURCE_GROUP;

    start(mockLogger);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('DD_AZURE_RESOURCE_GROUP')
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
