import { Logger } from './utils/log';

// Mock crypto module
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-guid-1234-5678'),
}));

describe('configurePipeNames', () => {
  let configurePipeNames: (logger: Logger) => void;
  let mockLogger: Logger;
  const baseEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    process.env = { ...baseEnv };
    delete process.env.DD_TRACE_PIPE_NAME;
    delete process.env.DD_TRACE_WINDOWS_PIPE_NAME;
    delete process.env.DD_DOGSTATSD_PIPE_NAME;
    delete process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME;

    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Reset modules to get fresh import
    jest.resetModules();
    const indexModule = require('./index');
    configurePipeNames = indexModule.configurePipeNames;
  });

  afterEach(() => {
    process.env = baseEnv;
  });

  describe('default behavior (no manual overrides)', () => {
    it('should generate unique pipe names with GUID', () => {
      configurePipeNames(mockLogger);

      expect(process.env.DD_TRACE_PIPE_NAME).toBe('DD_TRACE_test-guid-1234-5678');
      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toBe('DD_TRACE_test-guid-1234-5678');
      expect(process.env.DD_DOGSTATSD_PIPE_NAME).toBe('DD_DOGSTATSD_test-guid-1234-5678');
      expect(process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME).toBe('DD_DOGSTATSD_test-guid-1234-5678');
    });

    it('should log debug messages with configured pipe names', () => {
      configurePipeNames(mockLogger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Configured trace pipe name: DD_TRACE_test-guid-1234-5678'
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Configured dogstatsd pipe name: DD_DOGSTATSD_test-guid-1234-5678'
      );
    });

    it('should not log any warnings', () => {
      configurePipeNames(mockLogger);

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('with DD_TRACE_WINDOWS_PIPE_NAME override', () => {
    it('should use custom base name with GUID appended', () => {
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = 'custom_trace_pipe';

      configurePipeNames(mockLogger);

      expect(process.env.DD_TRACE_PIPE_NAME).toBe('custom_trace_pipe_test-guid-1234-5678');
      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toBe('custom_trace_pipe_test-guid-1234-5678');
    });

    it('should not affect dogstatsd pipe names', () => {
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = 'custom_trace_pipe';

      configurePipeNames(mockLogger);

      expect(process.env.DD_DOGSTATSD_PIPE_NAME).toBe('DD_DOGSTATSD_test-guid-1234-5678');
      expect(process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME).toBe('DD_DOGSTATSD_test-guid-1234-5678');
    });
  });

  describe('with DD_DOGSTATSD_WINDOWS_PIPE_NAME override', () => {
    it('should use custom base name with GUID appended', () => {
      process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME = 'custom_dogstatsd_pipe';

      configurePipeNames(mockLogger);

      expect(process.env.DD_DOGSTATSD_PIPE_NAME).toBe('custom_dogstatsd_pipe_test-guid-1234-5678');
      expect(process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME).toBe('custom_dogstatsd_pipe_test-guid-1234-5678');
    });

    it('should not affect trace pipe names', () => {
      process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME = 'custom_dogstatsd_pipe';

      configurePipeNames(mockLogger);

      expect(process.env.DD_TRACE_PIPE_NAME).toBe('DD_TRACE_test-guid-1234-5678');
      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toBe('DD_TRACE_test-guid-1234-5678');
    });
  });

  describe('with conflicting DD_TRACE_PIPE_NAME', () => {
    it('should warn when DD_TRACE_PIPE_NAME differs from generated name', () => {
      process.env.DD_TRACE_PIPE_NAME = 'different_trace_pipe';

      configurePipeNames(mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'DD_TRACE_PIPE_NAME (different_trace_pipe) differs from DD_TRACE_WINDOWS_PIPE_NAME (DD_TRACE_test-guid-1234-5678). Using DD_TRACE_WINDOWS_PIPE_NAME with GUID suffix.'
      );
    });

    it('should override DD_TRACE_PIPE_NAME with generated value', () => {
      process.env.DD_TRACE_PIPE_NAME = 'different_trace_pipe';

      configurePipeNames(mockLogger);

      expect(process.env.DD_TRACE_PIPE_NAME).toBe('DD_TRACE_test-guid-1234-5678');
      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toBe('DD_TRACE_test-guid-1234-5678');
    });

    it('should not warn if DD_TRACE_PIPE_NAME matches generated name', () => {
      process.env.DD_TRACE_PIPE_NAME = 'DD_TRACE_test-guid-1234-5678';

      configurePipeNames(mockLogger);

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('with conflicting DD_DOGSTATSD_PIPE_NAME', () => {
    it('should warn when DD_DOGSTATSD_PIPE_NAME differs from generated name', () => {
      process.env.DD_DOGSTATSD_PIPE_NAME = 'different_dogstatsd_pipe';

      configurePipeNames(mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'DD_DOGSTATSD_PIPE_NAME (different_dogstatsd_pipe) differs from DD_DOGSTATSD_WINDOWS_PIPE_NAME (DD_DOGSTATSD_test-guid-1234-5678). Using DD_DOGSTATSD_WINDOWS_PIPE_NAME with GUID suffix.'
      );
    });

    it('should override DD_DOGSTATSD_PIPE_NAME with generated value', () => {
      process.env.DD_DOGSTATSD_PIPE_NAME = 'different_dogstatsd_pipe';

      configurePipeNames(mockLogger);

      expect(process.env.DD_DOGSTATSD_PIPE_NAME).toBe('DD_DOGSTATSD_test-guid-1234-5678');
      expect(process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME).toBe('DD_DOGSTATSD_test-guid-1234-5678');
    });
  });

  describe('256 character limit enforcement', () => {
    it('should truncate trace pipe name to 256 characters', () => {
      // Create a base name that will exceed 256 chars with GUID
      const longBaseName = 'a'.repeat(250);
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = longBaseName;

      configurePipeNames(mockLogger);

      const expectedName = `${longBaseName}_test-guid-1234-5678`;
      expect(process.env.DD_TRACE_PIPE_NAME).toBe(expectedName.substring(0, 256));
      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toBe(expectedName.substring(0, 256));
      expect(process.env.DD_TRACE_PIPE_NAME?.length).toBeLessThanOrEqual(256);
    });

    it('should truncate dogstatsd pipe name to 256 characters', () => {
      const longBaseName = 'b'.repeat(250);
      process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME = longBaseName;

      configurePipeNames(mockLogger);

      const expectedName = `${longBaseName}_test-guid-1234-5678`;
      expect(process.env.DD_DOGSTATSD_PIPE_NAME).toBe(expectedName.substring(0, 256));
      expect(process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME).toBe(expectedName.substring(0, 256));
      expect(process.env.DD_DOGSTATSD_PIPE_NAME?.length).toBeLessThanOrEqual(256);
    });

    it('should handle pipe names that are exactly 256 characters', () => {
      // Mock GUID 'test-guid-1234-5678' is 19 chars + 1 underscore = 20 chars
      // So base name should be 256 - 20 = 236 chars to hit exactly 256
      const baseName = 'c'.repeat(236);
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = baseName;

      configurePipeNames(mockLogger);

      expect(process.env.DD_TRACE_PIPE_NAME?.length).toBe(256);
      expect(process.env.DD_TRACE_PIPE_NAME).toBe(`${baseName}_test-guid-1234-5678`);
    });
  });

  describe('combined scenarios', () => {
    it('should handle both trace and dogstatsd overrides simultaneously', () => {
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = 'custom_trace';
      process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME = 'custom_dogstatsd';

      configurePipeNames(mockLogger);

      expect(process.env.DD_TRACE_PIPE_NAME).toBe('custom_trace_test-guid-1234-5678');
      expect(process.env.DD_TRACE_WINDOWS_PIPE_NAME).toBe('custom_trace_test-guid-1234-5678');
      expect(process.env.DD_DOGSTATSD_PIPE_NAME).toBe('custom_dogstatsd_test-guid-1234-5678');
      expect(process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME).toBe('custom_dogstatsd_test-guid-1234-5678');
    });

    it('should handle multiple conflicts and warn for each', () => {
      process.env.DD_TRACE_PIPE_NAME = 'wrong_trace';
      process.env.DD_DOGSTATSD_PIPE_NAME = 'wrong_dogstatsd';

      configurePipeNames(mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('DD_TRACE_PIPE_NAME')
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('DD_DOGSTATSD_PIPE_NAME')
      );
    });

    it('should handle custom base with conflicting non-Windows pipe name', () => {
      process.env.DD_TRACE_WINDOWS_PIPE_NAME = 'custom_base';
      process.env.DD_TRACE_PIPE_NAME = 'conflicting_value';

      configurePipeNames(mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'DD_TRACE_PIPE_NAME (conflicting_value) differs from DD_TRACE_WINDOWS_PIPE_NAME (custom_base_test-guid-1234-5678). Using DD_TRACE_WINDOWS_PIPE_NAME with GUID suffix.'
      );
      expect(process.env.DD_TRACE_PIPE_NAME).toBe('custom_base_test-guid-1234-5678');
    });
  });

  describe('environment variable persistence', () => {
    it('should set both pipe name variants to the same value', () => {
      configurePipeNames(mockLogger);

      expect(process.env.DD_TRACE_PIPE_NAME).toBe(process.env.DD_TRACE_WINDOWS_PIPE_NAME);
      expect(process.env.DD_DOGSTATSD_PIPE_NAME).toBe(process.env.DD_DOGSTATSD_WINDOWS_PIPE_NAME);
    });

    it('should persist values in process.env for spawned binary', () => {
      configurePipeNames(mockLogger);

      // Simulate accessing env vars as the spawned binary would
      const envForBinary = { ...process.env };

      expect(envForBinary.DD_TRACE_PIPE_NAME).toBeDefined();
      expect(envForBinary.DD_TRACE_WINDOWS_PIPE_NAME).toBeDefined();
      expect(envForBinary.DD_DOGSTATSD_PIPE_NAME).toBeDefined();
      expect(envForBinary.DD_DOGSTATSD_WINDOWS_PIPE_NAME).toBeDefined();
    });
  });
});
