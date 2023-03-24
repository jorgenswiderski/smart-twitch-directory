import { HelixApi } from "../api/helix";
import { WatchHistoryService } from "../models/watch-history";

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

    let status = isStreamPlaying();

    if (status) {
        WatchHistoryService.startWatching(userId);
    }

    setInterval(() => {
        const newStatus = isStreamPlaying();

        if (status !== newStatus) {
            if (newStatus) {
                WatchHistoryService.startWatching(userId);
            } else {
                WatchHistoryService.stopWatching(userId);
            }

            status = newStatus;
        }
    }, 5000);
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
