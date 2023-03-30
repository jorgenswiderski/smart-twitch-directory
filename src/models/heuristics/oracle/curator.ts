// eslint-disable-next-line max-classes-per-file
import { WatchStreamWithLabel } from "../../watch-data/watch-data";

class SeededRNG {
    private seed: number;

    constructor(seed: number) {
        this.seed = seed % 2147483647;
        if (this.seed <= 0) this.seed += 2147483646;
    }

    random(): number {
        return (this.seed = (this.seed * 16807) % 2147483647) / 2147483647;
    }
}

function shuffleArray<T>(array: T[], seed?: number): T[] {
    const newArray = [...array];
    const rng = seed !== undefined ? new SeededRNG(seed) : Math;

    for (let i = newArray.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }

    return newArray;
}

export class OracleCurator {
    static deduplicate(data: any[]): any[] {
        const seen: { [key: string]: boolean } = {};
        const filtered = [];

        data.forEach((entry) => {
            const stringified = JSON.stringify(entry);
            if (!seen[stringified]) {
                filtered.push(entry);
                seen[stringified] = true;
            }
        });

        // console.log(
        //     `Removed ${data.length - filtered.length} duplicate entries.`
        // );

        return filtered;
    }

    static sample(
        data: WatchStreamWithLabel[],
        maxSize: number,
        seed?: number
    ): WatchStreamWithLabel[][] {
        const watchedStreamers = {};

        data.forEach((entry) => {
            if (entry.watched) {
                watchedStreamers[entry.user_id] = true;
            }
        });

        const watchedEntryLimit = Math.ceil(maxSize * (1 / 3));
        let watchedEntries = data.filter(
            (entry) => watchedStreamers[entry.user_id]
        );

        if (watchedEntries.length > watchedEntryLimit) {
            // TODO: select entries with a bias towards newer entries
            watchedEntries = shuffleArray(watchedEntries, seed).slice(
                0,
                watchedEntryLimit
            );
        }

        const nonwatchedEntryLimit = maxSize - watchedEntries.length;
        let nonwatchedEntries = data.filter(
            (entry) => !watchedStreamers[entry.user_id]
        );

        if (nonwatchedEntries.length > nonwatchedEntryLimit) {
            // TODO: select entries with a bias towards newer entries
            nonwatchedEntries = shuffleArray(nonwatchedEntries, seed).slice(
                0,
                nonwatchedEntryLimit
            );
        }

        // console.log(nonwatchedEntries, watchedEntries);

        const selected = shuffleArray(
            [...nonwatchedEntries, ...watchedEntries],
            seed
        );

        const nonselected = data.filter(
            (entry) => selected.findIndex((e) => e === entry) < 0
        );

        // console.log(selected, nonselected);

        return [selected, nonselected];
    }
}
