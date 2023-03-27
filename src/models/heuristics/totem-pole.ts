import { CONSTANTS } from "../constants";
import { WatchDataService, WatchStream } from "../watch-data/watch-data";
import { WatchStreamScored } from "./types";
import { HeuristicService } from "./types";

class TotemPole implements HeuristicService {
    static calcDecayFactor(time) {
        const ageInMs = Date.now() - time;
        const ageInDays = ageInMs / 86400000;

        // 3% per day
        return 0.97 ** ageInDays;
    }

    static initScore(scores, stream) {
        scores[stream.user_id] = scores[stream.user_id] || {
            num: 0,
            div: 0,
        };

        return scores[stream.user_id];
    }

    static buildCategoryMap(channelData: WatchStream[]): {
        [key: string]: string;
    } {
        const categoryMap = {};

        channelData.forEach(({ user_id, game_id }) => {
            categoryMap[user_id] = game_id;
        });

        return categoryMap;
    }

    static sortStreams(channelData: WatchStreamScored[]): WatchStreamScored[] {
        const positiveChannels = channelData.filter(
            (stream) => stream.score > 0
        );
        const negativeChannels = channelData.filter(
            (stream) => stream.score <= 0
        );

        positiveChannels.sort((a, b) => b.score - a.score);
        negativeChannels.sort((a, b) => b.viewer_count - a.viewer_count);

        return positiveChannels.concat(negativeChannels);
    }

    // eslint-disable-next-line class-methods-use-this
    scoreAndSortStreams(channelData: WatchStream[]): WatchStreamScored[] {
        const categories = TotemPole.buildCategoryMap(channelData);

        const { data } = WatchDataService;
        const scores: {
            [key: string]: {
                num: number;
                div: number;
            };
        } = {};

        data.forEach(({ watched, followedStreams: streams, time }) => {
            const decayFactor = TotemPole.calcDecayFactor(time);

            streams.forEach((stream) => {
                const score = TotemPole.initScore(scores, stream);
                const categoryMultiplier =
                    categories && categories[stream.user_id] === stream.game_id
                        ? CONSTANTS.HEURISTICS.TOTEM_POLE.CATEGORY_WEIGHT
                        : 1;

                const basePoints = streams.length;
                const multiplier = decayFactor * categoryMultiplier;
                const points = basePoints * multiplier;

                if (watched[stream.user_id]) {
                    score.num += points;
                }

                score.div += points;
            });
        });

        // console.log(scores);

        const scoresFinal: { [key: string]: number } = {};

        Object.entries(scores).forEach(([key, val]) => {
            scoresFinal[key] = val.num / val.div;
        });

        // console.log(Object.entries(computed).sort((a, b) => b[1] - a[1]));

        const scored = channelData.map((channel) => ({
            ...channel,
            score: scoresFinal[channel.user_id] || 0,
        }));

        return TotemPole.sortStreams(scored);
    }
}

export const TotemPoleService = new TotemPole();
