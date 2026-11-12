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
      FUNCTIONS_WORKER_RUNTIME_VERSION: 'platform-version',
      DD_SERVERLESS_COMPAT_PATH: '/custom/compat',
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
    it('forwards versions without changing platform variables or the parent environment', () => {
      Object.assign(process.env, platformEnv);
      start();
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn).toHaveBeenCalledWith(expect.any(String), {
        stdio: 'inherit', env: expect.objectContaining({
          DD_SERVERLESS_COMPAT_VERSION: '0.23.0',
          DD_SERVERLESS_COMPAT_RUNTIME: `node${process.versions.node}`,
          NODE_VERSION: 'stale',
          FUNCTIONS_WORKER_RUNTIME_VERSION: 'platform-version',
        }),
      });
      expect(copyFileSync).toHaveBeenCalledWith('/custom/compat', expect.any(String));
      expect(process.env.NODE_VERSION).toBe('stale');
      expect(process.env.DD_SERVERLESS_COMPAT_RUNTIME).toBe('stale');
      expect(process.env.FUNCTIONS_WORKER_RUNTIME_VERSION).toBe('platform-version');
    });
  });
});
