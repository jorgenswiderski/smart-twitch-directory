import moment from "moment";
import {
    LTRModelInfo,
    LTRModelStats,
    PairwiseLTR,
} from "../models/heuristics/juicy-pear/juicy-pear";
import { LtrPreprocessor } from "../models/heuristics/juicy-pear/preprocessor";
import {
    EncodingInstruction,
    EncodingKeys,
} from "../models/ml-encoder/ml-encoder";

async function trainModel() {
    await PairwiseLTR.newModel(
        {
            hiddenLayerSizes: [16],
            maxTrainingSize: 2048,
            batchSize: 16,
        },
        {
            autoSave: true,
            forceSave: true,
        }
    );
}

function getModelAgeInHours({ time }: LTRModelStats): number {
    const created = moment(time);
    return moment().diff(created, "hours", true);
}

function modelHasCompleteEncoding(
    { model: { encoding: cachedEncoding } }: LTRModelInfo,
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
    { datasetSize: { total: cachedLength } }: LTRModelStats,
    newLength
): boolean {
    return !cachedLength || !newLength || newLength / 2 >= cachedLength;
}

async function checkModel() {
    try {
        const info = await PairwiseLTR.getSavedModelInfo();

        const {
            encoding,
            data: { training: data },
        } = await LtrPreprocessor.getWatchData({ trainingPercent: 1 });

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

setInterval(checkModel, 60000);

// PairwiseLTR.crossValidate(
//     {
//         hiddenLayerSizes: [16],
//         maxTrainingSize: 2048,
//         batchSize: 16,
//     },
//     {
//         autoSave: true,
//     }
// ).catch((err) => {
//     console.error(err);
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
