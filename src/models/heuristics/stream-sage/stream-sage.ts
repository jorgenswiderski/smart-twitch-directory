import * as _ from "lodash";
import DecisionTree from "decision-tree";
import { StreamSagePreprocessor } from "./preprocess";
import { WatchStream } from "../../watch-data/watch-data";
import { CONSTANTS } from "../../constants";

// function pad(arr: any[], len: number, fillValue: any) {
//     return arr.concat(Array(len).fill(fillValue)).slice(0, len);
// }

class StreamSage {
    dt: any;

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

        console.log(
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

        console.log("features", features);

        // Define the target class, aka output param(s)
        const className = "watched";

        // Instantiate the decision tree model
        this.dt = new DecisionTree(dataset, className, features);

        if (this.data.testing.length > 0) {
            this.eval();
        }
    }

    eval() {
        const accuracy = this.dt.evaluate(this.data.testing);
        console.log("accuracy", accuracy);

        console.log(this.dt.toJSON());

        // console.log("predict", this.dt.predict(this.data.testing[0]));
    }

    predict(stream: WatchStream) {
        const encoded = this.preprocessor.encodeEntry(stream);
        return this.dt.predict(encoded);
    }
}

console.log("Loading stream-sage.ts");

export const StreamSageService = new StreamSage();

StreamSageService.createModel().catch((err) => {
    console.error(err);
});
