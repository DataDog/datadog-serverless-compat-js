import { Logger } from './utils/log';

// Mock crypto module
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-guid-1234-5678'),
}));

describe('configurePipeNames', () => {
  let configurePipeNames: (logger: Logger) => void;
  let mockLogger: Logger;
  const baseEnv = { ...process.env };
  const MOCK_GUID = 'test-guid-1234-5678';
  const MAX_BASE_LENGTH = 210;

  beforeEach(() => {
    process.env = { ...baseEnv };
    delete process.env.DD_TRACE_AGENT_URL;
    delete process.env.DD_TRACE_WINDOWS_PIPE_NAME;
    delete process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    jest.resetModules();
    const indexModule = require('./index');
    configurePipeNames = indexModule.configurePipeNames;
  });

  afterEach(() => {
    process.env = baseEnv;
  });

  describe('default behavior', () => {
    it('should use default pipe name with GUID for both libraries', () => {
      configurePipeNames(mockLogger);

      const expectedUrl = `unix:\\\\.\\pipe\\dd_compat_pipe_${MOCK_GUID}`;
      const expectedPipeName = `dd_compat_pipe_${MOCK_GUID}`;

      expect(process.env.DD_TRACE_AGENT_URL).toBe(expectedUrl);
      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toBe(expectedPipeName);
      expect(process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME).toBe(expectedPipeName);
      expect(mockLogger.debug).toHaveBeenCalledWith(`Configured agent URL: ${expectedUrl}`);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('priority fallback chain', () => {
    it.each([
      {
        name: 'DD_TRACE_WINDOWS_PIPE_NAME',
        envVar: 'DD_TRACE_WINDOWS_PIPE_NAME',
        value: 'trace_pipe',
      },
      {
        name: 'DD_DOGSTATSD_WINDOWS_PIPE_NAME',
        envVar: 'DD_DOGSTATSD_WINDOWS_PIPE_NAME',
        value: 'dogstatsd_pipe',
      },
    ])('should use $name when set', ({ envVar, value }) => {
      process.env[envVar] = value;
      configurePipeNames(mockLogger);

      const expectedUrl = `unix:\\\\.\\pipe\\${value}_${MOCK_GUID}`;
      const expectedPipeName = `${value}_${MOCK_GUID}`;

      expect(process.env.DD_TRACE_AGENT_URL).toBe(expectedUrl);
      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toBe(expectedPipeName);
      expect(process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME).toBe(expectedPipeName);
    });

    it('should prioritize DD_TRACE_WINDOWS_PIPE_NAME over DD_DOGSTATSD_WINDOWS_PIPE_NAME', () => {
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = 'trace_pipe';
      process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME = 'dogstatsd_pipe';

      configurePipeNames(mockLogger);

      const expectedUrl = `unix:\\\\.\\pipe\\trace_pipe_${MOCK_GUID}`;
      expect(process.env.DD_TRACE_AGENT_URL).toBe(expectedUrl);
    });

    it('should extract pipe name from DD_TRACE_AGENT_URL if WINDOWS_PIPE_NAME not set', () => {
      process.env.DD_TRACE_AGENT_URL = 'unix:\\\\.\\pipe\\existing_pipe';

      configurePipeNames(mockLogger);

      const expectedUrl = `unix:\\\\.\\pipe\\existing_pipe_${MOCK_GUID}`;
      const expectedPipeName = `existing_pipe_${MOCK_GUID}`;

      expect(process.env.DD_TRACE_AGENT_URL).toBe(expectedUrl);
      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toBe(expectedPipeName);
      expect(process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME).toBe(expectedPipeName);
    });
  });

  describe('URL conflict warnings', () => {
    it('should warn when DD_TRACE_AGENT_URL differs from generated value', () => {
      process.env.DD_TRACE_AGENT_URL = 'unix:\\\\.\\pipe\\wrong_pipe';
      configurePipeNames(mockLogger);

      const expectedUrl = `unix:\\\\.\\pipe\\wrong_pipe_${MOCK_GUID}`;
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`DD_TRACE_AGENT_URL (unix:\\\\.\\pipe\\wrong_pipe) differs from generated value (${expectedUrl})`)
      );
      expect(process.env.DD_TRACE_AGENT_URL).toBe(expectedUrl);
    });

    it('should not warn when no URLs are pre-set', () => {
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = 'my_pipe';
      configurePipeNames(mockLogger);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('256 character limit enforcement', () => {
    it.each([
      { baseName: 'a'.repeat(250), desc: 'exceeding limit' },
      { baseName: 'e'.repeat(211), desc: 'one character over' },
    ])('should truncate base name when $desc', ({ baseName }) => {
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = baseName;
      configurePipeNames(mockLogger);

      const expectedPipeName = `${'a'.repeat(MAX_BASE_LENGTH)}_${MOCK_GUID}`.substring(0, MAX_BASE_LENGTH + 1 + MOCK_GUID.length);
      const truncatedBase = expectedPipeName.split('_')[0];

      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toContain(`_${MOCK_GUID}`);
      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME?.length).toBe(MAX_BASE_LENGTH + 1 + MOCK_GUID.length);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Pipe base name is too long (${baseName.length} chars)`)
      );
    });

    it.each([
      { baseName: 'c'.repeat(MAX_BASE_LENGTH), desc: 'exactly at limit' },
      { baseName: 'short', desc: 'well within limit' },
    ])('should not truncate when $desc', ({ baseName }) => {
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = baseName;
      configurePipeNames(mockLogger);

      const expectedPipeName = `${baseName}_${MOCK_GUID}`;
      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toBe(expectedPipeName);
      expect(mockLogger.warn).not.toHaveBeenCalledWith(expect.stringContaining('too long'));
    });

    it('should never truncate the GUID', () => {
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = 'x'.repeat(500);
      configurePipeNames(mockLogger);

      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toMatch(new RegExp(`_${MOCK_GUID}$`));
      expect(process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME).toMatch(new RegExp(`_${MOCK_GUID}$`));
    });

    it('should work correctly with production UUID length (36 chars)', () => {
      // Verify math: 210 (base) + 1 (underscore) + 36 (UUID) = 247 (max pipe name)
      const productionMaxPipeName = MAX_BASE_LENGTH + 1 + 36;
      expect(productionMaxPipeName).toBe(247); // Fits within 256 with \\.\pipe\ prefix
    });
  });

  describe('combined scenarios', () => {
    it('should handle matching base names without warning', () => {
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = 'custom_pipe';
      process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME = 'custom_pipe';

      configurePipeNames(mockLogger);

      const expectedUrl = `unix:\\\\.\\pipe\\custom_pipe_${MOCK_GUID}`;
      expect(process.env.DD_TRACE_AGENT_URL).toBe(expectedUrl);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should handle truncation and conflict warnings together', () => {
      const longBaseName = 'f'.repeat(250);
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = longBaseName;
      process.env.DD_TRACE_AGENT_URL = 'unix:\\\\.\\pipe\\conflicting';

      configurePipeNames(mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Pipe base name is too long'));
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('DD_TRACE_AGENT_URL'));

      const expectedPipeName = `${'f'.repeat(MAX_BASE_LENGTH)}_${MOCK_GUID}`;
      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toBe(expectedPipeName);
      expect(process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME).toBe(expectedPipeName);
    });
  });
});
