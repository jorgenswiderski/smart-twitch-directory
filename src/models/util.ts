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
}
