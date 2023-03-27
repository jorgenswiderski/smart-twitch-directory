import * as _ from "lodash";
import { WatchDataService, WatchStream } from "../../watch-data/watch-data";
import { Util } from "../../util";

interface SageWatchStream extends WatchStream {
    watched: boolean;
}

export class StreamSagePreprocessor {
    rawData: SageWatchStream[];

    data: any;

    loading: Promise<void>;

    constructor() {
        this.loading = new Promise((resolve, reject) => {
            this.getData()
                .then(() => {
                    resolve();
                })
                .catch((err) => {
                    console.error(err);
                    reject();
                });
        });
    }

    async getData() {
        await WatchDataService.waitForData();
        const samples = WatchDataService.data;

        this.rawData = samples
            .map((sample) =>
                sample.followedStreams.map((stream) => ({
                    ...stream,
                    watched: sample.watched[stream.user_id] ?? false,
                }))
            )
            .flat();
    }

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
        return words.filter(
            (word) => !StreamSagePreprocessor.stopwords.includes(word)
        );
    }

    createVocabulary() {
        const allTitles = this.rawData.map((entry) => entry.title);
        const tokenizedTitles = allTitles.map(StreamSagePreprocessor.tokenize);
        const allWords = _.flatten(tokenizedTitles);
        const wordCount = _.countBy(allWords);

        const vocabularySize = 50;
        const vocabulary = _(wordCount)
            .map((count, word) => ({ word, count }))
            .orderBy("count", "desc")
            .slice(0, vocabularySize)
            .map((entry) => entry.word)
            .value();

        return vocabulary;
    }

    static encodeTitle(
        title: string,
        vocabulary: string[]
    ): Record<string, number> {
        const tokens = StreamSagePreprocessor.tokenize(title);
        const encoding: Record<string, number> = {};

        for (const word of vocabulary) {
            encoding[`title_${word}`] = tokens.includes(word) ? 1 : 0;
        }

        return encoding;
    }

    encodingKeys: {
        // onehot unique values
        user_id: string[];
        game_id: string[];
        language: string[];

        viewer_count: number[]; // min, max
        title: string[]; // vocabulary
    };

    buildEncoders() {
        // Extract the unique values for categorical features
        this.encodingKeys = {
            user_id: _.uniq(this.rawData.map((entry) => entry.user_id)),
            game_id: _.uniq(this.rawData.map((entry) => entry.game_id)),
            language: _.uniq(this.rawData.map((entry) => entry.language)),

            // Calculate the min and max values for viewer_count
            viewer_count: [
                _.min(this.rawData.map((entry) => entry.viewer_count)),
                _.max(this.rawData.map((entry) => entry.viewer_count)),
            ],

            title: this.createVocabulary(),
        };
    }

    // FIXME
    encodeEntry(entry: /* SageWatchStream */ any) {
        const userIdEncoding = Util.encodeOneHot(
            entry.user_id,
            this.encodingKeys.user_id,
            "userId"
        );
        const gameIdEncoding = Util.encodeOneHot(
            entry.game_id,
            this.encodingKeys.game_id,
            "gameId"
        );
        const languageEncoding = Util.encodeOneHot(
            entry.language,
            this.encodingKeys.language,
            "language"
        );
        const titleEncoding = StreamSagePreprocessor.encodeTitle(
            entry.title,
            this.encodingKeys.title
        );

        const viewerCountNormalized = Util.normalize(
            entry.viewer_count,
            this.encodingKeys.viewer_count[0],
            this.encodingKeys.viewer_count[1]
        );

        const preprocessed = {
            ...userIdEncoding,
            ...gameIdEncoding,
            ...languageEncoding,
            ...titleEncoding,
            viewer_count: viewerCountNormalized,
            is_mature: entry.is_mature,
            watched: entry?.watched ? 1 : 0, // Add this field to distinguish between watched and notWatched streams
        };

        // console.log(preprocessed);

        return preprocessed;
    }

    preprocess() {
        this.buildEncoders();

        // Preprocess the raw data
        const preprocessedData = this.rawData.map(this.encodeEntry.bind(this));

        this.data = preprocessedData;
    }

    async getResults() {
        await this.loading;
        this.preprocess();
        return this.data;
    }
}
