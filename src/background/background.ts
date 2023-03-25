import { HelixApi } from "../api/helix";
import { MessageService, MessageType } from "../models/messaging";
import { ActiveWatch } from "../models/watch-data/types";
import { WatchDataService } from "../models/watch-data/watch-data";

const watched: ActiveWatch = {};

MessageService.listen(MessageType.START_WATCHING, ({ data: { userId } }) => {
    watched[userId] = true;
});

MessageService.listen(MessageType.STOP_WATCHING, ({ data: { userId } }) => {
    delete watched[userId];
});

async function saveFrame(userId) {
    try {
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
    }, 180000);
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
