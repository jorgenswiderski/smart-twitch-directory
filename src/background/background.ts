import Browser from "webextension-polyfill";
import { HelixApi } from "../api/helix";
import { CONFIG } from "../models/config";
import { CONSTANTS } from "../models/constants";
import { MessageService, MessageType } from "../models/messaging";
import { ActiveWatch } from "../models/watch-data/types";
import { WatchDataService } from "../models/watch-data/watch-data";

const watchHeartbeats: { [key: string]: number } = {};

MessageService.listen(MessageType.WATCHING_PULSE, ({ data: { userId } }) => {
    watchHeartbeats[userId] = Date.now();
});

function getActiveWatch(): ActiveWatch {
    const filtered = Object.entries(watchHeartbeats).filter(
        ([userId, time]) =>
            Date.now() - time < CONSTANTS.TRACKER.HEARTBEAT_INTERVAL + 5000
    );
    const watched: ActiveWatch = {};

    filtered.forEach(([userId]) => {
        watched[userId] = true;
    });

    return watched;
}

async function saveFrame(userId) {
    try {
        const watched = getActiveWatch();

        if (Object.keys(watched).length <= 0) {
            return;
        }

        const response = await HelixApi.getStreamsFollowed(userId);

        if (!response) {
            return;
        }

        WatchDataService.addEntry(watched, response.data.data);
    } catch (err) {
        console.error(err);
    }
}

function startTracking(userId: string) {
    setInterval(() => {
        saveFrame(userId);
    }, CONSTANTS.AGGREGATOR.SAMPLE_INTERVAL);
}

async function getUserId() {
    const response = await HelixApi.getUsers();

    if (response) {
        return response.data.data[0].id;
    }
}

async function init() {
    const userId = await getUserId();
    startTracking(userId);
}

init().catch((err) => {
    console.error(err);
});

async function loadSavedData(): Promise<void> {
    try {
        const response = await fetch(Browser.runtime.getURL("saved-data.json"));
        const data = await response.json();

        await Browser.storage.local.set(data);

        console.log("Saved data loaded into local storage");
    } catch (err) {
        console.error(err);
    }
}

if (CONFIG.DEBUG.LOAD_SAVED_DATA) {
    loadSavedData();
}

if (CONFIG.DEBUG.DUMP_SAVED_DATA) {
    (async () => {
        const data = await Browser.storage.local.get();
        console.log(data);
    })();
}
