import { spawn } from 'child_process';
import { existsSync, copyFileSync } from 'fs';
import { start } from './index';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(), copyFileSync: jest.fn(), chmodSync: jest.fn(),
}));
jest.mock('./version', () => ({ LIB_VERSION: '0.23.0' }));

describe('child process version metadata', () => {
  const originalEnv = process.env;
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'linux' });
    process.env = {
      DD_SERVERLESS_COMPAT_VERSION: 'stale', NODE_VERSION: 'stale',
      FUNCTIONS_WORKER_RUNTIME_VERSION: 'stale', DD_SERVICE: 'keep-me',
    };
    jest.mocked(existsSync).mockReturnValue(true);
  });
  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', originalPlatform);
    jest.restoreAllMocks();
  });

  it.each([undefined, '/custom/compat'])('forwards versions with binary override %s', (binaryPath) => {
    process.env.FUNCTION_NAME = 'test-function';
    process.env.GCP_PROJECT = 'test-project';
    if (binaryPath) process.env.DD_SERVERLESS_COMPAT_PATH = binaryPath;
    start();
    expect(spawn).toHaveBeenCalledWith(expect.any(String), {
      stdio: 'inherit', env: expect.objectContaining({
        DD_SERVERLESS_COMPAT_VERSION: '0.23.0',
        NODE_VERSION: process.versions.node, DD_SERVICE: 'keep-me',
        FUNCTIONS_WORKER_RUNTIME_VERSION: 'stale',
      }),
    });
    if (binaryPath) expect(copyFileSync).toHaveBeenCalledWith(binaryPath, expect.any(String));
    expect(process.env.NODE_VERSION).toBe('stale');
  });

  it('passes the loaded Node version to Azure without mutating platform settings', () => {
    process.env.FUNCTIONS_EXTENSION_VERSION = '~4';
    process.env.FUNCTIONS_WORKER_RUNTIME = 'node';
    start();
    expect(spawn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      env: expect.objectContaining({ FUNCTIONS_WORKER_RUNTIME_VERSION: process.versions.node }),
    }));
    expect(process.env.FUNCTIONS_WORKER_RUNTIME_VERSION).toBe('stale');
  });
});
