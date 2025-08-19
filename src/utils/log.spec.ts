import { Logger } from "./log";

describe("log", () => {
    const logLevels: (string | null)[] = ["trace", "debug", "info", "warn", "error", "critical", "off", "invalid", null];

    describe.each(logLevels)("default logger initialization with DD_LOG_LEVEL=%s", (level) => {
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
            log = require("./log").log;
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
});
