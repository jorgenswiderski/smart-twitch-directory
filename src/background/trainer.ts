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
