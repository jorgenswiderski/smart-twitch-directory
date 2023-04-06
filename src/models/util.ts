import * as pako from "pako";
import { debug, log } from "./logger";
import { SeededRandomNumberGenerator } from "./seeded-rng";

type Difference = {
    path: string;
    value1: any;
    value2: any;
};

export class Util {
    // Helper function to normalize a value to the range [0-1] based on a given min and max value
    static normalize(value: number, min: number, max: number): number {
        return (value - min) / (max - min);
    }

    // Helper function to create a one-hot encoding object from an array and a set of unique values
    static encodeOneHot(
        value: string,
        uniqueValues: string[],
        prefix?: string
    ): Record<string, number> {
        const encoding: Record<string, number> = {};

        for (const uniqueValue of uniqueValues) {
            encoding[`${`${prefix}_` ?? ""}${uniqueValue}`] =
                value === uniqueValue ? 1 : 0;
        }

        return encoding;
    }

    // Helper function to tokenize a string (convert to lowercase and split by space)
    static tokenize(text: string): string[] {
        return text.toLowerCase().split(" ");
    }

    // Transpose a 2D array
    static transpose(array) {
        return array[0].map((col, i) => array.map((row) => row[i]));
    }

    // Perform a Fisher-Yates shuffle on the array, with optional seeded RNG.
    static shuffleArray<T>(array: T[], seed?: number): T[] {
        const newArray = [...array];
        const rng =
            seed !== undefined ? new SeededRandomNumberGenerator(seed) : Math;

        for (let i = newArray.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rng.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }

        return newArray;
    }

    static setUnion<T>(a: Set<T>, b: Set<T>): Set<T> {
        return new Set([...a, ...b]);
    }

    static setIntersection<T>(a: Set<T>, b: Set<T>): Set<T> {
        return new Set([...a].filter((x) => b.has(x)));
    }

    /*
     * Returns the elements that are in set A, that are absent from set B.
     */
    static setDifference<T>(a: Set<T>, b: Set<T>): Set<T> {
        return new Set([...a].filter((x) => !b.has(x)));
    }

    static deepCopy<T>(data: T): T {
        return JSON.parse(JSON.stringify(data));
    }

    /*
     * Release control of the execution to other threads. This can be used to
     * increase responsiveness of the browser during computationally intense operations.
     */
    static async yield() {
        return new Promise<void>((resolve) => {
            resolve();
        });
    }

    // Return a deep copy of the object, but with its keys in sorted order at every level.
    static deepSortKeys<T>(obj: T): T {
        if (Array.isArray(obj)) {
            return obj.map(this.deepSortKeys) as T;
        }

        if (typeof obj === "object" && obj !== null) {
            return Object.keys(obj)
                .sort()
                .reduce((sortedObj, key) => {
                    // eslint-disable-next-line no-param-reassign
                    sortedObj[key] = this.deepSortKeys(obj[key]);
                    return sortedObj;
                }, {} as T);
        }

        return obj;
    }

    // Compare two objects using JSON.stringify, sorting the keys such that a different key order still counts as a valid comparison.
    static compareObjects(obj1, obj2) {
        const diffs = this.deepCompare(obj1, obj2);

        return diffs.length === 0;
    }

    private static deepCompare(
        obj1: any,
        obj2: any,
        path: string = ""
    ): Difference[] {
        let differences: Difference[] = [];

        const keys1 = new Set(Object.keys(obj1));
        const keys2 = new Set(Object.keys(obj2));

        const allKeys = new Set([...keys1, ...keys2]);

        allKeys.forEach((key) => {
            const newPath = path ? `${path}.${key}` : key;

            // eslint-disable-next-line no-prototype-builtins
            if (!obj1.hasOwnProperty(key)) {
                differences.push({
                    path: newPath,
                    value1: undefined,
                    value2: obj2[key],
                });
                // eslint-disable-next-line no-prototype-builtins
            } else if (!obj2.hasOwnProperty(key)) {
                differences.push({
                    path: newPath,
                    value1: obj1[key],
                    value2: undefined,
                });
            } else if (
                typeof obj1[key] === "object" &&
                typeof obj2[key] === "object" &&
                obj1[key] !== null &&
                obj2[key] !== null
            ) {
                differences = differences.concat(
                    this.deepCompare(obj1[key], obj2[key], newPath)
                );
            } else if (obj1[key] !== obj2[key]) {
                differences.push({
                    path: newPath,
                    value1: obj1[key],
                    value2: obj2[key],
                });
            }
        });

        return differences;
    }
}
