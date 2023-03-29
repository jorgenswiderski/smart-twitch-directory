import { BagOfWords } from "./bag-of-words";

export enum EncodingInstruction {
    ONE_HOT, // Encode a categorical value to a one-hot representation
    CATEGORIES, // Similar to ONE_HOT, but sets a bit for every category present in an array
    NORMALIZE, // Normalize a numerical value to the range [0,1]
    BOOLEAN, // Convert a boolean value to numerical 0 | 1
    BAG_OF_WORDS, // Convert a string to a series of boolean values indicating the presence/absence of the most common words in the dataset
    CATEGORY_INDEX, // Similar to ONE_HOT, but encodes to a single number indicating the index of the category in the encoding map
}

// support for nested instructions, for encoding values nested within the object
interface EncodingInstructions {
    [key: string]: EncodingInstruction | EncodingInstructions;
}

export interface EncodingKeys {
    [key: string]: Encoding | EncodingKeys;
}

interface EncodingBase {
    encodingType: EncodingInstruction;
}

interface OneHotEncoding extends EncodingBase {
    encodingType: EncodingInstruction.ONE_HOT;
    categories: string[];
}

interface CategoriesEncoding extends EncodingBase {
    encodingType: EncodingInstruction.CATEGORIES;
    categories: string[];
}

interface NormalizeEncoding extends EncodingBase {
    encodingType: EncodingInstruction.NORMALIZE;
    min: number;
    max: number;
}

interface BooleanEncoding extends EncodingBase {
    encodingType: EncodingInstruction.BOOLEAN;
}

interface BagOfWordsEncoding extends EncodingBase {
    encodingType: EncodingInstruction.BAG_OF_WORDS;
    vocabulary: string[];
}

interface CategoryIndexEncoding extends EncodingBase {
    encodingType: EncodingInstruction.CATEGORY_INDEX;
    categories: string[];
}

type Encoding =
    | OneHotEncoding
    | CategoriesEncoding
    | NormalizeEncoding
    | BooleanEncoding
    | BagOfWordsEncoding
    | CategoryIndexEncoding;

export class MachineLearningEncoder {
    // Helper function to normalize a value to the range [0,1] based on a given min and max value
    private static normalize(value: number, min: number, max: number): number {
        return (value - min) / (max - min);
    }

    // Helper function to create a one-hot encoding object from an array and a set of unique values
    private static encodeOneHot(
        value: string,
        uniqueValues: string[],
        prefix?: string
    ): Record<string, number> {
        const encoding: Record<string, number> = {};

        uniqueValues.forEach((uniqueValue) => {
            encoding[`${prefix ? `${prefix}_` : ""}${uniqueValue}`] =
                value === uniqueValue ? 1 : 0;
        });

        return encoding;
    }

    // Helper function to create a one-hot encoding object from an array and a set of unique values
    private static encodeCategories(
        values: string[],
        uniqueValues: string[],
        prefix?: string
    ): Record<string, number> {
        const encoding: Record<string, number> = {};

        uniqueValues.forEach((uniqueValue) => {
            encoding[`${prefix ? `${prefix}_` : ""}${uniqueValue}`] =
                values.findIndex((value) => value === uniqueValue) >= 0 ? 1 : 0;
        });

        return encoding;
    }

