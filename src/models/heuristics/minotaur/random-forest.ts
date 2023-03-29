import * as _ from "lodash";
import { RandomForestRegression } from "ml-random-forest";
import Browser from "webextension-polyfill";
import { MessageService, MessageType } from "../../messaging";

interface RandomForestOptions {
    numEstimators: number;
    maxDepth?: number;
    minNumSamples?: number;
    maxFeatures?: number;
    inputFeatures: string[];
    outputFeature: string;

    /** use replacement over the sample features. */
    // replacement: boolean;
    /** use bagging over training samples. */
    // useSampleBagging: boolean;
    /** Don't calculate Out-Of-Bag predictions. Improves performance if set to true. */
    // noOOB: boolean;
    /** the way to calculate the prediction from estimators, "mean" and "median" are supported. */
    // selectionMethod?: "mean" | "median";
}

export class RandomForest {
    model: RandomForestRegression;

    loading: Promise<void>;

    constructor(
        private options: RandomForestOptions,
        private dataset?: Record<string, number>[],
        json?: any
    ) {
        if (json) {
            this.model = RandomForestRegression.load(json);
        } else {
            this.loading = this.createModel().catch((error) =>
                console.error(error)
            );
        }
    }

    private formatDataset() {
        const x: number[][] = [];
        const y: number[] = [];

        this.dataset.forEach((entry) => {
            const inputValues: number[] = [];
            this.options.inputFeatures.forEach((feature) => {
                inputValues.push(entry[feature]);
            });

            x.push(inputValues);
            y.push(entry[this.options.outputFeature]);
        });

        return { x, y };
    }

    async createModel(): Promise<void> {
        const { numEstimators, maxDepth, minNumSamples, maxFeatures } =
            this.options;

        // console.log("Building Random Forest...");

        const { x, y } = this.formatDataset();

        const options = {
            nEstimators: numEstimators,
            maxFeatures,
            treeOptions: {
                minNumSamples,
                maxDepth,
            },
        };

        // const modelJson = await MessageService.send(
        //     MessageType.TRAIN_MINOTAUR,
        //     {
        //         options,
        //         x,
        //         y,
        //     }
        // );

        // this.model = RandomForestRegression.load(modelJson);

        this.model = new RandomForestRegression(options);
        // console.log(x, y);
        this.model.train(x, y);

        // console.log("Random Forest complete. LMAO");
    }

    predict(dataset: Record<string, number>[]): number[] {
        const input: number[][] = dataset.map((entry) => {
            const inputValues: number[] = [];
            this.options.inputFeatures.forEach((feature) => {
                inputValues.push(entry[feature]);
            });
            return inputValues;
        });

        return this.model.predict(input);
    }

    async waitForModel() {
        return this.loading;
    }
}
