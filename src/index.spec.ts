import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { start } from './index';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('fs', () => ({ existsSync: jest.fn(), mkdirSync: jest.fn(), copyFileSync: jest.fn(), chmodSync: jest.fn() }));

describe('automatic runtime metadata', () => {
  const originalEnv = process.env;
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', originalPlatform);
    jest.clearAllMocks();
  });

  it.each([undefined, 'incorrect-runtime'])('uses actual Node version with inherited hint %s', inherited => {
    process.env = { FUNCTION_NAME: 'test-function', GCP_PROJECT: 'test-project' };
    if (inherited !== undefined) process.env.DD_SERVERLESS_COMPAT_RUNTIME = inherited;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    jest.mocked(existsSync).mockReturnValue(true);

    start();

    expect(spawn).toHaveBeenCalledTimes(1);
    const options = jest.mocked(spawn).mock.calls[0][1] as unknown as { env: NodeJS.ProcessEnv };
    expect(options.env.DD_SERVERLESS_COMPAT_RUNTIME).toBe(`node${process.versions.node}`);
    expect(options.env.NODE_VERSION).toBeUndefined();
    expect(options.env.DD_SERVERLESS_COMPAT_VERSION).toBeDefined();
    expect(process.env.DD_SERVERLESS_COMPAT_RUNTIME).toBe(inherited);
  });
});
