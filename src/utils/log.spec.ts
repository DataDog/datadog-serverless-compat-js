import { Logger } from "./log";

describe("log", () => {
    const logLevels: (string | null)[] = ["trace", "debug", "info", "warn", "error", "critical", "off", "invalid", null];

    describe.each(logLevels)("logger initialization with DD_LOG_LEVEL=%s", (level) => {
        const baseEnv = { ...process.env };
        const expectedActiveMethodsByLevel: Record<string, Array<keyof Logger>> = {
            trace: ["debug", "info", "warn", "error"],
            debug: ["debug", "info", "warn", "error"],
            info: ["info", "warn", "error"],
            warn: ["warn", "error"],
            error: ["error"],
            critical: ["error"],
            off: [],
            invalid: ["info", "warn", "error"], // info level by default
            null: ["info", "warn", "error"], // info level by default
        };
        let log: Logger;

        beforeEach(() => {
            process.env = { ...baseEnv };

            if (level !== null) {
                process.env.DD_LOG_LEVEL = level;
            }

            jest.resetModules();
            const { logger } = require("./log");
            log = logger(__filename);
        });

        afterEach(() => {
            process.env = baseEnv;
        });

        it("activates the correct logger methods", () => {
            const consoleSpies = {
                debug: jest.spyOn(console, "debug").mockImplementation(() => { }),
                info: jest.spyOn(console, "info").mockImplementation(() => { }),
                warn: jest.spyOn(console, "warn").mockImplementation(() => { }),
                error: jest.spyOn(console, "error").mockImplementation(() => { }),
            };

            log.debug("");
            log.info("");
            log.warn("");
            log.error("");

            const expectedActiveMethods = expectedActiveMethodsByLevel[level === null ? "null" : level];
            const failures: string[] = [];

            for (const method of Object.keys(consoleSpies) as (keyof Logger)[]) {
                const shouldBeActive = expectedActiveMethods.includes(method);

                try {
                    if (shouldBeActive) {
                        expect(consoleSpies[method]).toHaveBeenCalled();
                    } else {
                        expect(consoleSpies[method]).not.toHaveBeenCalled();
                    }
                } catch (err) {
                    failures.push(
                        `Logger method '${method}' with DD_LOG_LEVEL=${level} should${shouldBeActive ? " " : " not "}have been called`
                    );
                }
            }

            if (failures.length > 0) {
                throw new Error(failures.join("\n"));
            }
        });
    });

    describe("the logger formatting", () => {
        const baseEnv = { ...process.env };
        let log: Logger;

        beforeEach(() => {
            process.env = { ...baseEnv };
            process.env.DD_LOG_LEVEL = 'debug'; // Set to debug to enable all log levels
            jest.resetModules();
            const { logger } = require("./log");
            log = logger(__filename);
        });

        afterEach(() => {
            process.env = baseEnv;
        });
        
        it.each([
            { method: 'debug' as keyof Logger, consoleMethod: 'debug', level: 'DEBUG' },
            { method: 'info' as keyof Logger, consoleMethod: 'info', level: 'INFO' },
            { method: 'warn' as keyof Logger, consoleMethod: 'warn', level: 'WARN' },
        ])("applies correct formatting for $method log", ({ method, consoleMethod, level }) => {
            const consoleSpy = jest.spyOn(console, consoleMethod as any).mockImplementation(() => { });

            log[method]("test message");

            expect(consoleSpy).toHaveBeenCalledTimes(1);
            const actualCall = consoleSpy.mock.calls[0][0];

            // Check the format: LEVEL [name] [location] - message
            // Should report the call site location that was passed to logger()
            expect(actualCall).toBe(`${level} [datadog-serverless-compat] [log.spec.ts] - test message`);

            consoleSpy.mockRestore();
        });

        it("applies correct formatting for error log with string message", () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            log.error("test message");

            expect(consoleSpy).toHaveBeenCalledTimes(1);
            const actualCall = consoleSpy.mock.calls[0][0];

            // For string messages, should format normally
            expect(actualCall).toBe('ERROR [datadog-serverless-compat] [log.spec.ts] - test message');

            consoleSpy.mockRestore();
        });

        it("applies correct formatting for error log with Error object", () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            const error = new Error("test error");
            log.error(error);

            expect(consoleSpy).toHaveBeenCalledTimes(1);
            const actualCall = consoleSpy.mock.calls[0][0];

            // console.error should receive a string (the modified stack trace), not an Error object
            expect(typeof actualCall).toBe('string');
            
            const lines = actualCall.split('\n');
            
            // First line should be our formatted message
            expect(lines[0]).toBe('ERROR [datadog-serverless-compat] [log.spec.ts] - test error');
            
            // Subsequent lines should contain the stack trace
            expect(lines.length).toBeGreaterThan(1);
            const hasStackTrace = lines.slice(1).some((line: string) => line.includes('at '));
            if (!hasStackTrace) {
                throw new Error(`Expected stack trace to be preserved in subsequent lines, but got:\n${lines.slice(1).join('\n')}`);
            }

            consoleSpy.mockRestore();
        });

        it("applies correct formatting for error log with Error object without stack", () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            const error = new Error("test error");
            delete error.stack; // Remove stack property
            log.error(error);

            expect(consoleSpy).toHaveBeenCalledTimes(1);
            const actualCall = consoleSpy.mock.calls[0][0];

            // When no stack is present, should just log the formatted message
            expect(actualCall).toBe('ERROR [datadog-serverless-compat] [log.spec.ts] - test error');

            consoleSpy.mockRestore();
        });
    });
});
