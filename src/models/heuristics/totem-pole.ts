import { WatchDataService } from "../watch-data/watch-data";

function calcDecayFactor(time) {
    const ageInMs = Date.now() - time;
    const ageInDays = ageInMs / 86400000;

    // 3% per day
    return 0.97 ** ageInDays;
}

export function scoreStreams() {
    const { data } = WatchDataService;
    const scores: { [key: string]: { num: number; div: number } } = {};

    data.forEach(({ watched, followedStreams: streams, time }) => {
        const decayFactor = calcDecayFactor(time);

        streams.forEach((stream) => {
            scores[stream.user_id] = scores[stream.user_id] || {
                num: 0,
                div: 0,
            };

            if (watched[stream.user_id]) {
                scores[stream.user_id].num +=
                    (streams.length - (Object.keys(watched).length + 1) / 2) *
                    decayFactor;
                scores[stream.user_id].div +=
                    (streams.length - 1) * decayFactor;
            } else {
                scores[stream.user_id].div += 1 * decayFactor;
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
