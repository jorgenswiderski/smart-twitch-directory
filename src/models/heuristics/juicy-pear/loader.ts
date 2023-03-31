import Browser from "webextension-polyfill";
import { PairwiseLTR } from "./juicy-pear";

// eslint-disable-next-line import/no-mutable-exports
export let JuicyPearService = PairwiseLTR.loadModel();

Browser.storage.local.onChanged.addListener(async (changes) => {
    try {
        if (changes?.[PairwiseLTR.modelName]) {
            // Reload the model
            const promise = PairwiseLTR.loadModel();
            await promise;
            JuicyPearService = promise;
            console.log("Reloaded Juicy Pear model.");
        }
    } catch (err) {
        console.log(err);
    }
});
