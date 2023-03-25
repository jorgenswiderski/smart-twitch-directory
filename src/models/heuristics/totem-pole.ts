import { CONSTANTS } from "../constants";
import { WatchDataService } from "../watch-data/watch-data";

function calcDecayFactor(time) {
    const ageInMs = Date.now() - time;
    const ageInDays = ageInMs / 86400000;

    // 3% per day
    return 0.97 ** ageInDays;
}

function initScore(scores, stream) {
    scores[stream.user_id] = scores[stream.user_id] || {
        num: 0,
        div: 0,
    };

    return scores[stream.user_id];
}

export function scoreStreams(categories?: { [key: string]: string }) {
    // console.log(categories);

    const { data } = WatchDataService;
    const scores: {
        [key: string]: {
            num: number;
            div: number;
        };
    } = {};

    data.forEach(({ watched, followedStreams: streams, time }) => {
        const decayFactor = calcDecayFactor(time);

        streams.forEach((stream) => {
            const score = initScore(scores, stream);
            const categoryMultiplier =
                categories && categories[stream.user_id] === stream.game_id
                    ? CONSTANTS.HEURISTICS.TOTEM_POLE.CATEGORY_WEIGHT
                    : 1;

            const multiplier = decayFactor * categoryMultiplier;

            if (watched[stream.user_id]) {
                score.num +=
                    (streams.length - (Object.keys(watched).length + 1) / 2) *
                    multiplier;
                score.div += (streams.length - 1) * multiplier;
            } else {
                score.div += 1 * multiplier;
            }
        });
    });

    // console.log(scores);

    const computed: { [key: string]: number } = {};

    Object.entries(scores).forEach(([key, val]) => {
        computed[key] = val.num / val.div;
    });

    // console.log(Object.entries(computed).sort((a, b) => b[1] - a[1]));

    return computed;
}
