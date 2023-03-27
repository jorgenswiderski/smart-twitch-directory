import * as _ from "lodash";

export class BagOfWords {
    static stopwords = [
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "but",
        "by",
        "for",
        "if",
        "in",
        "into",
        "is",
        "it",
        "no",
        "not",
        "of",
        "on",
        "or",
        "such",
        "that",
        "the",
        "their",
        "then",
        "there",
        "these",
        "they",
        "this",
        "to",
        "was",
        "will",
        "with",
    ];

    static tokenize(text: string): string[] {
        const words = text.toLowerCase().split(/\W+/);
        return words.filter((word) => !BagOfWords.stopwords.includes(word));
    }

    static buildVocabulary(strings: string[], vocabularySize = 50) {
        const tokenized = strings.map(BagOfWords.tokenize);
        const allWords = _.flatten(tokenized);
        const wordCount = _.countBy(allWords);

        const vocabulary = _(wordCount)
            .map((count, word) => ({ word, count }))
            .orderBy("count", "desc")
            .slice(0, vocabularySize)
            .map((entry) => entry.word)
            .value();

        return vocabulary;
    }

    static encodeString(
        string: string,
        vocabulary: string[]
    ): Record<string, number> {
        const tokens = BagOfWords.tokenize(string);
        const encoding: Record<string, number> = {};

        vocabulary.forEach((word) => {
            encoding[`title_${word}`] = tokens.includes(word) ? 1 : 0;
        });

        return encoding;
    }
}
