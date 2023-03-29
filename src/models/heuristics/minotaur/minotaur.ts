import * as _ from "lodash";
import { WatchStream } from "../../watch-data/watch-data";
import { CONSTANTS } from "../../constants";
import { HeuristicService, WatchStreamScored } from "../types";
import { RandomForest } from "./random-forest";
import { StreamSagePreprocessor } from "../stream-sage/preprocess";
import { MlArrayMetrics } from "../../ml-array-metrics";
import Browser from "webextension-polyfill";

class Minotaur implements HeuristicService {
    forest: RandomForest;
    options: any; // FIXME

    data: { training: any[]; testing: any[] } = {
        training: [],
        testing: [],
    };

    preprocessor: StreamSagePreprocessor;

    constructor() {
        this.preprocessor = new StreamSagePreprocessor();

        // this.createModel()
        //     .then(() => {
        //         if (this.data.testing.length > 0) {
        //             const { mae, mse, rsq } = this.eval();

        //             console.log("Mean Absolute Error:", mae);
        //             console.log("Mean Squared Error:", mse);
        //             console.log("R-squared:", rsq);
        //         }
        //     })
        //     .catch((err) => console.error(err));
    }

    async prepareDataset() {
        const dataset = await this.preprocessor.getResults();
        const scrambled = _(dataset).shuffle().value();
        // const splitPoint = Math.floor(
        //     scrambled.length * CONSTANTS.HEURISTICS.STREAM_SAGE.TRAINING_PERCENT
        // );
        const splitPoint = 4000;

        this.data.training = scrambled.slice(0, splitPoint);
        this.data.testing = scrambled.slice(splitPoint);

        console.log(
            "training",
            this.data.training.length,
            "testing",
            this.data.testing.length
        );
    }

    async createModel() {
        if (this.data.training.length <= 0) {
            await this.prepareDataset();
        }

        const dataset = this.data.training;

        // Define the feature names, aka input params
        const features = Object.keys(dataset[0]).filter(
            (key) => key !== "watched"
        );

        // Define the target class, aka output param(s)
        const className = "watched";

        // console.log(features, className);

        // console.log("building forest");

        this.options = {
            numEstimators: 25,
            maxDepth: 14,
            minNumSamples: 3,
            maxFeatures: Math.ceil(features.length ** 0.5 * 10),
            // maxFeatures: features.length,
            outputFeature: className,
            inputFeatures: features,
        };

        // Instantiate the Random Forest
        this.forest = new RandomForest(this.options, dataset);

        await this.forest.waitForModel();
    }

    eval() {
        // const accuracy = this.forest.evaluate(this.data.testing);
        // console.log("accuracy", accuracy);

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

        return { mae, mse, rsq };
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

        return Minotaur.sortStreams(scored);
    }

    static sortStreams(channelData: WatchStreamScored[]): WatchStreamScored[] {
        return channelData.sort((a, b) => b.score - a.score);
    }

    static async getSavedModelScore() {
        const data = await Browser.storage.local.get("minotaurModel");

        return data?.minotaurModel?.mse ?? 100;
    }

    toJSON() {
        return {
            json: this.forest.model.toJSON(),
            encoding: this.preprocessor.encoding,
            options: this.options,
        };
    }

    static fromJSON(data: any): Minotaur {
        const model = new Minotaur();
        const { json, options, encoding } = data;
        model.forest = new RandomForest(options, null, json);
        model.preprocessor.encoding = encoding;

        return model;
    }

    static async saveModel(model: Minotaur, mse: number) {
        return Browser.storage.local.set({
            minotaurModel: {
                model: model.toJSON(),
                mse,
            },
        });
    }

    static async loadModel(): Promise<Minotaur> {
        const data = await Browser.storage.local.get("minotaurModel");

        if (data?.minotaurModel) {
            console.log("Loading Minotaur from local storage.");
            return Minotaur.fromJSON(data.minotaurModel.model);
        }

        console.log("Training Minotaur model from scratch...");

        const model = new Minotaur();
        await model.createModel();
        return model;
    }

    static async crossValidate(numFolds: number = 5) {
        console.log(
            `Starting cross validation of Minotaur model with ${numFolds} folds...`
        );

        const minotaurInstances: Minotaur[] = [];
        const maes: number[] = [];
        const mses: number[] = [];
        const rsqs: number[] = [];

        const trainingLimit = 4000;

        const preprocessor = new StreamSagePreprocessor();
        const dataset = await preprocessor.getResults();
        const scrambled = _(dataset).shuffle().value();
        const limited = scrambled.slice(
            0,
            Math.min(
                scrambled.length,
                trainingLimit / ((numFolds - 1) / numFolds)
            )
        );
        const extra = scrambled.slice(
            Math.min(
                scrambled.length,
                trainingLimit / ((numFolds - 1) / numFolds)
            )
        );
        const foldSize = Math.floor(limited.length / numFolds);

        for (let i = 0; i < numFolds; i++) {
            const testingSet = [
                ...limited.slice(i * foldSize, (i + 1) * foldSize),
                ...extra,
            ];
            const trainingSet = [
                ...limited.slice(0, i * foldSize),
                ...limited.slice((i + 1) * foldSize),
            ];

            console.log(
                `Creating fold ${i} with ${trainingSet.length} training entries and ${testingSet.length} testing entries...`
            );

            const minotaur = new Minotaur();
            minotaur.data.testing = testingSet;
            minotaur.data.training = trainingSet;

            await minotaur.createModel();
            const { mae, mse, rsq } = minotaur.eval();

            maes.push(mae);
            mses.push(mse);
            rsqs.push(rsq);

            minotaurInstances.push(minotaur);
        }

        const avgMae = maes.reduce((sum, mae) => sum + mae, 0) / numFolds;
        const avgMse = mses.reduce((sum, mse) => sum + mse, 0) / numFolds;
        const avgRsq = rsqs.reduce((sum, rsq) => sum + rsq, 0) / numFolds;

        console.log("Average Mean Absolute Error:", avgMae);
        console.log("Average Mean Squared Error:", avgMse);
        console.log("Average R-squared:", avgRsq);

        const savedMse = await Minotaur.getSavedModelScore();

        if (avgMse < savedMse) {
            minotaurInstances[0].preprocessor = preprocessor;
            await Minotaur.saveModel(minotaurInstances[0], avgMse);
            console.log("Saved model to local storage.");
        }
    }
}

console.log("Loading Minotaur.ts");

export const MinotaurService = Minotaur.loadModel();

// Minotaur.crossValidate().catch((err) => {
//     console.error(err);
// });
