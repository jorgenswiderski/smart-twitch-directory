import { CONSTANTS } from "../../constants";
import {
    EncodingInstruction,
    EncodingKeys,
    EncodingMeanInputs,
    MachineLearningEncoder,
} from "../../ml-encoder/ml-encoder";
import { Util } from "../../util";
import { WatchDataService, WatchStream } from "../../watch-data/watch-data";
import { OracleCurator } from "../oracle/curator";

interface PreprocessOptions {
    maxTrainingSize?: number;
    trainingPercent?: number;
    seed?: number;
}

interface LtrData {
    x: number[][];
    y: number[][];
}

interface SamplerStats {
    streamers: {
        [key: number]: {
            all: number;
            positive: number;
        };
    };
    categories: {
        [key: number]: {
            all: number;
            positive: number;
        };
    };
}

export class LtrPreprocessor {
    static encodingInstructions = {
        user_id: EncodingInstruction.CATEGORY_INDEX,
        game_id: EncodingInstruction.CATEGORY_INDEX,
        // language: EncodingInstruction.ONE_HOT,
        // FIXME: convert to embedding layer / category index
        // title: EncodingInstruction.BAG_OF_WORDS,
        // viewer_count: EncodingInstruction.NORMALIZE,
        // is_mature: EncodingInstruction.BOOLEAN,
    };

    static composeDataset(data: number[][]): LtrData {
        return {
            x: data.map((e) => e.slice(0, 4)),
            y: data.map((e) => [e[4]]),
        };
    }

    static slice(data: LtrData, start?: number, end?: number): LtrData {
        return {
            x: data.x.slice(start, end),
            y: data.y.slice(start, end),
        };
    }

    static concat(a: LtrData, b: LtrData): LtrData {
        return {
            x: [...a.x, ...b.x],
            y: [...a.y, ...b.y],
        };
    }

    static calculateStats(
        data: number[][],
        uniqueStreamers: number[],
        uniqueCategories: number[]
    ): SamplerStats {
        const streamers: {
            [key: number]: { positive: number[][]; negative: number[][] };
        } = {};
        uniqueStreamers.forEach((id) => {
            streamers[id] = {
                positive: [],
                negative: [],
            };
        });

        const categories: {
            [key: number]: { positive: number[][]; negative: number[][] };
        } = {};
        uniqueCategories.forEach((id) => {
            categories[id] = {
                positive: [],
                negative: [],
            };
        });

        data.forEach((entry) => {
            streamers[entry[0]].positive.push(entry);
            streamers[entry[2]].negative.push(entry);
            categories[entry[1]].positive.push(entry);
            categories[entry[3]].negative.push(entry);
        });

        const stats: SamplerStats = {
            streamers: {},
            categories: {},
        };

        Object.entries(streamers).forEach(([id, { positive, negative }]) => {
            stats.streamers[id] = {
                all: (positive.length + negative.length) / data.length,
                positive: positive.length / data.length,
            };
        });

        Object.entries(categories).forEach(([id, { positive, negative }]) => {
            stats.categories[id] = {
                all: (positive.length + negative.length) / data.length,
                positive: positive.length / data.length,
            };
        });

        return stats;
    }

    static getNetScores(
        type: "streamers" | "categories",
        stats: SamplerStats,
        currentStats: SamplerStats,
        mode: "all" | "positive" = "all"
    ) {
        return Object.entries(currentStats[type])
            .map(([id, entityStats]) => {
                const currentScore = entityStats[mode];
                const targetScore = stats[type][id][mode];
                const netScore = targetScore - currentScore;

                return { id, score: netScore };
            })
            .sort((a, b) => b.score - a.score);
    }

