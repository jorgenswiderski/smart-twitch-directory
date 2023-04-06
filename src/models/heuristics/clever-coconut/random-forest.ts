import * as _ from "lodash";
import DecisionTree from "decision-tree";
import { log } from "../../logger";
import { Util } from "../../util";

interface RandomForestOptions {
    numTrees: number;
    // maxDepth?: number;
    // minSamplesSplit?: number;
    // numFeatures?: number;
    inputFeatures: string[];
    outputFeatures: string | string[];
}

export class RandomForest {
    private trees: DecisionTree[] = [];

    constructor(
        private dataset: Record<string, number>[],
        private options: RandomForestOptions
    ) {
        this.createModel().catch((error) => error(error));
    }

    private bootstrapDataset(): Record<string, number>[] {
        const bootstrappedDataset: Record<string, number>[] = [];

        for (let i = 0; i < this.dataset.length; i++) {
            const randomIndex = Math.floor(Math.random() * this.dataset.length);
            bootstrappedDataset.push(this.dataset[randomIndex]);
        }

        return bootstrappedDataset;
    }

    async createModel(): Promise<void> {
        const {
            numTrees,
            // maxDepth,
            // minSamplesSplit,
            // numFeatures,
            inputFeatures,
            outputFeatures,
        } = this.options;

        log("Building Random Forest model...");

        const progress = setInterval(() => {
            log(
                `${this.trees.length} / ${numTrees} complete (${Math.floor(
                    (this.trees.length / numTrees) * 100
                )}%)`
            );
        }, 10000);

        for (let i = 0; i < numTrees; i++) {
            const bootstrappedDataset = this.bootstrapDataset();

            const tree = new DecisionTree(
                bootstrappedDataset,
                outputFeatures,
                inputFeatures
            );

            this.trees.push(tree);

            // Await a timeout to avoid blocking the browser
            // eslint-disable-next-line no-await-in-loop
            await Util.yield();
        }

        clearInterval(progress);

        log("Random Forest model complete.");
    }

    predict(dataset: Record<string, number>[]): number[] {
        const treePredictions = this.trees.map((tree) =>
            dataset.map((entry) => tree.predict(entry))
        );
        const numPredictions = treePredictions[0].length;

        const predictions: number[] = [];

        for (let i = 0; i < numPredictions; i++) {
            let sum = 0;
            let count = 0;

            treePredictions.forEach((prediction) => {
                sum += prediction[i];
                count += 1;
            });

            predictions.push(sum / count);
        }

        return predictions;
    }

    evaluate(dataset: Record<string, number>[]): number {
        const evaluations = this.trees.map((tree) => tree.evaluate(dataset));

        return _(evaluations).sum() / evaluations.length;
    }

    async waitForModel() {
        return new Promise<void>((resolve, reject) => {
            setInterval(() => {
                if (this.trees.length === this.options.numTrees) {
                    resolve();
                }
            }, 500);
        });
    }
}
