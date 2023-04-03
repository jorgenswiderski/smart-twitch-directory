import moment from "moment";
import {
    initJuicyPearService,
    LtrModelInfo,
    LtrModelStats,
    PairwiseLtr,
} from "../models/heuristics/juicy-pear/juicy-pear";
import { LtrPreprocessor } from "../models/heuristics/juicy-pear/preprocessor";
import {
    EncodingInstruction,
    EncodingKeys,
} from "../models/ml-encoder/ml-encoder";

async function trainModel() {
    await PairwiseLtr.newModel(
        {
            maxTrainingSize: 8192,
            maxTrainingDuration: 60,
        },
        {
            autoSave: true,
            forceSave: true,
            yieldEvery: 33,
        }
    );
}

function getModelAgeInHours({ time }: LtrModelStats): number {
    const created = moment(time);
    return moment().diff(created, "hours", true);
}

function modelHasCompleteEncoding(
    { model: { encoding: cachedEncoding } }: LtrModelInfo,
    newestEncoding: EncodingKeys
): boolean {
    const hasSameKeys =
        JSON.stringify(Object.keys(cachedEncoding)) ===
        JSON.stringify(Object.keys(newestEncoding));

    const embeddingInstructions = Object.entries(cachedEncoding).filter(
        ([, instruction]) =>
            instruction.encodingType === EncodingInstruction.CATEGORY_INDEX
    );

    const hasSameEmbeddings = embeddingInstructions
        .map(
            ([key, instruction]) =>
                JSON.stringify(Object.keys((instruction as any).categories)) ===
                JSON.stringify(
                    Object.keys((newestEncoding[key] as any).categories)
                )
        )
        .every((sameCategories) => sameCategories);

    return hasSameEmbeddings && hasSameKeys;
}

function isDatasetMuchBigger(
    { datasetSize: { total: cachedLength } }: LtrModelStats,
    newLength
): boolean {
    return !cachedLength || !newLength || newLength / 2 >= cachedLength;
}

async function checkModel() {
    try {
        const info = await PairwiseLtr.getSavedModelInfo();

        const {
            encoding,
            data: { training: data },
        } = await LtrPreprocessor.getWatchData({
            inputType: PairwiseLtr.inputType,
            trainingPercent: 1,
        });

        if (data.x.length < 64) {
            // Not enough data yet, fallback to a non-ML model.
            console.log("Not enough data to train Juicy Pear");
            return;
        }

        if (!info) {
            console.log("No Juicy Pear is cached, training a fresh one...");
            await trainModel();
            return;
        }

        const ageInHours = getModelAgeInHours(info);

        if (ageInHours > 1 && !modelHasCompleteEncoding(info, encoding)) {
            console.log(
                "Juicy Pear is using old encodings, training a fresh one..."
            );
            await trainModel();
            return;
        }

        if (ageInHours > 4) {
            console.log("Juicy Pear is old, training a fresh one...");
            await trainModel();
            return;
        }

        if (isDatasetMuchBigger(info, data.x.length)) {
            console.log("Juicy Pear is obsolete, training a fresh one...");
            await trainModel();
        }
    } catch (err) {
        console.error(err);
    }
}

function startModelService() {
    initJuicyPearService();
}

setInterval(checkModel, 60000);
startModelService();

// PairwiseLtr.crossValidate(
//     {
//         hiddenLayerSizes: [16],
//         // maxTrainingSize: 2709,
//         maxTrainingSize: 512,
//         batchSize: 16,
//     },
//     {
//         autoSave: true,
//     }
// ).catch((err) => {
//     console.error(err);
// });

// 0.0183
// PairwiseLtr.hypertune(
//     {
//         maxTrainingSize: 2048,
//         // maxTrainingSize: 2709,

//         batchSize: 128,
//         epochs: 12,
//         hiddenActivation: "elu",
//         hiddenLayerSizes: [8],
//         learningRate: 0.001,
//         outputActivation: "sigmoid",
//     },
//     { autoSave: true },
//     JSON.parse(
//         `{"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[48,24],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":8,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[48,24],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[16,8],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":16,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[16,8],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"hardSigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[20,10],\\"learningRate\\":0.01,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[40,20],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":16,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[12],\\"learningRate\\":0.0001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":8,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":32,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[12],\\"learningRate\\":0.0001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":48,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"sigmoid\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":8,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[12,6],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"relu\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":16,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":32,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.01,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"tanh\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"tanh\\",\\"hiddenLayerSizes\\":[20,10],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":64,\\"hiddenActivation\\":\\"tanh\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":4,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":24,\\"hiddenActivation\\":\\"tanh\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":8,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.0001,\\"outputActivation\\":\\"hardSigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":64,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[20,10],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":16,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.0005,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":24,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":8,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":48,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.0005,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[24],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[48],\\"learningRate\\":0.1,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":32,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[8,4],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[20],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[24,12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":32,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[24,12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":16,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[24,12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":16,\\"hiddenActivation\\":\\"swish\\",\\"hiddenLayerSizes\\":[24,12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":12,\\"hiddenActivation\\":\\"sigmoid\\",\\"hiddenLayerSizes\\":[24,12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":64,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[24,12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[24,12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"hardSigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":16,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[20,10],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingSize\\":2048,\\"batchSize\\":128,\\"epochs\\":16,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[24,12],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true}`
//     )
// ).catch((err) => {
//     console.error(err);
// });

// async function evalModel(size: number) {
//     return PairwiseLtr.crossValidate(
//         {
//             maxTrainingSize: size,
//             // maxTrainingSize: 2709,

//             hiddenLayerSizes: [8],
//             hiddenActivation: "tanh",
//             batchSize: 4,
//         },
//         {
//             autoSave: true,
//         },
//         5,
//         false,
//         Math.floor(Math.random() * 100000000)
//     );
// }

// async function massEval(n: number, size: number) {
//     const totalLoss = (
//         await Promise.all(Array.from({ length: n }).map(() => evalModel(size)))
//     )
//         .map((result) => result.loss)
//         .reduce((prev, current) => prev + current, 0);

//     return totalLoss;
// }

// // 0.0684
// (async () => {
//     try {
//         const results = {};

//         await Promise.all(
//             [256, 512, 1024, 2048].map(async (size) => {
//                 results[size] = await massEval(5, size);
//             })
//         );

//         console.log(results);
//     } catch (err) {
//         console.error(err);
//     }
// })();

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
