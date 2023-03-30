import * as _ from "lodash";
import * as tf from "@tensorflow/tfjs";
import moment from "moment";
import Browser from "webextension-polyfill";

import {
    EncodingInstruction,
    EncodingKeys,
    MachineLearningEncoder,
} from "../../ml-encoder/ml-encoder";
import { WatchDataService, WatchStream } from "../../watch-data/watch-data";
import { WatchStreamScored } from "../types";
import { OracleCurator } from "../oracle/curator";
import { subtractLayer } from "./subtract-layer";
import { Util } from "../../util";

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
}

interface LTRHyperOptions {
    hiddenLayerSizes: number[];
    outputSize: number;
    hiddenActivation?: ActivationIdentifier;
    outputActivation?: ActivationIdentifier;
    learningRate?: number;
    training: {
        epochs: number;
        batchSize: number;
    };
    maxTrainingSize?: number;
    embeddingLayerDimension?: (numCategories: number) => number;
}

export class PairwiseLTR {
    model: tf.LayersModel;

    static encodingInstructions = {
        user_id: EncodingInstruction.CATEGORY_INDEX,
        game_id: EncodingInstruction.CATEGORY_INDEX,
        // language: EncodingInstruction.ONE_HOT,
        // FIXME: convert to embedding layer / category index
        // title: EncodingInstruction.BAG_OF_WORDS,
        // viewer_count: EncodingInstruction.NORMALIZE,
        // is_mature: EncodingInstruction.BOOLEAN,
    };

    constructor(
        public encoding: EncodingKeys,
        private hyperOptions: LTRHyperOptions = {},
        private options: LTROptions = {}
    ) {}

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
        const { learningRate, hiddenActivation, outputActivation } =
            this.hyperOptions;

        // Embedding layers for the two streams in each pair
        const userEmbeddingLayer = this.createEmbeddingLayer(
            (this.encoding as any).user_id.categories.length
        );
        const gameEmbeddingLayer = this.createEmbeddingLayer(
            (this.encoding as any).game_id.categories.length
        );

        // Input layers for the two streams in each pair
        const user1Input = tf.input({
            shape: [1],
            dtype: "int32",
            name: "user1Input",
        });
        const game1Input = tf.input({
            shape: [1],
            dtype: "int32",
            name: "game1Input",
        });
        const user2Input = tf.input({
            shape: [1],
            dtype: "int32",
            name: "user2Input",
        });
        const game2Input = tf.input({
            shape: [1],
            dtype: "int32",
            name: "game2Input",
        });

        // Apply the embedding layers to the inputs
        const user1Embedded = userEmbeddingLayer.apply(
            user1Input
        ) as tf.SymbolicTensor;
        const game1Embedded = gameEmbeddingLayer.apply(
            game1Input
        ) as tf.SymbolicTensor;
        const user2Embedded = userEmbeddingLayer.apply(
            user2Input
        ) as tf.SymbolicTensor;
        const game2Embedded = gameEmbeddingLayer.apply(
            game2Input
        ) as tf.SymbolicTensor;

        // Concatenate the embedded features for each stream
        const stream1Features = tf.layers
            .concatenate()
            .apply([user1Embedded, game1Embedded]) as tf.SymbolicTensor;
        const stream2Features = tf.layers
            .concatenate()
            .apply([user2Embedded, game2Embedded]) as tf.SymbolicTensor;

        // Flatten the concatenated features
        const stream1Flattened = tf.layers
            .flatten()
            .apply(stream1Features) as tf.SymbolicTensor;
        const stream2Flattened = tf.layers
            .flatten()
            .apply(stream2Features) as tf.SymbolicTensor;

        // Dense layers to process the concatenated features
        const denseLayer = tf.layers.dense({
            units: 16,
            activation: hiddenActivation ?? "relu",
        });
        const stream1Dense = denseLayer.apply(
            stream1Flattened
        ) as tf.SymbolicTensor;
        const stream2Dense = denseLayer.apply(
            stream2Flattened
        ) as tf.SymbolicTensor;

        // Compute the difference between the two processed streams using a custom layer
        // Custom layer is required to subtract SymbolicTensors, since lambda layers aren't supported in Tensorflow.js API
        const subtracted = subtractLayer().apply([stream1Dense, stream2Dense]);

        // Output layer to produce a single score
        const output = tf.layers
            .dense({ units: 1, activation: outputActivation ?? "sigmoid" })
            .apply(subtracted) as tf.SymbolicTensor;

        // Create the model
        this.model = tf.model({
            inputs: [user1Input, game1Input, user2Input, game2Input],
            outputs: output,
        });

