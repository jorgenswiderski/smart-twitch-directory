import * as _ from "lodash";
import * as tf from "@tensorflow/tfjs";
import {
    EncodingInstruction,
    EncodingKeys,
    MachineLearningEncoder,
} from "../../ml-encoder/ml-encoder";
import {
    WatchDataService,
    WatchSample,
    WatchStream,
    WatchStreamWithLabel,
} from "../../watch-data/watch-data";
import { WatchStreamScored } from "../types";
import { CONSTANTS } from "../../constants";
import Browser from "webextension-polyfill";
import { OracleCurator } from "./curator";

export interface OracleDataset {
    user_id: number[];
    game_id: number[];
}

export interface MLPOptions {
    hiddenLayerSizes: number[];
    outputSize: number;
    activation?:
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
    learningRate?: number;
    training: {
        epochs: number;
        batchSize: number;
    };
    maxTrainingSize?: number;
    embeddingLayerDimension?: (numCategories: number) => number;
}

export class MLP {
    model: tf.LayersModel;

    static encodingInstructions = {
        user_id: EncodingInstruction.CATEGORY_INDEX,
        game_id: EncodingInstruction.CATEGORY_INDEX,
        // language: EncodingInstruction.ONE_HOT,
        // FIXME: convert to embedding layer / category index
        // title: EncodingInstruction.BAG_OF_WORDS,
        // viewer_count: EncodingInstruction.NORMALIZE,
        // is_mature: EncodingInstruction.BOOLEAN,
        watched: EncodingInstruction.BOOLEAN,
    };

    constructor(private encoding: EncodingKeys) {}

    createEmbeddingLayer(numCategories: number) {
        const embeddingDimension = this.options.embeddingLayerDimension
            ? this.options.embeddingLayerDimension(numCategories)
            : Math.ceil(Math.sqrt(numCategories));

        const embeddingLayer = tf.layers.embedding({
            inputDim: numCategories,
            outputDim: embeddingDimension,
        });

        return embeddingLayer;
    }

    options: MLPOptions;

    createModel(options: MLPOptions) {
        this.options = options;

        const { hiddenLayerSizes, outputSize, activation, learningRate } =
            options;

        // TODO: Dynamically create embedding layers from encoding
        const userEmbeddingLayer = this.createEmbeddingLayer(
            (this.encoding as any).user_id.categories.length
        );
        const gameEmbeddingLayer = this.createEmbeddingLayer(
            (this.encoding as any).game_id.categories.length
        );

        const hiddenLayers = hiddenLayerSizes.map((size) =>
            tf.layers.dense({ units: size, activation: activation || "relu" })
        );
        const outputLayer = tf.layers.dense({
            units: outputSize,
            activation: "sigmoid",
        });

        const inputUser = tf.input({
            shape: [1],
            name: "userInput",
            dtype: "int32",
        });
        const inputGame = tf.input({
            shape: [1],
            name: "gameInput",
            dtype: "int32",
        });

        const userEmbedded = userEmbeddingLayer.apply(
            inputUser
        ) as tf.SymbolicTensor;
        const gameEmbedded = gameEmbeddingLayer.apply(
            inputGame
        ) as tf.SymbolicTensor;

        const concatenated = tf.layers
            .concatenate()
            .apply([userEmbedded, gameEmbedded]) as tf.SymbolicTensor;
        const flattened = tf.layers
            .flatten()
            .apply(concatenated) as tf.SymbolicTensor;

        const hidden = hiddenLayers.reduce(
            (input, layer) => layer.apply(input) as tf.SymbolicTensor,
            flattened
        );
        const output = outputLayer.apply(hidden) as tf.SymbolicTensor;

        this.model = tf.model({
            inputs: [inputUser, inputGame],
            outputs: output,
        });

        this.model.compile({
            optimizer: tf.train.adam(learningRate || 0.001),
            loss: "meanSquaredError",
            metrics: ["accuracy"],
        });
    }

    static convertDatasetToTensors(dataset: OracleDataset): tf.Tensor[] {
        return Object.values(dataset)
            .map((values) => tf.tensor1d(values, "int32"))
            .slice(0, 2);
    }

    async train(dataset: OracleDataset, labels: number[][]) {
        const { epochs, batchSize } = this.options.training;
        const dataTensors = MLP.convertDatasetToTensors(dataset);
        const labelsTensor = tf.tensor2d(labels);

        // console.log("Training Oracle model...");

        await this.model.fit(dataTensors, labelsTensor, {
            epochs,
            batchSize,
        });

        // console.log("Training Oracle model complete.");
    }

    predict(inputData: OracleDataset): tf.Tensor {
        const inputTensors = MLP.convertDatasetToTensors(inputData);
        return this.model.predict(inputTensors) as tf.Tensor;
    }

    evaluate(dataset: OracleDataset, labels: number[][]) {
        const testTensors = MLP.convertDatasetToTensors(dataset);
        const labelsTensor = tf.tensor2d(labels);

        const [loss, metric] = this.model.evaluate(
            testTensors,
            labelsTensor
        ) as tf.Tensor[];

        return {
            loss: loss.dataSync()[0],
            metric: metric.dataSync()[0],
        };
    }

    toJSON() {
        return { model: this.model.toJSON(), encoding: this.encoding };
    }

    static async fromJSON({
        model,
        encoding,
    }: {
        model: string;
        encoding: EncodingKeys;
    }): Promise<MLP> {
        const mlp = new MLP(encoding);
        mlp.model = await tf.loadLayersModel(
            tf.io.fromMemory(JSON.parse(model))
        );

        return mlp;
    }

    static composeDataset(
        data: { user_id: number; game_id: number; watched: number }[]
    ): { dataset: OracleDataset; labels: number[][] } {
        return {
            dataset: {
                user_id: data.map((entry) => entry.user_id),
                game_id: data.map((entry) => entry.game_id),
            },
            labels: data.map((entry) => [entry.watched]),
        };
    }

