/* eslint-disable no-console */
class Logger {
    static base(func: Function, ...args: any[]) {
        if (args.length === 1 && typeof args[0] === "string") {
            func(
                `%c[TDN]%c: ${args[0]}`,
                "color: orange; font-weight: bold;",
                "color: initial; font-weight: initial;"
            );
        } else {
            func(...["[TDN]:", ...args]);
        }
    }

    static debug = (...args: any[]) => this.base(console.debug, ...args);

    static log = (...args: any[]) => this.base(console.log, ...args);
}

export const { log, debug } = Logger;
