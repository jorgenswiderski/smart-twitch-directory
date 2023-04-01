import Browser from "webextension-polyfill";
import { PairwiseLtr } from "./juicy-pear";

// eslint-disable-next-line import/no-mutable-exports
export let JuicyPearService = PairwiseLtr.loadModel();

Browser.storage.local.onChanged.addListener(async (changes) => {
    try {
        if (changes?.[PairwiseLtr.modelName]) {
            // Reload the model
            const promise = PairwiseLtr.loadModel();
            await promise;
            JuicyPearService = promise;
            console.log("Reloaded Juicy Pear model.");
        }
    } catch (err) {
        console.log(err);
    }
});
