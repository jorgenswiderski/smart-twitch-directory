import browser from "webextension-polyfill";
import { HelixApi } from "../api/helix";
import { MessageService, MessageType } from "../models/messaging";

type WatchObj = { [key: string]: true };

interface WatchData {
    time: Number;
    watched: WatchObj;
    followedStreams: Object;
}

const watched: WatchObj = {};
let history: WatchData[];

MessageService.listen(MessageType.START_WATCHING, ({ data: { userId } }) => {
    watched[userId] = true;
});

MessageService.listen(MessageType.STOP_WATCHING, ({ data: { userId } }) => {
    delete watched[userId];
});

async function saveData() {
    await browser.storage.local.set({ watchData: history });
}

async function saveFrame(userId) {
    try {
        if (Object.keys(watched).length <= 0) {
            return;
        }

        const response = await HelixApi.getStreamsFollowed(userId);

        if (!response) {
            return;
        }

        const entry: WatchData = {
            time: Date.now(),
            watched,
            followedStreams: response.data.data,
        };

        console.log("Added new entry:");
        console.log(entry);

        history.push(entry);
        await saveData();
    } catch (err) {
        console.error(err);
    }
}

function startTracking(userId: string) {
    setInterval(() => {
        saveFrame(userId);
    }, 180000);
}

async function loadSavedData() {
    const data = await browser.storage.local.get("watchData");

    history = data.watchData || [];

    console.log(
        `Loaded ${(data.watchData || []).length} entries from local storage.`
    );
}

async function getUserId() {
    const response = await HelixApi.getUsers();

    if (response) {
        return response.data.data[0].id;
    }
}

async function init() {
    const userId = getUserId();
    const loading = loadSavedData();

    try {
        await Promise.all([userId, loading]);
        startTracking(await userId);
    } catch (err) {
        console.error(err);
    }
}

init().catch((err) => {
    console.error(err);
});