    static buildRepresentativeSample(
        data: number[][],
        size: number,
        seed: number
    ) {
        const uniqueStreamers = Array.from(
            new Set(data.map((entry) => [entry[0], entry[2]]).flat())
        ).sort();
        const uniqueCategories = Array.from(
            new Set(data.map((entry) => [entry[1], entry[3]]).flat())
        ).sort();

        const stats = this.calculateStats(
            data,
            uniqueStreamers,
            uniqueCategories
        );
        const pool: number[][] = Util.shuffleArray(
            JSON.parse(JSON.stringify(data)),
            seed
        );
        const sample: number[][] = [];

        const searchKeys = {
            positive: {
                streamers: 0,
                categories: 1,
            },
            negative: {
                streamers: 2,
                categories: 3,
            },
        };

        for (let i = 0; i < size; i += 1) {
            const currentStats = this.calculateStats(
                sample,
                uniqueStreamers,
                uniqueCategories
            );

            const streamScores = this.getNetScores(
                "streamers",
                stats,
                currentStats
            );
            const catScores = this.getNetScores(
                "categories",
                stats,
                currentStats
            );

            const pickType =
                streamScores[0].score > catScores[0].score
                    ? "streamers"
                    : "categories";
            const id = Number(
                streamScores[0].score > catScores[0].score
                    ? streamScores[0].id
                    : catScores[0].id
            );

            const polarity =
                currentStats[pickType][id].positive <
                stats[pickType][id].positive
                    ? "positive"
                    : "negative";

            const searchIndex = searchKeys[polarity][pickType];

            const entryIdx = pool.findIndex(
                (entry) => entry[searchIndex] === id
            );
            const entry = pool.splice(entryIdx, 1)[0];
            sample.push(entry);

            // if (sample.length % 100 === 0) {
            //     console.log(`${sample.length} of ${size}...`);
            // }
        }

        // Calculate the MSE
        // const currentStats = this.calculateStats(
        //     sample,
        //     uniqueStreamers,
        //     uniqueCategories
        // );

        // const squares = [
        //     ...this.getNetScores("streamers", stats, currentStats),
        //     ...this.getNetScores("categories", stats, currentStats),
        //     ...this.getNetScores("streamers", stats, currentStats, "positive"),
        //     ...this.getNetScores("categories", stats, currentStats, "positive"),
        // ].map((entry) => entry.score ** 2);
        // const mse = squares.reduce((sum, a) => sum + a, 0);

        // console.log(`MSE: ${mse}`);

        return [sample, pool];
    }

    static async getWatchData({
        trainingPercent,
        maxTrainingSize,
        seed,
    }: PreprocessOptions): Promise<{
        data: {
            training: LtrData;
            testing: LtrData;
        };
        encoding: EncodingKeys;
    }> {
        const samples = await WatchDataService.getData();

        // Create pairs
        const pairs: [number, number, number][] = [];
        const streams = [];

        samples.forEach((sample) => {
            const watched = sample.followedStreams.filter(
                (stream) => sample.watched[stream.user_id]
            );
            const nonwatched = sample.followedStreams.filter(
                (stream) => !sample.watched[stream.user_id]
            );

            watched.forEach((stream1) => {
                const index1 =
                    sample.followedStreams.findIndex((s) => s === stream1) +
                    streams.length;

                nonwatched.forEach((stream2) => {
                    const index2 =
                        sample.followedStreams.findIndex((s) => s === stream2) +
                        streams.length;

                    pairs.push([index1, index2, 1]);
                    pairs.push([index2, index1, 0]);
                });
            });

            streams.push(...sample.followedStreams);
        });

        const deduped = OracleCurator.deduplicate(pairs);

        const { encoding, data: encodedStreams } =
            MachineLearningEncoder.encodeDataset(
                streams,
                LtrPreprocessor.encodingInstructions
            );

        const encodedValues = encodedStreams.map((stream) =>
            Object.values(stream)
        );

        const encodedPairs = deduped.map((entry) =>
            [encodedValues[entry[0]], encodedValues[entry[1]], entry[2]].flat()
        );

        const trainingLimit = Math.min(
            maxTrainingSize ?? Number.MAX_SAFE_INTEGER,
            (trainingPercent ??
                CONSTANTS.HEURISTICS.JUICY_PEAR.TRAINING_PERCENT) *
                encodedPairs.length,
            encodedPairs.length
        );

        let training = [];
        let testing = [];

        if (trainingLimit < encodedPairs.length) {
            if (CONSTANTS.HEURISTICS.JUICY_PEAR.RANDOM_SAMPLE) {
                const shuffled = Util.shuffleArray(encodedPairs, seed);
                training = shuffled.slice(0, trainingLimit);
                testing = shuffled.slice(trainingLimit);
            } else {
                [training, testing] = LtrPreprocessor.buildRepresentativeSample(
                    encodedPairs,
                    trainingLimit,
                    seed
                );
            }
        } else {
            training = Util.shuffleArray(encodedPairs, seed);
            testing = [];
        }

        return {
            data: {
                training: LtrPreprocessor.composeDataset(training),
                testing: LtrPreprocessor.composeDataset(testing),
            },
            encoding,
        };
    }

    static encodeWatchSample(
        streams: WatchStream[],
        encoding: EncodingKeys,
        meanInputs: EncodingMeanInputs
    ): number[][] {
        const encoded = streams.map((stream) =>
            Object.values(
                MachineLearningEncoder.encodeEntry(stream, encoding, meanInputs)
            )
        );

        // Create pairs
        const pairs = [];

        // Pairs build process must NOT be changed independently of PairwiseLTR.scoreAndSortStreams
        encoded.forEach((stream1, index1) =>
            encoded.forEach((stream2, index2) => {
                if (index1 < index2) {
                    pairs.push([...stream1, ...stream2]);
                }
            })
        );

        return pairs;
    }
}
