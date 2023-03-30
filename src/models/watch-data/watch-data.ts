import browser from "webextension-polyfill";
import { ActiveWatch } from "./types";

/*
                // "id": "41997648171",
                "user_id": "71092938",
                // "user_login": "xqc",
                // "user_name": "xQc",
                "game_id": "509658",
                // "game_name": "Just Chatting",
                // "type": "live",
                "title": "⏺️LIVE⏺️CLICK⏺️NOW⏺️DRAMA⏺️MEGA⏺️ULTRA⏺️REACT⏺️WARLORD⏺️GAMEPLAY⏺️GOD⏺️#1 AT EVERYTHING⏺️GENIUS⏺️WATCH ME BECOME⏺️A MINECRAFT⏺️SCIENTIST⏺️",
                "viewer_count": 62079,
                "started_at": "2023-03-24T02:59:00Z",
                "language": "en",
                // "thumbnail_url": "https://static-cdn.jtvnw.net/previews-ttv/live_user_xqc-{width}x{height}.jpg",
                // "tag_ids": [],
                "tags": [],
                "is_mature": false
*/

export interface WatchStream {
    id: string;
    user_id: string;
    user_login: string;
    user_name: string;
    game_id: string;
    game_name: string;
    type: string;
    title: string;
    viewer_count: number;
    started_at: string;
    language: string;
    thumbnail_url: string;
    tag_ids: string[];
    tags: string[];
    is_mature: boolean;
}

export interface WatchStreamWithLabel extends WatchStream {
    watched: boolean;
}

export interface WatchSample {
    time: number;
    watched: ActiveWatch;
    followedStreams: WatchStream[];
}

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

            // console.log(this.data);
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

    async waitForData() {
        return new Promise<void>((resolve, reject) => {
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
