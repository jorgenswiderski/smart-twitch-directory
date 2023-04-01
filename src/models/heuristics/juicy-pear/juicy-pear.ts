import * as tf from "@tensorflow/tfjs";
import moment from "moment";
import Browser from "webextension-polyfill";

import {
    EncodingInstruction,
    EncodingKeys,
    EncodingMeanInputs,
} from "../../ml-encoder/ml-encoder";
import { WatchStream } from "../../watch-data/watch-data";
import { WatchStreamScored } from "../types";
import { subtractLayer } from "./subtract-layer";
import { Util } from "../../util";
import { LtrInputType, LtrPreprocessor } from "./preprocessor";

export interface LtrModelStats {
    loss: number;
    options: LtrHyperOptions;
    datasetSize: {
        total: number;
        training: number;
    };
    time: number;
}

export interface LtrModelInfo extends LtrModelStats {
    model: {
        model: any;
        encoding: EncodingKeys;
    };
}

type ActivationIdentifier =
    | "elu"
    | "hardSigmoid"
    | "linear"
    | "relu"
    | "relu6"
    | "selu"
    | "sigmoid"
    | "softmax"
    | "softplus"
    | "softsign"
    | "tanh"
    | "swish"
    | "mish";

interface LtrOptions {
    autoSave?: boolean;
    forceSave?: boolean;
}

interface LtrHyperOptions {
    hiddenLayerSizes?: number[];
    outputSize?: number;
    hiddenActivation?: ActivationIdentifier;
    outputActivation?: ActivationIdentifier;
    learningRate?: number;
    epochs?: number;
    batchSize?: number;
    maxTrainingSize?: number;
    embeddingLayerDimension?: (numCategories: number) => number;
    loss?: string | string[];
    metrics?: string | string[];
    earlyStopping?: boolean;
    minDelta?: number;
    patience?: number;
}

export class PairwiseLtr {
    model: tf.LayersModel;

    static modelName = "juicy-pear";

    static inputType: LtrInputType = "pairs";

    hyperOptions: LtrHyperOptions;

    datasetSize: {
        training?: number;
        total?: number;
    } = {};

    constructor(
        public encoding: EncodingKeys,
        hyperOptions: LtrHyperOptions = {},
        public options: LtrOptions = {}
    ) {
        this.hyperOptions = {
            hiddenLayerSizes: [16],
            outputSize: 1,
            hiddenActivation: "relu",
            outputActivation: "sigmoid",
            learningRate: 0.001,
            epochs: 10,
            batchSize: 4,
            embeddingLayerDimension: (numCategories: number) =>
                Math.ceil(Math.sqrt(numCategories)),
            loss: "binaryCrossentropy",
            metrics: ["accuracy"],
            earlyStopping: true,
            minDelta: 0.001,
            patience: 3,
            ...hyperOptions,
        };
    }

    get static() {
        return this.constructor as typeof PairwiseLtr;
    }

    createEmbeddingLayer(numCategories: number, layerName: string) {
        const embeddingDimension =
            this.hyperOptions.embeddingLayerDimension(numCategories);

        const embeddingLayer = tf.layers.embedding({
            inputDim: numCategories,
            outputDim: embeddingDimension,
            name: layerName,
        });

        return embeddingLayer;
    }

    createModel() {
        const {
            learningRate,
            hiddenActivation,
            outputActivation,
            hiddenLayerSizes,
            loss,
            metrics,
            outputSize,
        } = this.hyperOptions;

        // Create embedding layers
        const userEmbeddingLayer = this.createEmbeddingLayer(
            (this.encoding as any).user_id.categories.length,
            "user_id"
        );
        const gameEmbeddingLayer = this.createEmbeddingLayer(
            (this.encoding as any).game_id.categories.length,
            "game_id"
        );

        // Create input layers
        const inputs = [
            "user1Input",
            "game1Input",
            "user2Input",
            "game2Input",
        ].map((name) =>
            tf.input({
                shape: [1],
                dtype: "int32",
                name,
            })
        );

        // Apply embedding layers
        const embedded = inputs.map((input, idx) =>
            idx % 2 === 0
                ? userEmbeddingLayer.apply(input)
                : gameEmbeddingLayer.apply(input)
        ) as tf.SymbolicTensor[];

        // Concatenate and flatten features
        const flattened = [
            tf.layers.concatenate().apply([embedded[0], embedded[1]]),
            tf.layers.concatenate().apply([embedded[2], embedded[3]]),
        ].map((tensor) => tf.layers.flatten().apply(tensor));

        // Create hidden layers
        const hiddenLayers = hiddenLayerSizes.map((units) =>
            tf.layers.dense({
                units,
                activation: hiddenActivation,
            })
        );

        // Apply dense layers
        let [stream1Dense, stream2Dense] = flattened as tf.SymbolicTensor[];
        hiddenLayers.forEach((hiddenLayer) => {
            stream1Dense = hiddenLayer.apply(stream1Dense) as tf.SymbolicTensor;
            stream2Dense = hiddenLayer.apply(stream2Dense) as tf.SymbolicTensor;
        });

        // Compute difference using custom layer
        // Custom layer is required to subtract SymbolicTensors, since lambda layers aren't supported in Tensorflow.js API
        const subtracted = subtractLayer().apply([stream1Dense, stream2Dense]);

        // Create output layer
        const output = tf.layers
            .dense({
                units: outputSize,
                activation: outputActivation,
            })
            .apply(subtracted) as tf.SymbolicTensor;

        // Create and compile the model
        this.model = tf.model({
            inputs,
            outputs: output,
        });

        this.model.compile({
            optimizer: tf.train.adam(learningRate),
            loss,
            metrics,
        });
    }

