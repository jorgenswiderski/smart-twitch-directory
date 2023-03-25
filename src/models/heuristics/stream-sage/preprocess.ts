import { ActiveWatch } from "../../watch-data/types";
import { WatchDataService } from "../../watch-data/watch-data";

export interface StreamSageTrainingData {
    inputs: StreamSageStream[][];
    outputs: number[][];
}

export interface StreamSageStream {
    user_id: number;
    game_id: number;
    title: string;
    viewer_count: number;
    started_at: string;
    language: string;
    tags: string[];
    is_mature: boolean;
}

export interface StreamSageSample {
    time: number;
    watched: ActiveWatch;
    followedStreams: StreamSageStream[];
}

export async function getStreamSageData(): Promise<StreamSageTrainingData> {
    /*
                // "id": "41997648171",
                "user_id": "71092938",
                // "user_login": "xqc",
                // "user_name": "xQc",
                "game_id": "509658",
                // "game_name": "Just Chatting",
                // "type": "live",
                "title": "⏺️LIVE⏺️CLICK⏺️NOW⏺️DRAMA⏺️MEGA⏺️ULTRA⏺️REACT⏺️WARLORD⏺️GAMEPLAY⏺️GOD⏺️#1 AT EVERYTHING⏺️GENIUS⏺️WATCH ME BECOME⏺️A MINECRAFT⏺️SCIENTIST⏺️",
                "viewer_count": 62079,
                "started_at": "2023-03-24T02:59:00Z",
                "language": "en",
                // "thumbnail_url": "https://static-cdn.jtvnw.net/previews-ttv/live_user_xqc-{width}x{height}.jpg",
                // "tag_ids": [],
                "tags": [],
                "is_mature": false
*/
    await WatchDataService.waitForData();

    const pruned = WatchDataService.data.map((entry) => ({
        ...entry,
        followedStreams: entry.followedStreams.map(
            ({
                user_id,
                game_id,
                title,
                viewer_count,
                started_at,
                language,
                tags,
                is_mature,
            }) => ({
                user_id: Number(user_id),
                game_id: Number(game_id),
                title,
                viewer_count,
                started_at,
                language,
                tags,
                is_mature,
            })
        ),
    }));

    return {
        inputs: pruned.map((entry) => entry.followedStreams),
        outputs: pruned.map((entry) =>
            entry.followedStreams.map((stream) =>
                entry.watched[String(stream.user_id)] ? 1 : 0
            )
        ),
    };
}
