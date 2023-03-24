import moment, { Moment } from "moment";
import { HelixApi } from "../api/helix";
import { MessageService, MessageType } from "../models/messaging";

type WatchObj = { [key: string]: true };

interface WatchData {
    time: Number;
    watched: WatchObj;
    followedStreams: Object;
}

const watched: WatchObj = {};
const history: WatchData[] = [];

MessageService.listen(MessageType.START_WATCHING, ({ data: { userId } }) => {
    watched[userId] = true;
});

MessageService.listen(MessageType.STOP_WATCHING, ({ data: { userId } }) => {
    delete watched[userId];
});

function startTracking(userId: string) {
    setInterval(() => {
        if (Object.keys(watched).length <= 0) {
            return;
        }

        HelixApi.getStreamsFollowed(userId).then((response) => {
            if (response) {
                const entry: WatchData = {
                    time: Date.now(),
                    watched,
                    followedStreams: response.data.data,
                };

                console.log("Added new entry:");
                console.log(entry);

                history.push(entry);
            }
        });
    }, 180000);
}

HelixApi.getUsers()
    .then((response) => {
        if (response) {
            startTracking(response.data.data[0].id);
        }
    })
    .catch((err) => {
        console.error(err);
    });
