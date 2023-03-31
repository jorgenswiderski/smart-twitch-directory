import { CONSTANTS } from "../../constants";
import {
    EncodingInstruction,
    EncodingKeys,
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

        const shuffled = Util.shuffleArray(encodedPairs, seed);
        const training = shuffled.slice(0, trainingLimit);
        const testing = shuffled.slice(trainingLimit);

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
        encoding: EncodingKeys
    ): number[][] {
        const encoded = streams.map((stream) =>
            Object.values(MachineLearningEncoder.encodeEntry(stream, encoding))
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
