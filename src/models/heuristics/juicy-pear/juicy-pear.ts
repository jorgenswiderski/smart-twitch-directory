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
import { CONSTANTS } from "../../constants";
import { TensorModelProxy } from "../../tensor-model-loader/proxy";
import { TensorModelHost } from "../../tensor-model-loader/host";

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
    maxTrainingDuration?: number;
}

interface LtrOptions {
    autoSave?: boolean;
    forceSave?: boolean;
    yieldEvery?: number;
}

// Properties defined here become accessible via TensorModelProxy and therefore JuicyPearService
// All property values, method inputs, and method outputs must be able to be structured clone serialized!
export interface IJuicyPearService {
    encoding: EncodingKeys;
    getEmbeddingMeanInputs: () => EncodingMeanInputs;
    scoreAndSortStreams: (streams: WatchStream[]) => WatchStreamScored[];
    predictPair: (streamA: WatchStream, streamB: WatchStream) => number;
}

export class PairwiseLtr implements IJuicyPearService {
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
            hiddenLayerSizes: [8],
            outputSize: 1,
            hiddenActivation: "elu",
            outputActivation: "sigmoid",
            learningRate: 0.001,
            epochs: 12,
            batchSize: 128,
            embeddingLayerDimension: (numCategories: number) =>
                Math.ceil(Math.sqrt(numCategories)),
            loss: "binaryCrossentropy",
            metrics: ["accuracy"],
            earlyStopping: true,
            minDelta: 0.001,
            patience: 3,
            ...hyperOptions,
        };

        if (hyperOptions.earlyStopping) {
            this.addEarlyStoppingCallback();
        }
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

    trainingCallbacks = [];

    addEarlyStoppingCallback() {
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

        this.trainingCallbacks.push(earlyStoppingCallback);
    }

    async train(x: number[][], y: number[][]) {
        // Save the training set size, so we can capture it later if we save the model
        this.datasetSize.training = x.length;

        const trainingStart = Date.now();
        const { epochs, batchSize, maxTrainingDuration } = this.hyperOptions;
        const { yieldEvery } = this.options;
        let cursor = 0;
        const chunkSize =
            maxTrainingDuration > 0
                ? CONSTANTS.HEURISTICS.JUICY_PEAR
                      .INCREMENTAL_TRAINING_CHUNK_SIZE
                : Number.MAX_SAFE_INTEGER;

        while (
            cursor < x.length &&
            (!maxTrainingDuration ||
                Date.now() - trainingStart < maxTrainingDuration * 1000)
        ) {
            const slicedX = x.slice(cursor, cursor + chunkSize);
            const slicedY = y.slice(cursor, cursor + chunkSize);
            const dataTensors = this.static.convertDatasetToTensors(slicedX);
            const labelsTensor = tf.tensor2d(slicedY);

            // eslint-disable-next-line no-await-in-loop
            await this.model.fit(dataTensors, labelsTensor, {
                epochs,
                batchSize,
                callbacks: this.trainingCallbacks,
                yieldEvery,
            });

            cursor += chunkSize;
        }
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
        if (streams.length <= 1) {
            console.log(
                `${this.static.modelName} scoreAndSortStreams was passed too few streams to make pairs (${streams.length})`
            );

            return streams.map((stream) => ({
                ...stream,
                score: 0.5,
            }));
        }

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

    predictPair(streamA: WatchStream, streamB: WatchStream) {
        const x = LtrPreprocessor.encodeWatchSample(
            [streamA, streamB],
            this.encoding,
            this.getEmbeddingMeanInputs()
        );

        const prediction = this.predict(x).dataSync()[0];

        return prediction;
    }

    static async crossValidate(
        hyperOptions: LtrHyperOptions,
        options: LtrOptions = {},
        initialNumFolds: number = 5,
        silent: boolean = false,
        maxLoss: number = 1000,
        seed: number = 42
    ): Promise<{
        loss: number;
        metric: number;
        model: PairwiseLtr;
        adjustedLoss: number;
    }> {
        if (!silent) {
            console.log(`Cross validating ${this.modelName}...`, {
                numFolds: initialNumFolds,
                seed,
                hyperOptions,
            });
        }

        let trainingTime = 0;
        const { maxTrainingSize, maxTrainingDuration } = hyperOptions;

        const {
            data: { training: data, testing: extraTraining },
            encoding,
        } = await LtrPreprocessor.getWatchData({
            inputType: this.inputType,
            maxTrainingSize:
                maxTrainingSize * (initialNumFolds / (initialNumFolds - 1)),
            trainingPercent: 1,
            seed,
            maxTrainingDuration,
        });

        const chunkSize = Math.floor(data.x.length / initialNumFolds);

        let totalLoss = 0;
        let totalMetric = 0;
        let returnModel;
        let numFolds = initialNumFolds;

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

            const trainingStart = moment();
            // eslint-disable-next-line no-await-in-loop
            await model.train(trainData.x, trainData.y);
            trainingTime += moment().diff(trainingStart, "seconds", true);

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

            if (i + 1 < numFolds) {
                const estimatedTrainingDuration =
                    trainingTime * (initialNumFolds / (i + 1));
                const trainingSpeedFactor =
                    0.8106 ** Math.log2(60 / estimatedTrainingDuration);

                if (
                    loss * trainingSpeedFactor > maxLoss * 3 ||
                    totalLoss * trainingSpeedFactor > maxLoss * initialNumFolds
                ) {
                    console.log("Early stopping due to poor performance.");
                    numFolds = i + 1;
                    break;
                }
            }
        }

        const averageLoss = totalLoss / numFolds;
        const averageMetric = totalMetric / numFolds;

        // Each halving of the training time equates to 18.94% lower loss value
        const trainingDuration = trainingTime * (initialNumFolds / numFolds);
        const trainingSpeedFactor = 0.8106 ** Math.log2(60 / trainingDuration);
        const adjustedLoss = averageLoss * trainingSpeedFactor;

        if (!silent) {
            console.log(`Cross-validation results (over ${numFolds} folds):`);
            console.log("Average loss:", averageLoss);
            console.log("Adjusted loss:", adjustedLoss);

            console.log(
                `Cross validation completed in ${trainingTime.toFixed(
                    0
                )} seconds.`
            );
        }

        return {
            loss: averageLoss,
            metric: averageMetric,
            model: returnModel,
            adjustedLoss,
        };
    }

    static async newModel(
        hyperOptions: LtrHyperOptions,
        options: LtrOptions = {}
    ): Promise<{ model: PairwiseLtr; trainingTime: number }> {
        const startTime = moment();
        const { maxTrainingSize, maxTrainingDuration } = hyperOptions;

        const {
            data: { training, testing },
            encoding,
        } = await LtrPreprocessor.getWatchData({
            inputType: this.inputType,
            maxTrainingSize,
            maxTrainingDuration,
        });

        const model = new this(encoding, hyperOptions, options);
        model.createModel();
        model.datasetSize.total = training.x.length + testing.x.length;

        console.log(
            `Training ${this.modelName} with options=${JSON.stringify(
                hyperOptions
            )}...`
        );

        const trainingStart = moment();
        await model.train(training.x, training.y);
        const trainingTime = moment().diff(trainingStart, "seconds", true);

        const results = await model.evaluate(testing.x, testing.y);

        console.log(results);

        console.log(
            `${this.modelName} creation completed in ${moment().diff(
                startTime,
                "seconds"
            )} seconds (training ${trainingTime.toFixed(0)} seconds).`
        );

        return { model, trainingTime };
    }

    static async hypertune(
        baseHyperOptions: LtrHyperOptions,
        options: LtrOptions = {},
        baseTried = {},
        iterations: number = 1000
    ) {
        console.log(`Starting ${this.modelName} hyperparameter tuning...`);

        const tried = JSON.parse(JSON.stringify(baseTried));

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
            outputActivation: [
                // "linear",
                // "softmax",
                "sigmoid",
                "hardSigmoid",
            ],
            learningRate: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1],
            batchSize: [4, 8, 16, 32, 64, 128],
            epochs: [8, 12, 16, 24, 32, 48, 64],
            // embeddingLayerDimension: (numCategories: number) =>
            //     Math.ceil(Math.sqrt(numCategories)),
        };

        const choose = (arr) => arr[Math.floor(arr.length * Math.random())];
        const mutate = (ho: LtrHyperOptions, sSpace: any) => {
            let hyperOptions = { ...ho };

            // Mutate a random key
            let thresh = 1.0;

            while (Math.random() < thresh) {
                thresh /= 3;
                const key = choose(Object.keys(sSpace));
                const value = choose(sSpace[key]);

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

        for (let i = 0; i < iterations; i += 1) {
            let hyperOptions: LtrHyperOptions;

            if (i === 0) {
                hyperOptions = { ...baseHyperOptions, ...bestOptions };
            } else {
                while (!hyperOptions) {
                    const candidate = mutate(
                        { ...baseHyperOptions, ...bestOptions },
                        searchSpace
                    );

                    if (!tried[JSON.stringify(candidate)]) {
                        hyperOptions = candidate;
                    }
                }
            }

            const { adjustedLoss, model } =
                // eslint-disable-next-line no-await-in-loop
                await PairwiseLtr.crossValidate(
                    hyperOptions,
                    options,
                    undefined,
                    undefined,
                    bestLoss
                );

            tried[JSON.stringify(hyperOptions)] = true;

            if (adjustedLoss < bestLoss) {
                bestLoss = adjustedLoss;
                bestOptions = hyperOptions;

                console.log(
                    `New best adjusted loss of ${bestLoss.toFixed(4)}!`,
                    model.hyperOptions
                );
                console.log({ tried: JSON.stringify(tried) });
            } else if (i % 10 === 0) {
                console.log({ tried: JSON.stringify(tried) });
            }
        }
    }
}

export function initJuicyPearService() {
    return new TensorModelHost<typeof PairwiseLtr, PairwiseLtr>(PairwiseLtr);
}

const tmp = new TensorModelProxy<
    typeof PairwiseLtr,
    PairwiseLtr,
    IJuicyPearService
>(PairwiseLtr);

export const JuicyPearService: () => IJuicyPearService = tmp.getProxy.bind(tmp);
