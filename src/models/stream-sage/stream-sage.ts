import * as tf from "@tensorflow/tfjs";
import {
    getStreamSageData,
    StreamSageSample,
    StreamSageStream,
    StreamSageTrainingData,
} from "./preprocess";

function pad(arr: any[], len: number, fillValue: any) {
    return arr.concat(Array(len).fill(fillValue)).slice(0, len);
}

class StreamSage {
    model: tf.Sequential;

    numStreams: number;

    constructor(trainingData: StreamSageTrainingData) {
        console.log("Building StreamSage...");
        this.numStreams = StreamSage.calcNumStreams(trainingData);
        console.log(`numStreams: ${this.numStreams}`);
        this.model = this.createModel();

        console.log("Training StreamSage...");

        this.trainModel(trainingData)
            .then(() => {
                console.log("Training complete.");
            })
            .catch((err) => {
                console.error(err);
            });
    }

    static calcNumStreams(trainingData: StreamSageTrainingData): number {
        const streamerIds = new Set(
            trainingData.inputs
                .map((entry) => entry.map((stream) => stream.user_id))
                .flat()
        );

        return streamerIds.size;
    }

    createModel() {
        const model = tf.sequential();
        model.add(
            tf.layers.dense({
                inputShape: [this.numStreams * 8],
                units: 32,
                activation: "relu",
            })
        );
        model.add(tf.layers.dense({ units: 32, activation: "relu" }));
        model.add(
            tf.layers.dense({ units: this.numStreams, activation: "softmax" })
        );
        model.compile({ loss: "categoricalCrossentropy", optimizer: "adam" });
        return model;
    }

    async trainModel(trainingData: StreamSageTrainingData) {
        console.log(trainingData);

        const td = {
            ...trainingData,
            inputs: trainingData.inputs.map((sample) =>
                pad(
                    sample.map((stream) => Object.values(stream)).flat(),
                    this.numStreams * 8,
                    0
                )
            ),
            outputs: trainingData.outputs.map((sample) =>
                pad(sample, this.numStreams, 0)
            ),
        };

        // console.log({
        //     inputs: td.inputs.slice(0, 3),
        //     outputs: td.outputs.slice(0, 3),
        // });

        const xs = tf.tensor2d(td.inputs);
        const ys = tf.tensor2d(td.outputs);
        const history = await this.model.fit(xs, ys, { epochs: 50 });
        return history;
    }

    // predict(streamData) {
    //     const xs = tf.tensor2d(streamData, [1, this.numStreams * 6]);
    //     const ys = this.model.predict(xs);
    //     const predictions = Array.from(ys.dataSync());
    //     return predictions;
    // }
}
getStreamSageData().then((data) => {
    const StreamSageB = new StreamSage(data);
});
