import browser from "webextension-polyfill";
import { debug, error } from "../logger";
import { ActiveWatch, WatchSample, WatchStream } from "./types";
import { WatchDataCompressor } from "./compressor";

class WatchData {
    data: WatchSample[];

    constructor() {
        this.loadData();

        browser.storage.local.onChanged.addListener((changes) => {
            if (changes.watchData?.newValue) {
                this.data = changes.watchData.newValue;
            }
        });
    }

    addEntry(watched: ActiveWatch, followedStreams: WatchStream[]) {
        const entry = {
            time: Date.now(),
            watched,
            followedStreams,
        };

        this.data.push(entry);

        debug("Added new entry:", entry);

        this.saveData();
    }

    async loadData() {
        try {
            const cData = await browser.storage.local.get(
                "watchDataCompressed"
            );

            if (cData.watchDataCompressed) {
                const inflated = await WatchDataCompressor.inflate(
                    cData.watchDataCompressed
                );
                this.data = inflated;
            } else {
                this.data = [];
            }

            debug(`Loaded ${this.data.length} entries from local storage.`);
        } catch (err) {
            error(err);
        }
    }

    async saveData() {
        try {
            const deflated = await WatchDataCompressor.deflate(this.data);
            await browser.storage.local.set({ watchDataCompressed: deflated });
        } catch (err) {
            error(err);
        }
    }

    async waitForData() {
        return new Promise<void>((resolve) => {
            setInterval(() => {
                if (this.data && this.data.length > 0) {
                    resolve();
                }
            }, 500);
        });
    }

    async getData() {
        await this.waitForData();
        return this.data;
    }
}

export const WatchDataService = new WatchData();
