import axios from "axios";
import { CONFIG } from "../models/config";

export const HelixApi = {
    getStreams(options: {
        userId?: string[];
        userLogin?: string[];
        gameId?: string[];
        type?: "all" | "live";
        language?: string[];
        first?: number;
        before?: string;
        after?: string;
    }) {
        return axios
            .get("https://api.twitch.tv/helix/streams", {
                headers: {
                    "Client-ID": CONFIG.API.HELIX.CLIENT_ID,
                    Authorization: `Bearer ${CONFIG.API.HELIX.USER_TOKEN}`,
                },
                params: {
                    user_id: options.userId,
                    user_login: options.userLogin,
                    game_id: options.gameId,
                    type: options.type,
                    language: options.language,
                    first: options.first,
                    before: options.before,
                    after: options.after,
                },
            })
            .catch((err) => {
                console.error(err);
            });
    },

    getUsers(users: string[] = []) {
        return axios
            .get("https://api.twitch.tv/helix/users", {
                headers: {
                    "Client-ID": CONFIG.API.HELIX.CLIENT_ID,
                    Authorization: `Bearer ${CONFIG.API.HELIX.USER_TOKEN}`,
                },
                params: {
                    id: users,
                },
            })
            .catch((err) => {
                console.error(err);
            });
    },

    getStreamsFollowed(userId: string) {
        // Fetch the list of live channels from Twitch API
        return axios
            .get(
                `https://api.twitch.tv/helix/streams/followed?user_id=${userId}`,
                {
                    headers: {
                        "Client-ID": CONFIG.API.HELIX.CLIENT_ID,
                        Authorization: `Bearer ${CONFIG.API.HELIX.USER_TOKEN}`,
                    },
                }
            )
            .catch((error) => {
                console.error(error);
            });
    },
};
