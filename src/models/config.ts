function getEnvVarStrict(name: string): string {
    const value = process.env[name];
    // const value = process.env[`REACT_APP_${name}`];

    if (value === undefined) {
        throw Error(`Missing environment variable: ${name}`);
        // throw Error(`Missing environment variable: REACT_APP_${name}`);
    }

    return value;
}

// function getEnvVar(name: string) {
//   return process.env[`REACT_APP_${name}`];
// }

const API = {
    HELIX: {
        CLIENT_ID: getEnvVarStrict("HELIX_CLIENT_ID"),
        // FIXME
        // https://id.twitch.tv/oauth2/authorize?client_id={CLIENT_ID}&redirect_uri=http://localhost:8080&response_type=token&scope=user%3Aread%3Afollows+user%3Aread%3Aemail
        USER_TOKEN: getEnvVarStrict("HELIX_USER_TOKEN"),
    },
};

const DEBUG = {
    LOAD_SAVED_DATA: false,
    DUMP_SAVED_DATA: false,
};

const NOTIFICATIONS = {
    NOTIFY_NEW_STREAMS: true,
    NOTIFY_IMPROVED_STREAMS: true,
    RELATIVE_QUALITY_MINIMUM: 0.4,
    IMPROVEMENT_MINIMUM: 0.6,
};

export const CONFIG = {
    API,
    DEBUG,
    NOTIFICATIONS,
};