        this.model.compile({
            optimizer: tf.train.adam(learningRate || 0.001),
            loss: "binaryCrossentropy",
            metrics: ["accuracy"],
        });
    }

    static convertDatasetToTensors(dataset: number[][]): tf.Tensor[] {
        return Util.transpose(dataset).map((values) =>
            tf.tensor1d(values, "int32")
        );
    }

    trainingDatasetSize: number;

    async train(dataset: number[][], labels: number[][]) {
        this.trainingDatasetSize = dataset.length;
        const { epochs, batchSize } = this.hyperOptions.training;
        const dataTensors = PairwiseLTR.convertDatasetToTensors(dataset);
        const labelsTensor = tf.tensor2d(labels);

        await this.model.fit(dataTensors, labelsTensor, {
            epochs,
            batchSize,
        });
    }

    predict(inputData: number[][]): tf.Tensor {
        const inputTensors = PairwiseLTR.convertDatasetToTensors(inputData);
        return this.model.predict(inputTensors) as tf.Tensor;
    }

    async evaluate(dataset: number[][], labels: number[][]) {
        const testTensors = PairwiseLTR.convertDatasetToTensors(dataset);
        const labelsTensor = tf.tensor2d(labels);

        const [loss, metric] = this.model.evaluate(
            testTensors,
            labelsTensor
        ) as tf.Tensor[];

        const results = {
            loss: loss.dataSync()[0],
            metric: metric.dataSync()[0],
        };

        if (this.options.autoSave) {
            const stats = await PairwiseLTR.getSavedModelStats();

            if (!stats || results.loss < (stats?.loss ?? 100)) {
                await this.saveModel(results.loss, this.trainingDatasetSize);
                console.log("Saved Juicy Pear model to local storage.");
            }
        }

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
    }: {
        model: tf.io.ModelArtifacts;
        encoding: EncodingKeys;
    }): Promise<PairwiseLTR> {
        const ltr = new PairwiseLTR(encoding);

        ltr.model = await tf.loadLayersModel(tf.io.fromMemory(model));

        return ltr;
    }

    scoreAndSortStreams(channelData: WatchStream[]): WatchStreamScored[] {
        const encoded = channelData.map((stream) =>
            Object.values(
                MachineLearningEncoder.encodeEntry(stream, this.encoding)
            )
        );

        // Create pairs
        const pairs = [];

        encoded.forEach((stream1, index1) =>
            encoded.forEach((stream2, index2) => {
                if (index1 < index2) {
                    pairs.push([...stream1, ...stream2]);
                }
            })
        );

        // Make a prediction
        const prediction = Array.from(this.predict(pairs).dataSync());

        const scores = [];

        encoded.forEach((stream1, index1) =>
            encoded.forEach((stream2, index2) => {
                if (index1 < index2) {
                    const pred = prediction.shift();
                    scores[index1] = (scores[index1] ?? 0) + pred;
                    scores[index2] = (scores[index2] ?? 0) + (1 - pred);
                }
            })
        );

        return channelData
            .map((stream, index) => ({
                ...stream,
                score: scores[index] / encoded.length,
            }))
            .sort((a, b) => b.score - a.score);
    }

    static async getSavedModelStats(): Promise<LTRModelStats | void> {
        const data = await Browser.storage.local.get("pearModel");

        if (data.pearModel) {
            const { loss, options, datasetSize, time } = data.pearModel;

            return { loss, options, datasetSize, time };
        }
    }

    async saveModel(loss: number, datasetSize: number) {
        return Browser.storage.local.set({
            pearModel: {
                model: await this.toJSON(),
                loss,
                options: this.hyperOptions,
                datasetSize,
                time: Date.now(),
            },
        });
    }

    static async loadModel(): Promise<PairwiseLTR | null> {
        const data = await Browser.storage.local.get("pearModel");

        if (!data.pearModel) {
            return null;
        }

        const { model, loss, options, datasetSize, time } = data.pearModel;

        console.log(
            `Loading Juicy Pear from local storage, with loss=${loss.toFixed(
                4
            )} options=${JSON.stringify(options)} datasetSize=${datasetSize}`
        );

        return PairwiseLTR.fromJSON(model);
    }

    static async crossValidate(
        hyperOptions: LTRHyperOptions,
        numFolds: number = 5,
        silent: boolean = false
    ) {
        const startTime = moment();

        const samples = await WatchDataService.getData();

        // Create pairs
        const pairs: [number, number, number][] = [];
        const streams = [];

        samples.forEach((sample) => {
            const watched = sample.followedStreams.filter(
                (stream) => sample.watched[stream.user_id]
            );
            const nonwatched = sample.followedStreams.filter(
                (stream) => !sample.watched[stream.user_id]
            );

            watched.forEach((stream1) => {
                const index1 =
                    sample.followedStreams.findIndex((s) => s === stream1) +
                    streams.length;

                nonwatched.forEach((stream2) => {
                    const index2 =
                        sample.followedStreams.findIndex((s) => s === stream2) +
                        streams.length;

                    pairs.push([index1, index2, 1]);
                    pairs.push([index2, index1, 0]);
                });
            });

            streams.push(...sample.followedStreams);
        });

        const deduped = OracleCurator.deduplicate(pairs);

        const { encoding, data: encodedStreams } =
            MachineLearningEncoder.encodeDataset(
                streams,
                PairwiseLTR.encodingInstructions
            );

        const encodedValues = encodedStreams.map((stream) =>
            Object.values(stream)
        );

        const encodedPairs = deduped.map((entry) =>
            [encodedValues[entry[0]], encodedValues[entry[1]], entry[2]].flat()
        );

        let data = encodedPairs;
        let extra = [];

        // Limit the size of rawData
        if (hyperOptions?.maxTrainingSize > 0) {
            const breakpoint =
                hyperOptions.maxTrainingSize * (numFolds / (numFolds - 1));
            const shuffled = _(encodedPairs).shuffle().value();
            data = shuffled.slice(0, breakpoint);
            extra = shuffled.slice(breakpoint);
        }

        const chunkSize = Math.floor(data.length / numFolds);
        const shuffledData = _.shuffle(data);

        let totalLoss = 0;
        let totalMetric = 0;

        let model: PairwiseLTR;

        for (let i = 0; i < numFolds; i += 1) {
            const testStart = i * chunkSize;
            const testEnd = testStart + chunkSize;

            const trainData = [
                ...shuffledData.slice(0, testStart),
                ...shuffledData.slice(testEnd),
            ];
            const testData = [
                ...shuffledData.slice(testStart, testEnd),
                ...extra,
            ];

            const { dataset: trainDataset, labels: trainLabels } =
                PairwiseLTR.composeDataset(trainData);
            const { dataset: testDataset, labels: testLabels } =
                PairwiseLTR.composeDataset(testData);

            if (!silent) {
                console.log(
                    `Training fold ${i} with training set of ${trainLabels.length}...`
                );
            }

            const oracle = new PairwiseLTR(encoding, {}, hyperOptions);
            oracle.createModel();

            // eslint-disable-next-line no-await-in-loop
            await oracle.train(trainDataset, trainLabels);

            if (!silent) {
                console.log(
                    `Testing fold ${i} with test set of ${testLabels.length}...`
                );
            }

            // eslint-disable-next-line no-await-in-loop
            const { loss, metric } = await oracle.evaluate(
                testDataset,
                testLabels
            );

            totalLoss += loss;
            totalMetric += metric;
            model = oracle;
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
        // return model;
    }

    static composeDataset(data: number[][]): {
        dataset: number[][];
        labels: number[][];
    } {
        return {
            dataset: data.map((e) => e.slice(0, 4)),
            labels: data.map((e) => [e[4]]),
        };
    }

    static async newModel(hyperOptions: LTRHyperOptions): Promise<PairwiseLTR> {
        console.log(
            `Training Juicy pear with options=${JSON.stringify(
                hyperOptions
            )}...`
        );

        const { maxTrainingSize } = hyperOptions;
        const samples = await WatchDataService.getData();

        // Create pairs
        const pairs: [number, number, number][] = [];
        const streams = [];

        samples.forEach((sample) => {
            const watched = sample.followedStreams.filter(
                (stream) => sample.watched[stream.user_id]
            );
            const nonwatched = sample.followedStreams.filter(
                (stream) => !sample.watched[stream.user_id]
            );

            watched.forEach((stream1) => {
                const index1 =
                    sample.followedStreams.findIndex((s) => s === stream1) +
                    streams.length;

                nonwatched.forEach((stream2) => {
                    const index2 =
                        sample.followedStreams.findIndex((s) => s === stream2) +
                        streams.length;

                    pairs.push([index1, index2, 1]);
                    pairs.push([index2, index1, 0]);
                });
            });

            streams.push(...sample.followedStreams);
        });

        const deduped = OracleCurator.deduplicate(pairs);

        const { encoding, data: encodedStreams } =
            MachineLearningEncoder.encodeDataset(
                streams,
                PairwiseLTR.encodingInstructions
            );

        const encodedValues = encodedStreams.map((stream) =>
            Object.values(stream)
        );

        const encodedPairs = deduped.map((entry) =>
            [encodedValues[entry[0]], encodedValues[entry[1]], entry[2]].flat()
        );

        let data = encodedPairs;
        let testing;

        // Limit the size of rawData
        if ((maxTrainingSize ?? 0) > 0) {
            const shuffled = _(encodedPairs).shuffle().value();
            data = shuffled.slice(0, maxTrainingSize);
            testing = shuffled.slice(maxTrainingSize);
        }

        const { dataset, labels } = PairwiseLTR.composeDataset(data);

        const model = new PairwiseLTR(encoding, {}, hyperOptions);
        model.createModel();

        await model.train(dataset, labels);

        const { dataset: dataset2, labels: labels2 } =
            PairwiseLTR.composeDataset(testing);

        const results = await model.evaluate(dataset2, labels2);

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