    scoreAndSortStreams(channelData: WatchStream[]): WatchStreamScored[] {
        const encoded = channelData.map((stream) =>
            MachineLearningEncoder.encodeEntry(stream, this.encoding)
        );

        const { dataset } = MLP.composeDataset(encoded as any);
        const tensors = MLP.convertDatasetToTensors(dataset);

        // console.log(encoded.map((stream) => stream.user_id));
        // console.log(encoded.map((stream) => stream.game_id));

        // Make a prediction
        const prediction = (
            this.model.predict(tensors) as tf.Tensor
        ).dataSync();

        console.log(prediction);

        return channelData
            .map((stream, index) => ({
                ...stream,
                score: prediction[index],
            }))
            .sort((a, b) => b.score - a.score);
    }

    static async getSavedModelStats() {
        const data = await Browser.storage.local.get("oracleModel");
        const { mse, options, datasetSize, time } = data.oracleModel;

        return { mse, options, datasetSize, time };
    }

    async saveModel(mse: number, options: MLPOptions, datasetSize: number) {
        return Browser.storage.local.set({
            oracleModel: {
                model: this.toJSON(),
                mse,
                options,
                datasetSize,
                time: Date.now(),
            },
        });
    }

    static async loadModel(): Promise<MLP> {
        const data = await Browser.storage.local.get("oracleModel");

        const { model, mse, options, datasetSize, time } = data.oracleModel;

        console.log(
            `Loading Oracle from local storage, with mse=${mse} options=${JSON.stringify(
                options
            )} datasetSize=${datasetSize}`
        );

        return MLP.fromJSON(model);
    }

    static async crossValidate(
        options: MLPOptions,
        numFolds: number = 5,
        silent: boolean = false
    ) {
        const samples = await WatchDataService.getData();
        let rawData: WatchStreamWithLabel[] = samples
            .map((sample) =>
                sample.followedStreams.map((stream) => ({
                    ...stream,
                    watched: sample.watched[stream.user_id] ?? false,
                }))
            )
            .flat();

        rawData = OracleCurator.deduplicate(rawData);

        let extra = [];

        // Limit the size of rawData
        if (options?.maxTrainingSize > 0) {
            [rawData, extra] = OracleCurator.sample(
                rawData,
                options.maxTrainingSize * (numFolds / (numFolds - 1)),
                42
            );
        }

        const { encoding, data } = MachineLearningEncoder.encodeDataset(
            rawData,
            MLP.encodingInstructions
        );

        const chunkSize = Math.floor(data.length / numFolds);
        const shuffledData = _.shuffle(data);

        let totalLoss = 0;
        let totalMetric = 0;

        let model: MLP;

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
                MLP.composeDataset(trainData as any);
            const { dataset: testDataset, labels: testLabels } =
                MLP.composeDataset(testData as any);

            if (!silent) {
                console.log(
                    `Training fold ${i} with training set of ${trainLabels.length}, test set of ${testLabels.length}...`
                );
            }

            const oracle = new MLP(encoding);
            oracle.createModel(options);

            // eslint-disable-next-line no-await-in-loop
            await oracle.train(trainDataset, trainLabels);

            const { loss, metric } = oracle.evaluate(testDataset, testLabels);

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
        }

        const stats = await MLP.getSavedModelStats();

        if (averageLoss < stats.mse /* && data.length >= stats.datasetSize */) {
            await model.saveModel(averageLoss, options, data.length);
            console.log("Saved Oracle model to local storage.");
        }

        return averageLoss;
        // return model;
    }

    static async hyperparameterTuning(
        startingOptions: MLPOptions
    ): Promise<MLPOptions> {
        // options example
        // {
        //     hiddenLayerSizes: [64],
        //     outputSize: 1,
        //     training: {
        //         epochs: 10,
        //         batchSize: 4,
        //     },
        //     learningRate: 0.001,
        //     maxTrainingSize: 500,
        // }

        let bestOptions: MLPOptions = { ...startingOptions };
        let bestLoss = Number.MAX_VALUE;

        // Define your search space and tuning strategy here
        // Example: modify learning rate and batch size
        const learningRates = [
            startingOptions.learningRate * 0.666,
            startingOptions.learningRate * 1.0,
            startingOptions.learningRate * 1.333,
        ];
        const batchSizes = [
            startingOptions.training.batchSize * 0.5,
            startingOptions.training.batchSize,
            startingOptions.training.batchSize * 2,
        ];
        const totalAttempts = learningRates.length * batchSizes.length;
        let attempt = 1;

        for (const learningRate of learningRates) {
            for (const batchSize of batchSizes) {
                const currentOptions = {
                    ...bestOptions,
                    learningRate,
                    training: {
                        ...bestOptions.training,
                        batchSize,
                    },
                };

                console.log(
                    `Starting hypertuning attempt ${attempt++} of ${totalAttempts}...`
                );

                // eslint-disable-next-line no-await-in-loop
                const currentLoss = await MLP.crossValidate(
                    currentOptions,
                    5,
                    true
                );

                if (currentLoss < bestLoss) {
                    bestLoss = currentLoss;
                    bestOptions = currentOptions;
                }
            }
        }

        console.log("Best loss:", bestLoss);
        return bestOptions;
    }
}

console.log("loading oracle.ts");

// export const OracleService = MLP.crossValidate({
//     hiddenLayerSizes: [48],
//     outputSize: 1,
//     training: {
//         epochs: 10,
//         batchSize: 16,
//     },
//     learningRate: 0.0666,
//     // maxTrainingSize: 2000,
// });

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

export const OracleService = MLP.loadModel();
