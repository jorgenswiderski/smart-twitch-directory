import * as tf from "@tensorflow/tfjs";
import { PairwiseLtr } from "../juicy-pear/juicy-pear";
import { LtrInputType } from "../juicy-pear/preprocessor";

export class PointwiseLtr extends PairwiseLtr {
    static modelName = "oracle";

    static inputType: LtrInputType = "points";

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
        const userInput = tf.input({
            shape: [1],
            dtype: "int32",
            name: "userInput",
        });
        const gameInput = tf.input({
            shape: [1],
            dtype: "int32",
            name: "gameInput",
        });

        // Apply embedding layers
        const userEmbedded = userEmbeddingLayer.apply(
            userInput
        ) as tf.SymbolicTensor;
        const gameEmbedded = gameEmbeddingLayer.apply(
            gameInput
        ) as tf.SymbolicTensor;

        // Concatenate and flatten features
        const concatenated = tf.layers
            .concatenate()
            .apply([userEmbedded, gameEmbedded]) as tf.SymbolicTensor;
        const flattened = tf.layers
            .flatten()
            .apply(concatenated) as tf.SymbolicTensor;

        // Create hidden layers
        const hiddenLayers = hiddenLayerSizes.map((size) =>
            tf.layers.dense({ units: size, activation: hiddenActivation })
        );

        // Apply dense layers
        const hidden = hiddenLayers.reduce(
            (input, layer) => layer.apply(input) as tf.SymbolicTensor,
            flattened
        );

        // Create output layer
        const output = tf.layers
            .dense({
                units: outputSize,
                activation: outputActivation,
            })
            .apply(hidden) as tf.SymbolicTensor;

        // Create and compile the model
        this.model = tf.model({
            inputs: [userInput, gameInput],
            outputs: output,
        });

        this.model.compile({
            optimizer: tf.train.adam(learningRate),
            loss,
            metrics,
        });
    }
}

export const OracleService = PointwiseLtr.loadModel();
