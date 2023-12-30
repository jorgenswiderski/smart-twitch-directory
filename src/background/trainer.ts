import moment from "moment";
import {
    initJuicyPearService,
    LtrModelInfo,
    LtrModelStats,
    PairwiseLtr,
} from "../models/heuristics/juicy-pear/juicy-pear";
import { LtrPreprocessor } from "../models/heuristics/juicy-pear/preprocessor";
import { error, log } from "../models/logger";
import {
    EncodingInstruction,
    EncodingKeys,
} from "../models/ml-encoder/ml-encoder";

let isTrainingInProgress = false;

async function trainModel() {
    try {
        isTrainingInProgress = true;

        await PairwiseLtr.newModel(
            {
                maxTrainingSize: 8192,
            },
            {
                autoSave: true,
                forceSave: true,
                yieldEvery: 10,
                fastEvaluation: 1000,
            }
        );
    } catch (err) {
        error(err);
    }

    isTrainingInProgress = false;
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
        if (isTrainingInProgress) {
            return;
        }

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
            log("Not enough data to train Juicy Pear");
            return;
        }

        if (!info) {
            log("No Juicy Pear is cached, training a fresh one...");
            await trainModel();
            return;
        }

        const ageInHours = getModelAgeInHours(info);

        if (ageInHours > 1 && !modelHasCompleteEncoding(info, encoding)) {
            log("Juicy Pear is using old encodings, training a fresh one...");
            await trainModel();
            return;
        }

        if (ageInHours > 4) {
            log("Juicy Pear is old, training a fresh one...");
            await trainModel();
            return;
        }

        if (isDatasetMuchBigger(info, data.x.length)) {
            log("Juicy Pear is obsolete, training a fresh one...");
            await trainModel();
        }
    } catch (err) {
        error(err);
    }
}

function startModelService() {
    initJuicyPearService();
}

setInterval(checkModel, 60000);
startModelService();

// PairwiseLtr.crossValidate(
//     {
//         maxTrainingSize: 16384,
//         hiddenLayerSizes: [16],
//         batchSize: 16,
//     },
//     {
//         autoSave: true,
//     }
// ).catch((err) => {
//     error(err);
// });

// 0.999
// PairwiseLtr.hypertune(
//     {
//         maxTrainingSize: 8192,
//         // maxTrainingDuration: 60,
//         epochs: 200,
//         patience: 5,

//         batchSize: 128,
//         hiddenActivation: "mish",
//         hiddenLayerSizes: [8],
//         learningRate: 0.001,
//         outputActivation: "sigmoid",
//     },
//     { autoSave: true },
//     JSON.parse(
//         `{"{\\"maxTrainingDuration\\":60,\\"epochs\\":200,\\"patience\\":5,\\"batchSize\\":128,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[8],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingDuration\\":60,\\"epochs\\":200,\\"patience\\":5,\\"batchSize\\":128,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[8],\\"learningRate\\":0.005,\\"outputActivation\\":\\"hardSigmoid\\"}":true,"{\\"maxTrainingDuration\\":60,\\"epochs\\":200,\\"patience\\":5,\\"batchSize\\":4,\\"hiddenActivation\\":\\"elu\\",\\"hiddenLayerSizes\\":[8],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true,"{\\"maxTrainingDuration\\":60,\\"epochs\\":200,\\"patience\\":5,\\"batchSize\\":128,\\"hiddenActivation\\":\\"mish\\",\\"hiddenLayerSizes\\":[8],\\"learningRate\\":0.001,\\"outputActivation\\":\\"sigmoid\\"}":true}`
//     )
// ).catch((err) => {
//     error(err);
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

//         log(results);
//     } catch (err) {
//         error(err);
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
//         log("Tuned hyperparameters:", bestOptions);
//     })
//     .catch((err) => {
//         error(err);
//     });

// (async () => {
//     console.log("testing");
//     const results = await LtrPreprocessor.getWatchData({
//         inputType: "pairs",
//         trainingPercent: 1,
//         maxTrainingSize: 4096 * 2 ** 4,
//         seed: 42,
//     });
// })();
