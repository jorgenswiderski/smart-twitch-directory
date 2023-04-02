const HEURISTICS = {
    TOTEM_POLE: {
        CATEGORY_WEIGHT: 4,
    },
    STREAM_SAGE: {
        TRAINING_PERCENT: 0.75,
    },
    JUICY_PEAR: {
        TRAINING_PERCENT: 0.75,
        RANDOM_SAMPLE: false,
        INCREMENTAL_TRAINING_CHUNK_SIZE: 500,
    },
};

const AGGREGATOR = {
    SAMPLE_INTERVAL: 180000,
};

const TRACKER = {
    HEARTBEAT_INTERVAL: 30000,
};

export const CONSTANTS = { HEURISTICS, AGGREGATOR, TRACKER };
