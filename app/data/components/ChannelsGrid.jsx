import axios from "axios";
import axiosJsonp from "axios-jsonp";
import React, { useState, useEffect, useMemo } from "react";
import styled from "styled-components";
import { ChannelCard } from "./ChannelCard";

const GridContainer = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    grid-gap: 20px;
`;

const sampleData = [
    {
        id: "987654321",
        name: "twitchuser1",
        game: "Fortnite",
        viewers: 1000,
        thumbnail: "https://link.to.thumbnail/image.jpg",
    },
    {
        id: "123456789",
        name: "twitchuser2",
        game: "Apex Legends",
        viewers: 2000,
        thumbnail: "https://link.to.thumbnail/image2.jpg",
    },
    {
        id: "135790864",
        name: "twitchuser3",
        game: "Overwatch",
        viewers: 500,
        thumbnail: "https://link.to.thumbnail/image3.jpg",
    },
];

export default function ChannelsGrid() {
    const [channels, setChannels] = useState([]);
    const [userId, setUserId] = useState();

    // function authenticate() {
    //     axios
    //         .post("https://id.twitch.tv/oauth2/token", {
    //             client_id: API_CLIENT_ID,
    //             client_secret: API_SECRET,
    //             grant_type: "client_credentials",
    //         })
    //         .then((response) => {
    //             setToken(response.data.access_token);
    //         })
    //         .catch((err) => {
    //             console.log("err");
    //             console.error(err);
    //         });
    // }

    function fetchUserInfo(users = []) {
        return axios.get("https://api.twitch.tv/helix/users", {
            headers: {
                "Client-ID": API_CLIENT_ID,
                Authorization: "Bearer " + API_USER_TOKEN,
            },
            params: {
                id: users,
            },
        });
    }

    function updateChannels(userId) {
        // Fetch the list of live channels from Twitch API
        return axios
            .get(
                "https://api.twitch.tv/helix/streams/followed?user_id=" +
                    userId,
                {
                    headers: {
                        "Client-ID": API_CLIENT_ID,
                        Authorization: "Bearer " + API_USER_TOKEN,
                    },
                }
            )
            .then((response) => {
                setChannels(response.data.data);
            })
            .catch((error) => {
                console.error(error);
            });
    }

    const [timer, setTimer] = useState();
    const UPDATE_ENABLED = true;
    const UPDATE_INTERVAL = 60000;

    useEffect(() => {
        if (!userId) {
            fetchUserInfo().then((response) => {
                setUserId(response.data.data[0].id);
            });
            return;
        }

        updateChannels(userId);

        if (UPDATE_ENABLED) {
            if (timer) {
                clearInterval(timer);
            }

            setTimer(
                setInterval(() => {
                    updateChannels(userId);
                }, UPDATE_INTERVAL)
            );
        }
    }, [userId]);

    const [avatars, setAvatars] = useState({});

    useEffect(() => {
        if (channels.length <= 0) {
            return;
        }

        fetchUserInfo(channels.map((channel) => channel.user_id)).then(
            (response) => {
                const data = response.data.data;
                const newAvatars = {};

                data.forEach(({ id, profile_image_url }) => {
                    newAvatars[id] = profile_image_url;
                });

                setAvatars(newAvatars);
            }
        );
    }, [channels]);

    const userState = useMemo(() => {
        return channels.map((channel) => {
            return { ...channel, avatar_url: avatars[channel.user_id] };
        });
    }, [channels, avatars]);

    return (
        <GridContainer>
            {userState.map((user) => (
                <ChannelCard data={user} key={user.id} />
            ))}
        </GridContainer>
    );
}
