import browser from "webextension-polyfill";
import { ActiveWatch } from "./types";

export interface WatchSample {
    time: Number;
    watched: ActiveWatch;
    followedStreams: Object;
}

class WatchData {
    data: WatchSample[];

    constructor() {
        this.loadData();
    }

    addEntry(watched: ActiveWatch, followedStreams: Object) {
        const entry = {
            time: Date.now(),
            watched,
            followedStreams,
        };

        this.data.push(entry);

        console.log("Added new entry:");
        console.log(entry);

        this.saveData();
    }

    async loadData() {
        try {
            const data = await browser.storage.local.get("watchData");

            this.data = data.watchData || [];

            console.log(
                `Loaded ${this.data.length} entries from local storage.`
            );

            console.log(this.data);
        } catch (err) {
            console.error(err);
        }
    }

    async saveData() {
        try {
            await browser.storage.local.set({ watchData: this.data });
        } catch (err) {
            console.error(err);
        }
    }
}

export const WatchDataService = new WatchData();
