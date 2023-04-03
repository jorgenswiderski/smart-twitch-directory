import * as _ from "lodash";
import { WatchStream } from "../../watch-data/watch-data";
import { CONSTANTS } from "../../constants";
import { HeuristicService, WatchStreamScored } from "../types";
import { RandomForest } from "./random-forest";
import { StreamSagePreprocessor } from "../stream-sage/preprocess";
import { MlArrayMetrics } from "../../ml-array-metrics";
import { log } from "../../logger";

// function pad(arr: any[], len: number, fillValue: any) {
//     return arr.concat(Array(len).fill(fillValue)).slice(0, len);
// }

class CleverCoconut implements HeuristicService {
    forest: RandomForest;

    data: { training: any[]; testing: any[] } = {
        training: [],
        testing: [],
    };

    preprocessor: StreamSagePreprocessor;

    constructor() {
        this.preprocessor = new StreamSagePreprocessor();
        this.createModel().catch((err) => console.error(err));
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

        // Instantiate the Random Forest
        this.forest = new RandomForest(dataset, {
            numTrees: 200,
            outputFeatures: className,
            inputFeatures: features,
        });

        await this.forest.waitForModel();

        if (this.data.testing.length > 0) {
            this.eval();
        }
    }

    eval() {
        const accuracy = this.forest.evaluate(this.data.testing);
        log("accuracy", accuracy);

        const trueValues = this.data.testing.map((entry) => entry.watched);
        const predictedValues = this.forest.predict(this.data.testing);

        const mae = MlArrayMetrics.meanAbsoluteError(
            trueValues,
            predictedValues
        );
        const mse = MlArrayMetrics.meanSquaredError(
            trueValues,
            predictedValues
        );
        const rsq = MlArrayMetrics.rSquared(trueValues, predictedValues);

        log("Mean Absolute Error:", mae);
        log("Mean Squared Error:", mse);
        log("R-squared:", rsq);
    }

    predict(stream: WatchStream): number {
        const encoded = this.preprocessor.encodeEntry(stream);
        return this.forest.predict([encoded])[0];
    }

    scoreAndSortStreams(streams: WatchStream[]) {
        const scored: WatchStreamScored[] = streams.map((stream) => ({
            ...stream,
            score: this.predict(stream),
        }));

        return CleverCoconut.sortStreams(scored);
    }

    static sortStreams(channelData: WatchStreamScored[]): WatchStreamScored[] {
        return channelData.sort((a, b) => b.score - a.score);
    }
}

log("Loading clever-coconut.ts");

export const CleverCoconutService = new CleverCoconut();
