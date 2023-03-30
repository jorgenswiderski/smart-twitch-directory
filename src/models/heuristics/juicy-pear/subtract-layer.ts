/* eslint-disable class-methods-use-this */
import * as tf from "@tensorflow/tfjs";

class SubtractLayer extends tf.layers.Layer {
    constructor() {
        super({});
    }

    computeOutputShape(inputShape) {
        return inputShape[0];
    }

    call(inputs) {
        return tf.sub(inputs[0], inputs[1]);
    }

    static get className() {
        return "SubtractLayer";
    }
}

tf.serialization.registerClass(SubtractLayer);

export function subtractLayer() {
    return new SubtractLayer();
}
