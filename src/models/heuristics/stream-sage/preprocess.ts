import { WatchDataService } from "../../watch-data/watch-data";
import {
    EncodingInstruction,
    EncodingKeys,
    MachineLearningEncoder,
} from "../../ml-encoder/ml-encoder";
import { WatchStream } from "../../watch-data/types";
import { error } from "../../logger";

interface SageWatchStream extends WatchStream {
    watched: boolean;
}

export class StreamSagePreprocessor {
    rawData: SageWatchStream[];

    data: Record<string, number>[];

    loading: Promise<void>;

    constructor() {
        this.loading = new Promise((resolve, reject) => {
            this.getData()
                .then(() => {
                    resolve();
                })
                .catch((err) => {
                    error(err);
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

    encoding: EncodingKeys;

    preprocess() {
        const { encoding, data } = MachineLearningEncoder.encodeDataset(
            this.rawData,
            {
                user_id: EncodingInstruction.ONE_HOT,
                game_id: EncodingInstruction.ONE_HOT,
                language: EncodingInstruction.ONE_HOT,
                title: EncodingInstruction.BAG_OF_WORDS,
                viewer_count: EncodingInstruction.NORMALIZE,
                is_mature: EncodingInstruction.BOOLEAN,
                watched: EncodingInstruction.BOOLEAN,
            }
        );

        this.encoding = encoding;
        this.data = data;
    }

    encodeEntry(stream: WatchStream): Record<string, number> {
        return MachineLearningEncoder.encodeEntry(stream, this.encoding);
    }

    async getResults() {
        await this.loading;
        this.preprocess();
        return this.data;
    }
}