    createEarlyStoppingCallback() {
        const { minDelta, patience } = this.hyperOptions;

        const earlyStoppingCallback = {
            bestValLoss: Number.MAX_VALUE,
            wait: 0,
            onEpochEnd: (epoch: number, logs) => {
                if (logs.loss < earlyStoppingCallback.bestValLoss - minDelta) {
                    earlyStoppingCallback.bestValLoss = logs.loss;
                    earlyStoppingCallback.wait = 0;
                } else {
                    earlyStoppingCallback.wait += 1;
                    if (earlyStoppingCallback.wait >= patience) {
                        this.model.stopTraining = true;
                        console.log(
                            `Training stopped early after ${epoch + 1} epochs.`
                        );
                    }
                }
            },
        };

        return earlyStoppingCallback;
    }

    async train(x: number[][], y: number[][]) {
        // Save the training set size, so we can capture it later if we save the model
        this.datasetSize.training = x.length;

        const { epochs, batchSize, earlyStopping } = this.hyperOptions;
        const dataTensors = this.static.convertDatasetToTensors(x);
        const labelsTensor = tf.tensor2d(y);
        const callbacks = [];

        if (earlyStopping) {
            callbacks.push(this.createEarlyStoppingCallback());
        }

        await this.model.fit(dataTensors, labelsTensor, {
            epochs,
            batchSize,
            callbacks,
        });
    }

    predict(x: number[][]): tf.Tensor {
        const inputTensors = this.static.convertDatasetToTensors(x);
        return this.model.predict(inputTensors) as tf.Tensor;
    }

    async autoSave(results: { loss: number; metric: number }) {
        const { autoSave, forceSave } = this.options;

        if (autoSave || forceSave) {
            const stats = await this.static.getSavedModelStats();

            if (forceSave || !stats || results.loss < (stats?.loss ?? 100)) {
                await this.saveModel(results.loss);
                console.log(
                    `Saved ${this.static.modelName} model to local storage.`
                );
            }
        }
    }

    async evaluate(x: number[][], y: number[][]) {
        const testTensors = this.static.convertDatasetToTensors(x);
        const labelsTensor = tf.tensor2d(y);

        const [loss, metric] = this.model.evaluate(
            testTensors,
            labelsTensor
        ) as tf.Tensor[];

        const results = {
            loss: loss.dataSync()[0],
            metric: metric.dataSync()[0],
        };

        await this.autoSave(results);

        return results;
    }

    async toJSON() {
        const savedModel: any = await this.model.save(
            tf.io.withSaveHandler(async (artifacts) => ({
                modelArtifactsInfo: {
                    dateSaved: new Date(),
                    modelTopologyType: "JSON",
                },
                modelArtifacts: artifacts,
            }))
        );

        return {
            model: savedModel.modelArtifacts,
            encoding: this.encoding,
        };
    }

    static async fromJSON({
        model,
        encoding,
        hyperOptions,
    }: {
        model: tf.io.ModelArtifacts;
        encoding: EncodingKeys;
        hyperOptions: LtrHyperOptions;
    }): Promise<PairwiseLtr> {
        const ltr = new this(encoding, hyperOptions);
        ltr.model = await tf.loadLayersModel(tf.io.fromMemory(model));

        return ltr;
    }

    static async getStorage() {
        const data = await Browser.storage.local.get(this.modelName);

        return data[this.modelName];
    }

    // FIXME
    static async getSavedModelStats(): Promise<LtrModelStats | null> {
        try {
            // FIXME: throws on undefined
            const { loss, options, datasetSize, time } =
                await this.getStorage();

            return { loss, options, datasetSize, time };
        } catch (err) {
            console.log(err);
        }
    }

