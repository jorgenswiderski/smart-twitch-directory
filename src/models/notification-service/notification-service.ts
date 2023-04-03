import Browser from "webextension-polyfill";
import { HelixApi } from "../../api/helix";
import { CONFIG } from "../config";
import { JuicyPearService } from "../heuristics/juicy-pear/juicy-pear";
import { LtrPreprocessor } from "../heuristics/juicy-pear/preprocessor";
import { EncodingMeanInputs } from "../ml-encoder/ml-encoder";
import { ActiveWatch } from "../watch-data/types";
import { WatchStream } from "../watch-data/watch-data";

enum NotificationContext {
    NEW,
    IMPROVED,
}

class NotificationService {
    streams: WatchStream[];

    watched: ActiveWatch = {};

    static streamsToIds(streams: WatchStream[]): Set<string> {
        return new Set(streams.map((stream) => stream.id));
    }

    getWatchedStreams(streams: WatchStream[]) {
        return streams.filter((stream) =>
            Object.keys(this.watched).find(
                (watchedStream) => watchedStream === stream.id
            )
        );
    }

    async getBestWatchedStream(
        streams: WatchStream[]
    ): Promise<WatchStream | null> {
        const watchedStreams = this.getWatchedStreams(streams);

        if (watchedStreams.length === 0) {
            return null;
        }

        const sorted = await JuicyPearService().scoreAndSortStreams(
            watchedStreams
        );

        return sorted[0];
    }

    async notifyNewStreams(streams: WatchStream[]) {
        const newStreams = streams.filter(
            (stream) =>
                !this.streams.find((streamB) => streamB.id === stream.id)
        );

        if (newStreams.length === 0) {
            return;
        }

        const watchedStreams = this.getWatchedStreams(streams);

        if (watchedStreams.length === 0) {
            await Promise.all(
                newStreams.map((stream) =>
                    NotificationService.triggerNotification(
                        stream,
                        NotificationContext.NEW
                    )
                )
            );
            return;
        }

        const bestWatchedStream = await this.getBestWatchedStream(streams);

        await Promise.all(
            newStreams.map(async (stream) => {
                const prediction = await JuicyPearService().predictPair(
                    stream,
                    bestWatchedStream
                );

                if (
                    prediction > CONFIG.NOTIFICATIONS.RELATIVE_QUALITY_MINIMUM
                ) {
                    await NotificationService.triggerNotification(
                        stream,
                        NotificationContext.NEW
                    );
                }
            })
        );
    }

    async notifyImprovedStreams(streams: WatchStream[]) {
        const bestWatchedStream = await this.getBestWatchedStream(streams);

        if (!bestWatchedStream) {
            // Not watching any streams
            return;
        }

        const existingStreams = streams.filter((stream) =>
            this.streams.find((streamB) => streamB.id === stream.id)
        );

        const encoding = await JuicyPearService().encoding;
        const meanInputs: EncodingMeanInputs =
            await JuicyPearService().getEmbeddingMeanInputs();

        const changedStreams = existingStreams.filter((stream) => {
            const old = this.streams.find(
                (streamB) => streamB.id === stream.id
            );

            const pair = LtrPreprocessor.encodeWatchSample(
                [stream, old],
                encoding,
                meanInputs
            )[0];

            const hasChanged =
                JSON.stringify(pair.slice(0, pair.length / 2)) !==
                JSON.stringify(pair.slice(pair.length / 2));

            return hasChanged;
        });

        if (changedStreams.length === 0) {
            return;
        }

        await Promise.all(
            changedStreams.map(async (stream) => {
                const old = this.streams.find(
                    (streamB) => streamB.id === stream.id
                );

                const prediction = await JuicyPearService().predictPair(
                    stream,
                    old
                );

                if (prediction < CONFIG.NOTIFICATIONS.IMPROVEMENT_MINIMUM) {
                    return;
                }

                const predictionB = await JuicyPearService().predictPair(
                    stream,
                    bestWatchedStream
                );

                if (
                    predictionB > CONFIG.NOTIFICATIONS.RELATIVE_QUALITY_MINIMUM
                ) {
                    await NotificationService.triggerNotification(
                        stream,
                        NotificationContext.IMPROVED
                    );
                }
            })
        );
    }

    async update(watched: ActiveWatch, streams: WatchStream[]) {
        try {
            this.watched = watched;

            if (this.streams) {
                if (CONFIG.NOTIFICATIONS.NOTIFY_NEW_STREAMS) {
                    await this.notifyNewStreams(streams);
                }
                if (CONFIG.NOTIFICATIONS.NOTIFY_IMPROVED_STREAMS) {
                    await this.notifyImprovedStreams(streams);
                }
            }

            this.streams = streams;
        } catch (err) {
            console.error(err);
        }
    }

    static async triggerNotification(
        { title, user_name, game_name, user_login, user_id }: WatchStream,
        context: NotificationContext
    ) {
        let avatarUrl: string;

        // TODO: optimize avatars
        const response = await HelixApi.getUsers([user_id]);

        if (response) {
            const { data } = response.data;
            avatarUrl = data[0].profile_image_url;
        }

        let message;

        if (context === NotificationContext.NEW) {
            message = `${user_name} just went live streaming ${game_name}!`;
        } else {
            message = `${user_name} is now streaming ${game_name}!`;
        }

        Browser.notifications.create({
            type: "basic",
            title: `${title}`,
            message,
            iconUrl: avatarUrl,
        });

        console.log(`Triggered notification for ${user_login}.`);
    }
}

export const NotifyService = new NotificationService();

// NotificationService.triggerNotification({
//     title: "Streaming some shit",
//     user_name: "Maximum",
//     user_login: "maximum",
//     game_name: "The Quarry",
//     user_id: "42490770",
// } as WatchStream);
