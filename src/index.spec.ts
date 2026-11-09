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
      DD_SERVERLESS_COMPAT_RUNTIME: 'stale',
      FUNCTIONS_WORKER_RUNTIME_VERSION: 'stale', DD_SERVICE: 'keep-me',
    };
    jest.mocked(existsSync).mockReturnValue(true);
  });
  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', originalPlatform);
    jest.restoreAllMocks();
  });

  describe.each([
    { name: 'Azure Functions', env: { FUNCTIONS_EXTENSION_VERSION: '~4', FUNCTIONS_WORKER_RUNTIME: 'node' } },
    { name: 'GCP legacy environment', env: { FUNCTION_NAME: 'test-function', GCP_PROJECT: 'test-project' } },
    { name: 'GCP K_SERVICE environment', env: { K_SERVICE: 'test-service', FUNCTION_TARGET: 'handler' } },
  ])('$name', ({ env: platformEnv }) => {
    describe.each([undefined, 'stale'])('inherited worker version %s', (workerVersion) => {
      it.each([undefined, '/custom/compat'])('forwards versions with binary override %s', (binaryPath) => {
        Object.assign(process.env, platformEnv);
        delete process.env.FUNCTIONS_WORKER_RUNTIME_VERSION;
        if (workerVersion !== undefined) process.env.FUNCTIONS_WORKER_RUNTIME_VERSION = workerVersion;
        if (binaryPath) process.env.DD_SERVERLESS_COMPAT_PATH = binaryPath;
        start();
        expect(spawn).toHaveBeenCalledTimes(1);
        expect(spawn).toHaveBeenCalledWith(expect.any(String), {
          stdio: 'inherit', env: expect.objectContaining({
            DD_SERVERLESS_COMPAT_VERSION: '0.23.0',
            DD_SERVERLESS_COMPAT_RUNTIME: `node${process.versions.node}`,
            NODE_VERSION: 'stale', DD_SERVICE: 'keep-me',
          }),
        });
        const childEnv = (spawn as jest.Mock).mock.calls[0][1].env;
        if (workerVersion === undefined) {
          expect(childEnv).not.toHaveProperty('FUNCTIONS_WORKER_RUNTIME_VERSION');
        } else {
          expect(childEnv.FUNCTIONS_WORKER_RUNTIME_VERSION).toBe(workerVersion);
        }
        if (binaryPath) expect(copyFileSync).toHaveBeenCalledWith(binaryPath, expect.any(String));
        expect(process.env.NODE_VERSION).toBe('stale');
        expect(process.env.DD_SERVERLESS_COMPAT_RUNTIME).toBe('stale');
        expect(process.env.FUNCTIONS_WORKER_RUNTIME_VERSION).toBe(workerVersion);
      });
    });
  });
});
