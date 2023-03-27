import { WatchStream } from "../watch-data/watch-data";

export interface WatchStreamScored extends WatchStream {
    score: number;
}

export interface HeuristicService {
    scoreAndSortStreams: (channelData: WatchStream[]) => WatchStreamScored[];
}
