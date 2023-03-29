import * as _ from "lodash";
import * as tf from "@tensorflow/tfjs";
import {
    EncodingInstruction,
    EncodingKeys,
    MachineLearningEncoder,
} from "../../ml-encoder/ml-encoder";
import { WatchDataService, WatchStream } from "../../watch-data/watch-data";
import { WatchStreamScored } from "../types";
import { CONSTANTS } from "../../constants";
import Browser from "webextension-polyfill";

interface OracleDataset {
    user_id: number[];
    game_id: number[];
}

interface MLPOptions {
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
}

class MLP {
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

    static createEmbeddingLayer(numCategories: number) {
        const embeddingDimension = Math.ceil(Math.sqrt(numCategories));

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
        const userEmbeddingLayer = MLP.createEmbeddingLayer(
            (this.encoding as any).user_id.categories.length
        );
        const gameEmbeddingLayer = MLP.createEmbeddingLayer(
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
        return Object.values(dataset).map((values) =>
            tf.tensor1d(values, "int32")
        );
    }

    async train(dataset: OracleDataset, labels: number[][]) {
        const { epochs, batchSize } = this.options.training;
        const dataTensors = MLP.convertDatasetToTensors(dataset);
        const labelsTensor = tf.tensor2d(labels);

        console.log("Training Oracle model...");

        await this.model.fit(dataTensors, labelsTensor, {
            epochs,
            batchSize,
        });

        console.log("Training Oracle model complete.");
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
        mlp.model = await tf.loadLayersModel(tf.io.fromMemory(model));

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

        return channelData
            .map((stream, index) => ({
                ...stream,
                score: prediction[index],
            }))
            .sort((a, b) => b.score - a.score);
    }

    static async getSavedModelScore() {
        const data = await Browser.storage.local.get("oracleModel");

        return data?.oracleModel?.mse ?? 100;
    }

    async saveModel(mse: number) {
        return Browser.storage.local.set({
            oracleModel: {
                model: this.toJSON(),
                mse,
            },
        });
    }

    static async loadModel(): Promise<MLP> {
        const data = await Browser.storage.local.get("oracleModel");

        console.log("Loading Oracle from local storage.");

        return MLP.fromJSON(data.oracleModel.model);
    }
}

console.log("loading oracle.ts");

export const OracleService = (async (): Promise<MLP> => {
    const samples = await WatchDataService.getData();
    const rawData = samples
        .map((sample) =>
            sample.followedStreams.map((stream) => ({
                ...stream,
                watched: sample.watched[stream.user_id] ?? false,
            }))
        )
        .flat();

    const datasetSizeLimit = -1;

    const sliced =
        datasetSizeLimit > 0
            ? _(rawData).shuffle().value().slice(0, 1000)
            : rawData;

    const { encoding, data } = MachineLearningEncoder.encodeDataset(
        sliced,
        MLP.encodingInstructions
    );

    // console.log(data);

    const { dataset, labels } = MLP.composeDataset(
        data.slice(
            0,
            Math.floor(
                CONSTANTS.HEURISTICS.STREAM_SAGE.TRAINING_PERCENT * data.length
            )
        ) as any
    );

    // console.log(labels);

    const oracle = new MLP(encoding);

    oracle.createModel({
        hiddenLayerSizes: [64],
        outputSize: 1,
        training: {
            epochs: 10,
            batchSize: 4,
        },
    });

    await oracle.train(dataset, labels);

    const { dataset: dataset2, labels: labels2 } = MLP.composeDataset(
        data.slice(
            Math.floor(
                CONSTANTS.HEURISTICS.STREAM_SAGE.TRAINING_PERCENT * data.length
            )
        ) as any
    );

    const { loss, metric } = oracle.evaluate(dataset2, labels2);

    console.log("loss", loss);
    console.log("metric", metric);

    if (loss < (await MLP.getSavedModelScore())) {
        await oracle.saveModel(loss);
        console.log("Saved Oracle model to local storage.");
    }

    return oracle;
})();

// export const OracleService = MLP.loadModel();
