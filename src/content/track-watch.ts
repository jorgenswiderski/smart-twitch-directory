import { HelixApi } from "../api/helix";
import { CONSTANTS } from "../models/constants";
import { MessageService, MessageType } from "../models/messaging";

function isStreamPlaying() {
    const video = document.querySelector("video"); // get the video element

    if (video && !video.paused) {
        // console.log("Stream is playing!");
        return true;
    }

    // console.log("Stream is paused or not yet started.");
    return false;
}

function startTracking(channelName: string, userId: string) {
    console.log(`Now tracking ${channelName} with userId=${userId}.`);

    setInterval(() => {
        const isPlaying = isStreamPlaying();

        if (isPlaying) {
            MessageService.send(MessageType.WATCHING_PULSE, {
                userId,
            });
        }
    }, CONSTANTS.TRACKER.HEARTBEAT_INTERVAL);
}

function init(channelName: string) {
    HelixApi.getStreams({ userLogin: [channelName] }).then((response) => {
        if (!response) {
            return;
        }

        const userId = response.data.data[0].user_id;
        startTracking(channelName, userId);
    });
}

console.log("Loading track-watch.ts...");

// const location = window.location.href;

if (/^https:\/\/www\.twitch\.tv\/\w+[^/]*$/.test(window.location.href)) {
    const channelName = /^https:\/\/www\.twitch\.tv\/(\w+)[^/]*$/.exec(
        window.location.href
    )[1];

    init(channelName);
}