    // FIXME
    static async getSavedModelInfo(): Promise<LtrModelInfo | null> {
        try {
            // FIXME: throws on undefined
            const { loss, options, datasetSize, time, model } =
                await this.getStorage();

            return { loss, options, datasetSize, time, model };
        } catch (err) {
            console.log(err);
        }
    }

    async saveModel(loss: number) {
        return Browser.storage.local.set({
            [this.static.modelName]: {
                model: await this.toJSON(),
                loss,
                hyperOptions: {
                    ...this.hyperOptions,
                    embeddingLayerDimension:
                        this.hyperOptions.embeddingLayerDimension.toString(),
                },
                datasetSize: this.datasetSize,
                time: Date.now(),
            },
        });
    }

    // FIXME
    static async loadModel(): Promise<PairwiseLtr | null> {
        try {
            // FIXME: throws on undefined
            const { model, loss, hyperOptions, datasetSize } =
                await this.getStorage();

            console.log(`Loading ${this.modelName} from local storage...`, {
                datasetSize,
                loss: Number(loss.toFixed(4)),
                hyperOptions,
            });

            return await this.fromJSON(model);
        } catch (err) {
            console.log(err);
        }
    }

    static convertDatasetToTensors(dataset: number[][]): tf.Tensor[] {
        return Util.transpose(dataset).map((values) =>
            tf.tensor1d(values, "int32")
        );
    }

    getEmbeddingMeanInput(name: string): number {
        // Access the embedding layer
        const embeddingLayer = this.model.getLayer(name);

        // Get the layer's weights (embeddings)
        const embeddings = embeddingLayer.getWeights()[0];

        // Compute the mean embedding
        const meanTensor = tf.mean(embeddings, 0);

        // Convert to number
        return meanTensor.dataSync()[0];
    }

    getEmbeddingMeanInputs() {
        const meanInputs: EncodingMeanInputs = {};

        Object.entries(this.encoding).forEach(([key, instruction]) => {
            if (
                instruction.encodingType === EncodingInstruction.CATEGORY_INDEX
            ) {
                meanInputs[key] = this.getEmbeddingMeanInput(key);
            }
        });

        return meanInputs;
    }

    scoreAndSortStreams(streams: WatchStream[]): WatchStreamScored[] {
        // Prepare inputs
        const meanInputs = this.getEmbeddingMeanInputs();
        const x = LtrPreprocessor.encodeWatchSample(
            streams,
            this.encoding,
            meanInputs
        );

        const predictions = Array.from(this.predict(x).dataSync());

        const scores = [];

        // Pairs build process must NOT be changed independently of LtrPreprocessor.encodeWatchSample
        streams.forEach((stream1, index1) =>
            streams.forEach((stream2, index2) => {
                if (index1 < index2) {
                    const prediction = predictions.shift();
                    scores[index1] = (scores[index1] ?? 0) + prediction;
                    scores[index2] = (scores[index2] ?? 0) + (1 - prediction);
                }
            })
        );

        return streams
            .map((stream, index) => ({
                ...stream,
                score: scores[index] / streams.length,
            }))
            .sort((a, b) => b.score - a.score);
    }

    static async crossValidate(
        hyperOptions: LtrHyperOptions,
        options: LtrOptions = {},
        numFolds: number = 5,
        silent: boolean = false,
        seed: number = 42
    ): Promise<{ loss: number; metric: number; model: PairwiseLtr }> {
        if (!silent) {
            console.log(`Cross validating ${this.modelName}...`, {
                numFolds,
                seed,
                hyperOptions,
            });
        }

        const startTime = moment();
        const { maxTrainingSize } = hyperOptions;

        const {
            data: { training: data, testing: extraTraining },
            encoding,
        } = await LtrPreprocessor.getWatchData({
            inputType: this.inputType,
            maxTrainingSize: maxTrainingSize * (numFolds / (numFolds - 1)),
            trainingPercent: 1,
            seed,
        });

        const chunkSize = Math.floor(data.x.length / numFolds);

        let totalLoss = 0;
        let totalMetric = 0;
        let returnModel;

        for (let i = 0; i < numFolds; i += 1) {
            const testStart = i * chunkSize;
            const testEnd = testStart + chunkSize;

            const trainData = LtrPreprocessor.concat(
                LtrPreprocessor.slice(data, 0, testStart),
                LtrPreprocessor.slice(data, testEnd)
            );

            const testData = LtrPreprocessor.concat(
                LtrPreprocessor.slice(data, testStart, testEnd),
                extraTraining
            );

            if (!silent) {
                console.log(
                    `Training fold ${i} with training set of ${trainData.x.length}...`
                );
            }

            const model = new this(encoding, hyperOptions, options);
            model.createModel();
            model.datasetSize.total = data.x.length + extraTraining.x.length;

            // eslint-disable-next-line no-await-in-loop
            await model.train(trainData.x, trainData.y);

            if (!silent) {
                console.log(
                    `Testing fold ${i} with test set of ${testData.x.length}...`
                );
            }

            // eslint-disable-next-line no-await-in-loop
            const { loss, metric } = await model.evaluate(
                testData.x,
                testData.y
            );

            if (!silent) {
                console.log(`Fold ${i} results: loss=${loss.toFixed(4)}`);
            }

            totalLoss += loss;
            totalMetric += metric;
            returnModel = model;
        }

        const averageLoss = totalLoss / numFolds;
        const averageMetric = totalMetric / numFolds;

        if (!silent) {
            console.log(`Cross-validation results (over ${numFolds} folds):`);
            console.log("Average loss:", averageLoss);
            console.log("Average metric:", averageMetric);

            console.log(
                `Cross validation completed in ${moment().diff(
                    startTime,
                    "seconds"
                )} seconds.`
            );
        }

        return {
            loss: averageLoss,
            metric: averageMetric,
            model: returnModel,
        };
    }

