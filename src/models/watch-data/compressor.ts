/* eslint-disable no-param-reassign */
import pako from "pako";
import { debug } from "../logger";
import { Util } from "../util";
import { ActiveWatch } from "./types";
import { WatchSample, WatchStream } from "./watch-data";

interface WatchSampleDeflated {
    time: number;
    watched: ActiveWatch;
    followedStreams: Partial<WatchStream>[];
}

export class WatchDataCompressor {
    static calculateCompressionRate(
        originalData: any,
        compressedData: ArrayBuffer
    ): number {
        const originalSize = new TextEncoder().encode(
            JSON.stringify(originalData)
        ).byteLength;
        const compressedSize = compressedData.byteLength;
        const compressionRate = (1 - compressedSize / originalSize) * 100;
        return compressionRate;
    }

    static async compressJson(jsonData: any): Promise<ArrayBuffer> {
        const jsonString = JSON.stringify(jsonData);
        const valueMap = new Map<string, string>();
        let nextValueId = 0;

        const replacedString = jsonString.replace(
            /"(?:[^"\\]|\\.)*"/g,
            (value) => {
                if (!valueMap.has(value)) {
                    valueMap.set(value, `@${nextValueId}@`);
                    nextValueId += 1;
                }
                return valueMap.get(value);
            }
        );

        const compressed = pako.deflate(replacedString, { to: "arraybuffer" });
        const valueArray = Array.from(valueMap.entries()).map(([key, id]) => ({
            id,
            value: key,
        }));
        const valueArrayJson = JSON.stringify(valueArray);
        const valueArrayBuffer = new TextEncoder().encode(valueArrayJson);

        const combinedBuffer = new ArrayBuffer(
            valueArrayBuffer.byteLength + compressed.byteLength + 4
        );
        const combinedView = new DataView(combinedBuffer);
        combinedView.setUint32(0, valueArrayBuffer.byteLength, true);
        new Uint8Array(combinedBuffer, 4, valueArrayBuffer.byteLength).set(
            valueArrayBuffer
        );
        new Uint8Array(combinedBuffer, 4 + valueArrayBuffer.byteLength).set(
            new Uint8Array(compressed)
        );

        return combinedBuffer;
    }

    static async decompressJson(buffer: ArrayBuffer): Promise<any> {
        const bufferView = new DataView(buffer);
        const valueArrayBufferLength = bufferView.getUint32(0, true);

        const valueArrayBuffer = buffer.slice(4, 4 + valueArrayBufferLength);
        const compressedBuffer = buffer.slice(4 + valueArrayBufferLength);

        const valueArrayJson = new TextDecoder().decode(valueArrayBuffer);
        const valueArray = JSON.parse(valueArrayJson);
        const valueMap = new Map<string, string>(
            valueArray.map(({ id, value }: { id: string; value: string }) => [
                id,
                value,
            ])
        );

        const decompressedBytes = pako.inflate(compressedBuffer);
        const decompressedString = new TextDecoder().decode(decompressedBytes);

        const restoredString = decompressedString.replace(
            /@\d+@/g,
            (id) => valueMap.get(id) || id
        );
        return JSON.parse(restoredString);
    }

    private static sequentialDeflate(
        baseData: WatchSample[]
    ): WatchSampleDeflated[] {
        const cache = {};
        const data = Util.deepCopy(baseData);

        data.forEach((sample) => {
            sample.followedStreams.forEach((stream) => {
                const streamId = stream.id;

                if (cache[streamId]) {
                    // Remove all key/value pairs from stream which are identical to the cached value
                    const cachedStream = cache[streamId];

                    Object.entries(cachedStream).forEach(([key, value]) => {
                        if (
                            key !== "id" &&
                            key in stream &&
                            (stream[key] === value ||
                                JSON.stringify(stream[key]) ===
                                    JSON.stringify(value))
                        ) {
                            delete stream[key];
                        }
                    });
                } else {
                    cache[streamId] = stream;
                }
            });
        });

        return data;
    }

    private static sequentialInflate(
        baseData: WatchSampleDeflated[]
    ): WatchSample[] {
        const cache = {};
        const data = Util.deepCopy(baseData);

        data.forEach((sample) => {
            sample.followedStreams.forEach((stream) => {
                const streamId = stream.id;

                if (cache[streamId]) {
                    // Restore key/value pairs in the stream based on the cached value
                    const cachedStream = cache[streamId];

                    Object.entries(cachedStream).forEach(([key, value]) => {
                        if (!(key in stream)) {
                            stream[key] = value;
                        }
                    });
                } else {
                    cache[streamId] = stream;
                }
            });
        });

        return data as WatchSample[];
    }

    static async deflate(data: WatchSample[]): Promise<ArrayBuffer> {
        const startTime = Date.now();

        const sequenced = this.sequentialDeflate(data);
        const compressed = await this.compressJson(sequenced);

        // debug(
        //     `Reduced size of watch data by ${this.calculateCompressionRate(
        //         data,
        //         compressed
        //     ).toFixed(2)}%`
        // );

        // const inf = await this.inflate(compressed);

        // if (!Util.compareObjects(data, inf)) {
        //     throw new Error("Failed validation after deflating data");
        // }

        debug(`Deflation took ${(Date.now() - startTime).toFixed(0)} ms.`);

        return compressed;
    }

    static async inflate(compressed: ArrayBuffer): Promise<WatchSample[]> {
        const startTime = Date.now();

        const decompressed = await this.decompressJson(compressed);
        const desequenced = this.sequentialInflate(decompressed);

        debug(`Inflation took ${(Date.now() - startTime).toFixed(0)} ms.`);

        return desequenced;
    }
}