    private static buildEncodingKeys(
        dataset: Record<string, any>[],
        instructions: EncodingInstruction | EncodingInstructions
    ): EncodingKeys {
        const encoding: EncodingKeys = {};

        Object.keys(instructions).forEach((key) => {
            const instruction = instructions[key];

            if (typeof instruction === "object") {
                encoding[key] = MachineLearningEncoder.buildEncodingKeys(
                    dataset.map((entry) => entry[key]),
                    instruction
                );
            } else if (instruction === EncodingInstruction.CATEGORIES) {
                encoding[key] = {
                    encodingType: EncodingInstruction.CATEGORIES,
                    categories: Array.from(
                        new Set(dataset.map((entry) => entry[key]).flat())
                    ),
                };
            } else if (
                instruction === EncodingInstruction.ONE_HOT ||
                instruction === EncodingInstruction.CATEGORY_INDEX
            ) {
                encoding[key] = {
                    encodingType: instruction,
                    categories: Array.from(
                        new Set(dataset.map((entry) => entry[key]))
                    ),
                };
            } else if (instruction === EncodingInstruction.NORMALIZE) {
                encoding[key] = {
                    encodingType: EncodingInstruction.NORMALIZE,
                    min: Math.min(...dataset.map((entry) => entry[key])),
                    max: Math.max(...dataset.map((entry) => entry[key])),
                };
            } else if (instruction === EncodingInstruction.BAG_OF_WORDS) {
                encoding[key] = {
                    encodingType: EncodingInstruction.BAG_OF_WORDS,
                    vocabulary: BagOfWords.buildVocabulary(
                        dataset.map((entry) => entry[key]),
                        50
                    ),
                };
            } else if (instruction === EncodingInstruction.BOOLEAN) {
                encoding[key] = {
                    encodingType: EncodingInstruction.BOOLEAN,
                };
            }
        });

        return encoding;
    }

    static encodeDataset(
        dataset: Record<string, any>[],
        instructions: EncodingInstructions
    ): { encoding: EncodingKeys; data: Record<string, number>[] } {
        const encoding: EncodingKeys = MachineLearningEncoder.buildEncodingKeys(
            dataset,
            instructions
        );

        const encodedData = dataset.map((entry) =>
            MachineLearningEncoder.encodeEntry(entry, encoding)
        );

        return { encoding, data: encodedData };
    }

    static encodeEntry(
        entry: Record<string, any>,
        encodingKeys: EncodingKeys
    ): Record<string, number> {
        const encodedEntry: Record<string, number> = {};

        Object.keys(encodingKeys).forEach((key) => {
            const encodingKey = encodingKeys[key];

            if (encodingKey.encodingType === EncodingInstruction.NORMALIZE) {
                const { min, max } = encodingKey;

                encodedEntry[key] = MachineLearningEncoder.normalize(
                    entry[key],
                    min,
                    max
                );
            } else if (
                encodingKey.encodingType === EncodingInstruction.ONE_HOT
            ) {
                const oneHotEncoding = MachineLearningEncoder.encodeOneHot(
                    entry[key],
                    encodingKey.categories,
                    key
                );

                Object.assign(encodedEntry, oneHotEncoding);
            } else if (
                encodingKey.encodingType === EncodingInstruction.CATEGORIES
            ) {
                const categoriesEncoding =
                    MachineLearningEncoder.encodeCategories(
                        entry[key],
                        encodingKey.categories,
                        key
                    );

                Object.assign(encodedEntry, categoriesEncoding);
            } else if (
                encodingKey.encodingType === EncodingInstruction.BAG_OF_WORDS
            ) {
                const BagOfWordsEncoding = BagOfWords.encodeString(
                    entry[key],
                    encodingKey.vocabulary
                );

                Object.assign(encodedEntry, BagOfWordsEncoding);
            } else if (
                encodingKey.encodingType === EncodingInstruction.BOOLEAN
            ) {
                encodedEntry[key] = entry[key] ? 1 : 0;
            } else if (
                encodingKey.encodingType === EncodingInstruction.CATEGORY_INDEX
            ) {
                encodedEntry[key] = encodingKey.categories.indexOf(entry[key]);
            } else if (
                typeof encodingKey === "object" &&
                !Array.isArray(encodingKey)
            ) {
                const encodedSubEntry = MachineLearningEncoder.encodeEntry(
                    entry[key],
                    encodingKey
                );

                Object.assign(encodedEntry, encodedSubEntry);
            }
        });

        return encodedEntry;
    }
}
