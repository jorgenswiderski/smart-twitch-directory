// eslint-disable-next-line max-classes-per-file
import { Util } from "../../util";
import { WatchStreamWithLabel } from "../../watch-data/watch-data";

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

        // log(
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
            watchedEntries = Util.shuffleArray(watchedEntries, seed).slice(
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
            nonwatchedEntries = Util.shuffleArray(
                nonwatchedEntries,
                seed
            ).slice(0, nonwatchedEntryLimit);
        }

        // log(nonwatchedEntries, watchedEntries);

        const selected = Util.shuffleArray(
            [...nonwatchedEntries, ...watchedEntries],
            seed
        );

        const nonselected = data.filter(
            (entry) => selected.findIndex((e) => e === entry) < 0
        );

        // log(selected, nonselected);

        return [selected, nonselected];
    }
}
