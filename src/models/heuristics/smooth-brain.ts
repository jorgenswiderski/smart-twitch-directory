import { log } from "../logger";
import { WatchDataService } from "../watch-data/watch-data";

export function scoreStreams() {
    const { data } = WatchDataService;
    const scores = {};

    data.forEach((sample) => {
        const count = sample.followedStreams.length;
        const totalPoints = count ** (2 / 3);
        const shareUp = totalPoints / Object.keys(sample.watched).length;
        const shareDown =
            totalPoints / (count - Object.keys(sample.watched).length);

        sample.followedStreams.forEach((stream) => {
            scores[stream.user_id] = scores[stream.user_id] || 0;

            if (sample.watched[stream.user_id]) {
                scores[stream.user_id] += shareUp;
            } else {
                scores[stream.user_id] -= shareDown;
            }
        });
    });

    log(
        Object.entries(scores).sort(
            (a, b) => (b[1] as number) - (a[1] as number)
        )
    );

    return scores;
}
