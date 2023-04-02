import { SeededRandomNumberGenerator } from "./seeded-rng";

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
}
