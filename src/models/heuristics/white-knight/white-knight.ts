import * as _ from "lodash";
import {
    EncodingInstruction,
    EncodingKeys,
    MachineLearningEncoder,
} from "../../ml-encoder/ml-encoder";
import { WatchDataService, WatchStream } from "../../watch-data/watch-data";
import { WatchStreamScored } from "../types";

interface KNNRegressionOptions {
    k: number;
    distanceFunction?: (pointA: number[], pointB: number[]) => number;
}

class KNNRegression {
    private k: number;
    private distanceFunction: (pointA: number[], pointB: number[]) => number;

    constructor(
        private dataset: number[][],
        private labels: number[],
        private encoding: EncodingKeys,
        options: KNNRegressionOptions
    ) {
        this.k = options.k;
        this.distanceFunction =
            options.distanceFunction || KNNRegression.euclideanDistance;
    }

    private static euclideanDistance(
        pointA: number[],
        pointB: number[]
    ): number {
        let sum = 0;

        for (let i = 0; i < pointA.length; i++) {
            sum += Math.pow(pointA[i] - pointB[i], 2);
        }

        return Math.sqrt(sum);
    }

    private getNearestNeighbors(point: number[]): any[] {
        const distances = this.dataset.map((entry, index) => ({
            index,
            distance: this.distanceFunction(point, entry),
        }));

        const sortedByDistance = _.orderBy(distances, ["distance"], ["asc"]);
        return sortedByDistance.slice(0, this.k);
    }

    public predict(stream: WatchStream): number {
        const point = Object.values(
            MachineLearningEncoder.encodeEntry(stream, this.encoding)
        );
        const neighbors = this.getNearestNeighbors(point);
        const sum = neighbors.reduce(
            (acc, neighbor) => acc + this.labels[neighbor.index],
            0
        );
        return sum / this.k;
    }

    static sortStreams(channelData: WatchStreamScored[]): WatchStreamScored[] {
        return channelData.sort((a, b) => b.score - a.score);
    }

    scoreAndSortStreams(streams: WatchStream[]) {
        const scored: WatchStreamScored[] = streams.map((stream) => ({
            ...stream,
            score: this.predict(stream),
        }));

        return KNNRegression.sortStreams(scored);
    }
}

console.log("loading white-knight.ts");

export const WhiteKnightService = (async (): Promise<KNNRegression> => {
    const samples = await WatchDataService.getData();
    const rawData = samples
        .map((sample) =>
            sample.followedStreams.map((stream) => ({
                ...stream,
                watched: sample.watched[stream.user_id] ?? false,
            }))
        )
        .flat();

    const seen = {};
    const deduped = [];

    rawData.forEach((entry) => {
        const json = JSON.stringify(entry);
        if (!seen[json]) {
            seen[json] = true;
            deduped.push(entry);
        }
    });

    const { encoding, data } = MachineLearningEncoder.encodeDataset(deduped, {
        user_id: EncodingInstruction.ONE_HOT,
        game_id: EncodingInstruction.ONE_HOT,
        language: EncodingInstruction.ONE_HOT,
        title: EncodingInstruction.BAG_OF_WORDS,
        viewer_count: EncodingInstruction.NORMALIZE,
        is_mature: EncodingInstruction.BOOLEAN,
        watched: EncodingInstruction.BOOLEAN,
    });

    const dataset = data.map((entry) => {
        const e = {
            ...entry,
        };

        delete e.watched;

        return Object.values(e);
    });

    const labels = data.map((entry) => entry.watched);

    return new KNNRegression(dataset, labels, encoding, { k: 3000 });
})();
