import * as _ from "lodash";
import DecisionTree from "decision-tree";
import { StreamSagePreprocessor } from "./preprocess";
import { WatchStream } from "../../watch-data/watch-data";
import { CONSTANTS } from "../../constants";
import { HeuristicService, WatchStreamScored } from "../types";
import { log } from "../../logger";

// function pad(arr: any[], len: number, fillValue: any) {
//     return arr.concat(Array(len).fill(fillValue)).slice(0, len);
// }

class StreamSage implements HeuristicService {
    dt: any;

    data: { training: any[]; testing: any[] } = {
        training: [],
        testing: [],
    };

    preprocessor: StreamSagePreprocessor;

    constructor() {
        this.preprocessor = new StreamSagePreprocessor();
        this.createModel().catch((err) => error(err));
    }

    async prepareDataset() {
        const dataset = await this.preprocessor.getResults();
        const scrambled = _(dataset).shuffle().value();
        const splitPoint = Math.floor(
            scrambled.length * CONSTANTS.HEURISTICS.STREAM_SAGE.TRAINING_PERCENT
        );
        this.data.training = scrambled.slice(0, splitPoint);
        this.data.testing = scrambled.slice(splitPoint);

        log(
            "training",
            this.data.training.length,
            "testing",
            this.data.testing.length
        );
    }

    async createModel() {
        await this.prepareDataset();
        const dataset = this.data.training;

        // Define the feature names, aka input params
        const features = Object.keys(dataset[0]).filter(
            (key) => key !== "watched"
        );

        // Define the target class, aka output param(s)
        const className = "watched";

        log(features, className);

        // Instantiate the decision tree model
        this.dt = new DecisionTree(dataset, className, features);

        if (this.data.testing.length > 0) {
            this.eval();
        }
    }

    eval() {
        const accuracy = this.dt.evaluate(this.data.testing);
        log("accuracy", accuracy);

        log(this.dt.toJSON());

        // log("predict", this.dt.predict(this.data.testing[0]));
    }

    predict(stream: WatchStream) {
        const encoded = this.preprocessor.encodeEntry(stream);
        return this.dt.predict(encoded);
    }

    scoreAndSortStreams(streams: WatchStream[]) {
        const scored = streams.map((stream) => ({
            ...stream,
            score: this.predict(stream),
        }));

        return StreamSage.sortStreams(scored);
    }

    static sortStreams(channelData: WatchStreamScored[]): WatchStreamScored[] {
        return channelData.sort((a, b) => b.score - a.score);
    }
}

log("Loading stream-sage.ts");

export const StreamSageService = new StreamSage();

StreamSageService.createModel().catch((err) => {
    error(err);
});
