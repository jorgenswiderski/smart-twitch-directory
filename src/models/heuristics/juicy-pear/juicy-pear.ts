import * as _ from "lodash";
import * as tf from "@tensorflow/tfjs";
import moment from "moment";
import Browser from "webextension-polyfill";

import {
    EncodingKeys,
    MachineLearningEncoder,
} from "../../ml-encoder/ml-encoder";
import { WatchStream } from "../../watch-data/watch-data";
import { WatchStreamScored } from "../types";
import { subtractLayer } from "./subtract-layer";
import { Util } from "../../util";
import { LtrPreprocessor } from "./preprocessor";

interface LTRModelStats {
    loss: number;
    options: LTRHyperOptions;
    datasetSize: number;
    time: number;
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

interface LTROptions {
    autoSave?: boolean;
    forceSave?: boolean;
}

interface LTRHyperOptions {
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
}

export class PairwiseLTR {
    model: tf.LayersModel;

    static modelName: "juicy-pear";

    preprocessor: LtrPreprocessor;

    constructor(
        public encoding: EncodingKeys,
        public hyperOptions: LTRHyperOptions = {},
        public options: LTROptions = {}
    ) {
        this.preprocessor = new LtrPreprocessor(this);
    }

    createEmbeddingLayer(numCategories: number) {
        const embeddingDimension = this.hyperOptions.embeddingLayerDimension
            ? this.hyperOptions.embeddingLayerDimension(numCategories)
            : Math.ceil(Math.sqrt(numCategories));

        const embeddingLayer = tf.layers.embedding({
            inputDim: numCategories,
            outputDim: embeddingDimension,
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
            (this.encoding as any).user_id.categories.length
        );
        const gameEmbeddingLayer = this.createEmbeddingLayer(
            (this.encoding as any).game_id.categories.length
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
        const hiddenLayers = (hiddenLayerSizes ?? [16]).map((units) =>
            tf.layers.dense({
                units,
                activation: hiddenActivation ?? "relu",
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
                units: outputSize ?? 1,
                activation: outputActivation ?? "sigmoid",
            })
            .apply(subtracted) as tf.SymbolicTensor;

        // Create and compile the model
        this.model = tf.model({
            inputs,
            outputs: output,
        });

        this.model.compile({
            optimizer: tf.train.adam(learningRate || 0.001),
            loss: loss || "binaryCrossentropy",
            metrics: metrics || ["accuracy"],
        });
    }

    trainingDatasetSize: number;

    async train(x: number[][], y: number[][]) {
        // Save the training set size, so we can capture it later if we save the model
        this.trainingDatasetSize = x.length;

        const { epochs, batchSize } = this.hyperOptions;
        const dataTensors = PairwiseLTR.convertDatasetToTensors(x);
        const labelsTensor = tf.tensor2d(y);

        await this.model.fit(dataTensors, labelsTensor, {
            epochs: epochs ?? 10,
            batchSize: batchSize ?? 4,
        });
    }

    predict(x: number[][]): tf.Tensor {
        const inputTensors = PairwiseLTR.convertDatasetToTensors(x);
        return this.model.predict(inputTensors) as tf.Tensor;
    }

    async autoSave(results: { loss: number; metric: number }) {
        const { autoSave, forceSave } = this.options;

        if (autoSave || forceSave) {
            const stats = await PairwiseLTR.getSavedModelStats();

            if (forceSave || !stats || results.loss < (stats?.loss ?? 100)) {
                await this.saveModel(results.loss, this.trainingDatasetSize);
                console.log("Saved Juicy Pear model to local storage.");
            }
        }
    }

    async evaluate(x: number[][], y: number[][]) {
        const testTensors = PairwiseLTR.convertDatasetToTensors(x);
        const labelsTensor = tf.tensor2d(y);

        const [loss, metric] = this.model.evaluate(
            testTensors,
            labelsTensor
        ) as tf.Tensor[];

        const results = {
            loss: loss.dataSync()[0],
            metric: metric.dataSync()[0],
        };

        this.autoSave(results);

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
        hyperOptions: LTRHyperOptions;
    }): Promise<PairwiseLTR> {
        const ltr = new PairwiseLTR(encoding, hyperOptions);
        ltr.model = await tf.loadLayersModel(tf.io.fromMemory(model));

        return ltr;
    }

    static async getStorage() {
        const data = await Browser.storage.local.get(PairwiseLTR.modelName);

        return data[PairwiseLTR.modelName];
    }

    static async getSavedModelStats(): Promise<LTRModelStats | null> {
        const { loss, options, datasetSize, time } =
            await PairwiseLTR.getStorage();

        return { loss, options, datasetSize, time };
    }

    async saveModel(loss: number, datasetSize: number) {
        return Browser.storage.local.set({
            [PairwiseLTR.modelName]: {
                model: await this.toJSON(),
                loss,
                hyperOptions: this.hyperOptions,
                datasetSize,
                time: Date.now(),
            },
        });
    }

    static async loadModel(): Promise<PairwiseLTR | null> {
        const { model, loss, hyperOptions, datasetSize } =
            await PairwiseLTR.getStorage();

        console.log(
            `Loading Juicy Pear from local storage, with loss=${loss.toFixed(
                4
            )} hOptions=${JSON.stringify(
                hyperOptions
            )} datasetSize=${datasetSize}`
        );

        return PairwiseLTR.fromJSON(model);
    }

    static convertDatasetToTensors(dataset: number[][]): tf.Tensor[] {
        return Util.transpose(dataset).map((values) =>
            tf.tensor1d(values, "int32")
        );
    }

    scoreAndSortStreams(streams: WatchStream[]): WatchStreamScored[] {
        // Prepare inputs
        const x = LtrPreprocessor.encodeWatchSample(streams, this.encoding);

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
        hyperOptions: LTRHyperOptions,
        numFolds: number = 5,
        silent: boolean = false,
        seed: number = 42
    ) {
        const startTime = moment();

        const {
            data: { training: data, testing: extraTraining },
            encoding,
        } = await LtrPreprocessor.getWatchData({
            trainingPercent: 1,
            seed,
        });

        const chunkSize = Math.floor(data.x.length / numFolds);

        let totalLoss = 0;
        let totalMetric = 0;

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

            const pear = new PairwiseLTR(encoding, hyperOptions);
            pear.createModel();

            // eslint-disable-next-line no-await-in-loop
            await pear.train(trainData.x, trainData.y);

            if (!silent) {
                console.log(
                    `Testing fold ${i} with test set of ${testData.x.length}...`
                );
            }

            // eslint-disable-next-line no-await-in-loop
            const { loss, metric } = await pear.evaluate(
                testData.x,
                testData.y
            );

            totalLoss += loss;
            totalMetric += metric;
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

        return averageLoss;
    }

    static async newModel(
        hyperOptions: LTRHyperOptions,
        options: LTROptions = {}
    ): Promise<PairwiseLTR> {
        const { maxTrainingSize } = hyperOptions;

        const {
            data: { training, testing },
            encoding,
        } = await LtrPreprocessor.getWatchData({ maxTrainingSize });

        const model = new PairwiseLTR(encoding, hyperOptions, options);
        model.createModel();

        console.log(
            `Training Juicy pear with options=${JSON.stringify(
                hyperOptions
            )}...`
        );

        await model.train(training.x, training.y);
        const results = await model.evaluate(testing.x, testing.y);

        console.log(results);

        return model;
    }
}

// export const JuicyPearService = PairwiseLTR.crossValidate({
//     hiddenLayerSizes: [32],
//     outputSize: 1,
//     training: {
//         epochs: 10,
//         batchSize: 4,
//     },
//     learningRate: 0.001,
//     maxTrainingSize: 4096,
// }).then(() => PairwiseLTR.loadModel());

// export const JuicyPearService = PairwiseLTR.newModel(
//     {
//         hiddenLayerSizes: [32],
//         outputSize: 1,
//         training: {
//             epochs: 10,
//             batchSize: 4,
//         },
//         learningRate: 0.001,
//         maxTrainingSize: 200,
//     },
// );

// {
//     hiddenLayerSizes: [64],
//     outputSize: 1,
//     training: {
//         epochs: 13,
//         batchSize: 4,
//     },
//     learningRate: 0.001,
//     maxTrainingSize: 200,
// }

// MLP.hyperparameterTuning({
//     hiddenLayerSizes: [48],
//     outputSize: 1,
//     training: {
//         epochs: 10,
//         batchSize: 16,
//     },
//     learningRate: 0.0666,
//     maxTrainingSize: 2000,
// })
//     .then((bestOptions) => {
//         console.log("Tuned hyperparameters:", bestOptions);
//     })
//     .catch((err) => {
//         console.error(err);
//     });

export const JuicyPearService = PairwiseLTR.loadModel();

// (async () => {
//     const jps = await JuicyPearService;

//     console.log(jps.encoding);

//     const input = [
//         [1, 2, 3, 4],
//         [5, 6, 7, 8],
//         [9, 10, 11, 12],
//     ];
//     const output = jps.predict(input);

//     console.log("prediction", input, output.dataSync());
// })();
