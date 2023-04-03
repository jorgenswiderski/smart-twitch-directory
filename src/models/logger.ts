/* eslint-disable no-console */
class Logger {
    static log(...args: any[]) {
        if (args.length === 1 && typeof args[0] === "string") {
            console.log(
                `%c[TDN]%c: ${args[0]}`,
                "color: orange; font-weight: bold;",
                "color: initial; font-weight: initial;"
            );
        } else {
            console.log(...["[TDN]: ", ...args]);
        }
    }
}

export const { log } = Logger;
