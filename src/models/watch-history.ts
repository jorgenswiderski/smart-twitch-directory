import moment, { Moment } from "moment";

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
    }

    stopWatching(userId) {
        this.addEvent({
            type: "stop",
            userId,
        });

        console.log(`No longer watching ${userId}`);
    }
}

export const WatchHistoryService = new WatchHistory();