    static async newModel(
        hyperOptions: LtrHyperOptions,
        options: LtrOptions = {}
    ): Promise<PairwiseLtr> {
        const startTime = moment();
        const { maxTrainingSize } = hyperOptions;

        const {
            data: { training, testing },
            encoding,
        } = await LtrPreprocessor.getWatchData({
            inputType: this.inputType,
            maxTrainingSize,
        });

        const model = new this(encoding, hyperOptions, options);
        model.createModel();
        model.datasetSize.total = training.x.length + testing.x.length;

        console.log(
            `Training ${this.modelName} with options=${JSON.stringify(
                hyperOptions
            )}...`
        );

        await model.train(training.x, training.y);
        const results = await model.evaluate(testing.x, testing.y);

        console.log(results);

        console.log(
            `${this.modelName} training completed in ${moment().diff(
                startTime,
                "seconds"
            )} seconds.`
        );

        return model;
    }

    static async hypertune(
        baseHyperOptions: LtrHyperOptions,
        options: LtrOptions = {},
        iterations: number = 1000
    ) {
        console.log(`Starting ${this.modelName} hyperparameter tuning...`);

        const searchSpace = {
            hiddenLayerSizes: [
                [8],
                [12],
                [16],
                [20],
                [24],
                [28],
                [32],
                [40],
                [48],
                [56],
                [64],
                [8, 4],
                [12, 6],
                [16, 8],
                [20, 10],
                [24, 12],
                [28, 14],
                [32, 16],
                [40, 20],
                [48, 24],
                [56, 28],
                [64, 32],
            ],
            hiddenActivation: [
                "relu",
                "elu",
                "tanh",
                "sigmoid",
                "swish",
                "mish",
            ],
            outputActivation: ["linear", "softmax", "sigmoid", "hardSigmoid"],
            learningRate: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.2],
            batchSize: [1, 2, 4, 8, 16, 32, 64],
            // embeddingLayerDimension: (numCategories: number) =>
            //     Math.ceil(Math.sqrt(numCategories)),
        };

        const choose = (arr) => arr[Math.floor(arr.length * Math.random())];
        const mutate = (ho: LtrHyperOptions) => {
            let hyperOptions = { ...ho };

            // Mutate a random key
            let thresh = 1.0;

            while (Math.random() < thresh) {
                thresh /= 3;
                const key = choose(Object.keys(hyperOptions));
                const value = choose(searchSpace[key]);

                console.log(`Mutating ${key} to ${value}`);
                hyperOptions = {
                    ...hyperOptions,
                    [key]: value,
                };
            }

            return hyperOptions;
        };

        let bestLoss = 0.69;
        let bestOptions: LtrHyperOptions = {};
        const tried = {};

        // initialize options
        Object.entries(searchSpace).forEach(([key, choices]) => {
            bestOptions[key] = choose(choices);
        });

        for (let i = 0; i < iterations; i += 1) {
            let hyperOptions: LtrHyperOptions;

            while (!hyperOptions) {
                const candidate = mutate(bestOptions);

                if (!tried[JSON.stringify(candidate)]) {
                    hyperOptions = candidate;
                }
            }

            // eslint-disable-next-line no-await-in-loop
            const { loss, model } = await PairwiseLtr.crossValidate(
                {
                    ...baseHyperOptions,
                    ...hyperOptions,
                },
                options
            );

            tried[JSON.stringify(hyperOptions)] = true;

            if (loss < bestLoss) {
                bestLoss = loss;
                bestOptions = hyperOptions;
                console.log(
                    `New best loss of ${bestLoss.toFixed(4)}!`,
                    model.hyperOptions
                );
            }
        }
    }
}
