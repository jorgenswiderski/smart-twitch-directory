import Browser from "webextension-polyfill";
import { HelixApi } from "../../api/helix";
import { JuicyPearService } from "../heuristics/juicy-pear/juicy-pear";
import { LtrPreprocessor } from "../heuristics/juicy-pear/preprocessor";
import { EncodingMeanInputs } from "../ml-encoder/ml-encoder";
import { ActiveWatch } from "../watch-data/types";
import { WatchStream } from "../watch-data/watch-data";

class NotificationService {
    streams: WatchStream[];

    watched: ActiveWatch = {};

    static streamsToIds(streams: WatchStream[]): Set<string> {
        return new Set(streams.map((stream) => stream.id));
    }

    async notifyNewStreams(streams: WatchStream[]) {
        const newStreams = streams.filter(
            (stream) =>
                !this.streams.find((streamB) => streamB.id === stream.id)
        );

        if (newStreams.length === 0) {
            return;
        }

        const watchedStreams = streams.filter((stream) =>
            Object.keys(this.watched).find(
                (watchedStream) => watchedStream === stream.id
            )
        );

        const combined = [...newStreams, ...watchedStreams];

        if (combined.length === 1) {
            await NotificationService.triggerNotification(combined[0]);
            return;
        }

        const sorted = await JuicyPearService.scoreAndSortStreams(combined);

        for (let i = 0; i < sorted.length; i += 1) {
            const stream = sorted[i];

            const isNew = newStreams.find(
                (streamB) => streamB.id === stream.id
            );

            if (isNew) {
                // eslint-disable-next-line no-await-in-loop
                await NotificationService.triggerNotification(stream);
            } else {
                break;
            }
        }
    }

    // TODO
    async notifyImprovedStreams(streams: WatchStream[]) {
        const existingStreams = streams.filter((stream) =>
            this.streams.find((streamB) => streamB.id === stream.id)
        );

        const encoding = await JuicyPearService.encoding;
        const meanInputs: EncodingMeanInputs =
            await JuicyPearService.getEmbeddingMeanInputs();

        const changedStreams = [];

        existingStreams.filter((stream) => {
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

        // console.log("changed streams", changedStreams);
    }

    async update(watched: ActiveWatch, streams: WatchStream[]) {
        try {
            this.watched = watched;

            if (this.streams) {
                await this.notifyNewStreams(streams);
                // await this.notifyImprovedStreams(streams);
            }

            this.streams = streams;
        } catch (err) {
            console.error(err);
        }
    }

    static async triggerNotification({
        title,
        user_name,
        game_name,
        user_login,
        user_id,
    }: WatchStream) {
        let avatarUrl: string;

        // TODO: optimize avatars
        const response = await HelixApi.getUsers([user_id]);

        if (response) {
            const { data } = response.data;
            avatarUrl = data[0].profile_image_url;
        }

        Browser.notifications.create({
            type: "basic",
            title: `${title}`,
            // TODO: conditional message
            message: `${user_name} just went live streaming ${game_name}!`,
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
