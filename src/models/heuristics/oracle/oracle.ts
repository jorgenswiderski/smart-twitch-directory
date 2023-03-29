import * as _ from "lodash";
import * as tf from "@tensorflow/tfjs";
import {
    EncodingInstruction,
    MachineLearningEncoder,
} from "../../ml-encoder/ml-encoder";
import { WatchDataService, WatchStream } from "../../watch-data/watch-data";
import { HeuristicService, WatchStreamScored } from "../types";
import { CONSTANTS } from "../../constants";

interface MLPOptions {
    inputSize: number;
    hiddenLayerSizes: number[];
    outputSize: number;
    activation?: string;
    learningRate?: number;
}

class MLP {
    model: tf.Sequential;

    constructor(options: MLPOptions) {
        const {
            inputSize,
            hiddenLayerSizes,
            outputSize,
            activation = "relu",
            learningRate = 0.01,
        } = options;

        this.model = tf.sequential();

        hiddenLayerSizes.forEach((size, index) => {
            this.model.add(
                tf.layers.dense({
                    units: size,
                    activation,
                    inputShape: index === 0 ? [inputSize] : undefined,
                })
            );
        });

        this.model.add(tf.layers.dense({ units: outputSize }));

        this.model.compile({
            optimizer: tf.train.adam(learningRate),
            loss: "meanSquaredError",
        });
    }

    async train(input: tf.Tensor, output: tf.Tensor, epochs: number) {
        return this.model.fit(input, output, {
            epochs,
            shuffle: true,
        });
    }

    predict(input: tf.Tensor) {
        return this.model.predict(input) as tf.Tensor;
    }
}

console.log("loading oracle.ts");

function createEmbeddingLayer(numCategories: number) {
    const embeddingDimension = Math.ceil(Math.sqrt(numCategories));

    const embeddingLayer = tf.layers.embedding({
        inputDim: numCategories,
        outputDim: embeddingDimension,
    });

    return embeddingLayer;
}

export const OracleService = (async (): Promise<HeuristicService> => {
    const samples = await WatchDataService.getData();
    const rawData = samples
        .map((sample) =>
            sample.followedStreams.map((stream) => ({
                ...stream,
                watched: sample.watched[stream.user_id] ?? false,
            }))
        )
        .flat();

    // const seenGames = {};
    // const seenUsers = {};
    // const deduped = [];

    // rawData.forEach((entry) => {
    //     if (!seenGames[entry.game_id] || !seenUsers[entry.user_id]) {
    //         seenGames[entry.game_id] = true;
    //         seenUsers[entry.user_id] = true;
    //         deduped.push(entry);
    //     }
    // });

    const { encoding, data } = MachineLearningEncoder.encodeDataset(
        // _(rawData).shuffle().value().slice(0, 1000),
        rawData,
        {
            user_id: EncodingInstruction.CATEGORY_INDEX,
            game_id: EncodingInstruction.CATEGORY_INDEX,
            // language: EncodingInstruction.ONE_HOT,
            // FIXME: convert to embedding layer / category index
            // title: EncodingInstruction.BAG_OF_WORDS,
            // viewer_count: EncodingInstruction.NORMALIZE,
            // is_mature: EncodingInstruction.BOOLEAN,
            watched: EncodingInstruction.BOOLEAN,
        }
    );

    // FIXME
    const userEmbeddingLayer = createEmbeddingLayer(
        (encoding.user_id as any).categories.length
    );
    const gameEmbeddingLayer = createEmbeddingLayer(
        (encoding.game_id as any).categories.length
    );

    // Create the rest of the model
    const hiddenLayer = tf.layers.dense({ units: 64, activation: "relu" });
    const outputLayer = tf.layers.dense({ units: 1, activation: "sigmoid" });

    // Define the model using the functional API
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

    const hidden = hiddenLayer.apply(flattened) as tf.SymbolicTensor;
    const output = outputLayer.apply(hidden) as tf.SymbolicTensor;

    const model = tf.model({ inputs: [inputUser, inputGame], outputs: output });

    // Compile the model
    model.compile({
        optimizer: tf.train.adam(),
        loss: "meanSquaredError",
        metrics: ["accuracy"],
    });

    const trainingData = data.slice(
        0,
        Math.floor(
            CONSTANTS.HEURISTICS.STREAM_SAGE.TRAINING_PERCENT * data.length
        )
    );
    const testingData = data.slice(
        Math.floor(
            CONSTANTS.HEURISTICS.STREAM_SAGE.TRAINING_PERCENT * data.length
        )
    );

    // Simple training data
    const userDataTrain = tf.tensor1d(
        trainingData.map((entry) => entry.user_id),
        "int32"
    );
    const gameDataTrain = tf.tensor1d(
        trainingData.map((entry) => entry.game_id),
        "int32"
    );
    const labelsTrain = tf.tensor2d(
        trainingData.map((entry) => [entry.watched])
    );

    // Train the model
    const epochs = 10;

    console.log("Training model...");

    await model.fit([userDataTrain, gameDataTrain], labelsTrain, {
        epochs,
        batchSize: 4,
    });

    console.log("Training complete.");

    const userDataEval = tf.tensor1d(
        testingData.map((entry) => entry.user_id),
        "int32"
    );
    const gameDataEval = tf.tensor1d(
        testingData.map((entry) => entry.game_id),
        "int32"
    );
    const labelsEval = tf.tensor2d(testingData.map((entry) => [entry.watched]));

    const [loss, metric] = model.evaluate(
        [userDataEval, gameDataEval],
        [labelsEval]
    ) as tf.Tensor[];

    console.log("loss", loss.dataSync());
    console.log("metric", metric.dataSync());

    // Example input data for prediction (batch size = 1)
    // const feature1DataPredict = tf.tensor1d([7], "int32");
    // const feature2DataPredict = tf.tensor1d([55], "int32");

    // Make a prediction
    // const prediction = model.predict([
    //     feature1DataPredict,
    //     feature2DataPredict,
    // ]);

    // console.log("prediction", prediction.toString());

    return {
        scoreAndSortStreams: (
            channelData: WatchStream[]
        ): WatchStreamScored[] => {
            const encoded = channelData.map((stream) =>
                MachineLearningEncoder.encodeEntry(stream, encoding)
            );

            // console.log(encoded.map((stream) => stream.user_id));
            // console.log(encoded.map((stream) => stream.game_id));

            const userDataPredict = tf.tensor1d(
                encoded.map((stream) => stream.user_id),
                "int32"
            );
            const gameDataPredict = tf.tensor1d(
                encoded.map((stream) => stream.game_id),
                "int32"
            );

            // Make a prediction
            const prediction = (
                model.predict([userDataPredict, gameDataPredict]) as tf.Tensor
            ).dataSync();

            return channelData
                .map((stream, index) => ({
                    ...stream,
                    score: prediction[index],
                }))
                .sort((a, b) => b.score - a.score);
        },
    };
})();
