import { WatchDataService } from "../watch-data/watch-data";

export function scoreStreams() {
    const { data } = WatchDataService;
    const scores: { [key: string]: { num: number; div: number } } = {};

    data.forEach(({ watched, followedStreams: streams }) => {
        streams.forEach((stream) => {
            scores[stream.user_id] = scores[stream.user_id] || {
                num: 0,
                div: 0,
            };

            if (watched[stream.user_id]) {
                scores[stream.user_id].num +=
                    streams.length - (Object.keys(watched).length + 1) / 2;
                scores[stream.user_id].div += streams.length - 1;
            } else {
                scores[stream.user_id].div += 1;
            }
        });
    });

    const computed: { [key: string]: number } = {};

    Object.entries(scores).forEach(([key, val]) => {
        computed[key] = val.num / val.div;
    });

    // console.log(Object.entries(computed).sort((a, b) => b[1] - a[1]));

    return computed;
}
