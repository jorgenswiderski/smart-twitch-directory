import { PairwiseLTR } from "../models/heuristics/juicy-pear/juicy-pear";

async function isModelCached() {
    const stats = await PairwiseLTR.getSavedModelStats();

    return !!stats;
}

async function trainModel() {
    await PairwiseLTR.newModel(
        {
            hiddenLayerSizes: [32],
            maxTrainingSize: 256,
        },
        {
            autoSave: true,
            forceSave: true,
        }
    );
}

async function main() {
    try {
        const isCached = await isModelCached();

        if (!isCached) {
            console.log("No Juicy Pear is cached, training a fresh one...");

            await trainModel();
        }
    } catch (err) {
        console.error(err);
    }
}

main();

// 0.0353
PairwiseLTR.crossValidate(
    {
        hiddenLayerSizes: [16],
        maxTrainingSize: 8192,
        batchSize: 16,
    },
    {
        autoSave: true,
    }
).catch((err) => {
    console.error(err);
});

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
