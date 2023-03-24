import moment, { Moment } from "moment";
import browser from "webextension-polyfill";
import { MessageService, MessageType } from "./messaging";

interface WatchEvent {
    type: "start" | "stop";
    userId: string;
}

interface TimedWatchEvent extends WatchEvent {
    time: Moment;
}

class WatchHistory {
    events: TimedWatchEvent[] = [];

    addEvent(event: WatchEvent) {
        this.events.push({ ...event, time: moment() });
    }

    startWatching(userId) {
        this.addEvent({
            type: "start",
            userId,
        });

        console.log(`Now watching ${userId}`);

        MessageService.send(MessageType.START_WATCHING, {
            userId,
        });
    }

    stopWatching(userId) {
        this.addEvent({
            type: "stop",
            userId,
        });

        console.log(`No longer watching ${userId}`);

        MessageService.send(MessageType.STOP_WATCHING, {
            userId,
        });
    }
}

export const WatchHistoryService = new WatchHistory();
