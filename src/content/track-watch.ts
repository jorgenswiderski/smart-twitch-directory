import { HelixApi } from "../api/helix";
import { CONSTANTS } from "../models/constants";
import { MessageService, MessageType } from "../models/messaging";

function isStream() {
    return /^https:\/\/www\.twitch\.tv\/\w+[^/]*$/.test(window.location.href);
}

function getStreamName() {
    return /^https:\/\/www\.twitch\.tv\/(\w+)[^/]*$/.exec(
        window.location.href
    )[1];
}

function isStreamPlaying() {
    const video = document.querySelector("video"); // get the video element

    if (video && !video.paused) {
        // console.log("Stream is playing!");
        return true;
    }

    // console.log("Stream is paused or not yet started.");
    return false;
}

async function getUserIdFromUserName(userName): Promise<void | string> {
    const response = await HelixApi.getStreams({ userLogin: [userName] });

    if (!response) {
        return;
    }

    // eslint-disable-next-line consistent-return
    return response.data.data[0].user_id;
}

let interval;

function stopTracking() {
    console.log("Stopped tracking.");
    clearInterval(interval);
    interval = undefined;
}

async function startTracking(channelName: string) {
    try {
        const userId = await getUserIdFromUserName(channelName);

        if (!userId) {
            return;
        }

        console.log(`Now tracking ${channelName} with userId=${userId}.`);

        if (interval) {
            clearInterval(interval);
        }

        interval = setInterval(() => {
            if (!isStream()) {
                stopTracking();
                return;
            }

            if (getStreamName() !== channelName) {
                startTracking(getStreamName());
                return;
            }

            const isPlaying = isStreamPlaying();

            if (isPlaying) {
                MessageService.send(MessageType.WATCHING_PULSE, {
                    userId,
                });
            }
        }, CONSTANTS.TRACKER.HEARTBEAT_INTERVAL);
    } catch (err) {
        console.error(err);
    }
}

// console.log("track-watch.ts");

if (isStream()) {
    startTracking(getStreamName());
}
