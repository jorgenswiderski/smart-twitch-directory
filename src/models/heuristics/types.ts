import { WatchStream } from "../watch-data/types";

export interface WatchStreamScored extends WatchStream {
    score: number;
}

export interface HeuristicService {
    scoreAndSortStreams: (channelData: WatchStream[]) => WatchStreamScored[];
}
