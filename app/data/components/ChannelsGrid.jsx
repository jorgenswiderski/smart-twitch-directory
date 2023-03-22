import axios from "axios";
import axiosJsonp from "axios-jsonp";
import React, { useState, useEffect } from "react";
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

// FIXME NOW
const API_CLIENT_ID = "";
const API_SECRET = "";

// https://id.twitch.tv/oauth2/authorize?client_id=&redirect_uri=http://localhost:8080&response_type=token&scope=user%3Aread%3Afollows+user%3Aread%3Aemail
const API_USER_TOKEN = "";

export default function ChannelsGrid() {
    const [channels, setChannels] = useState([]);
    // const [token, setToken] = useState();
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

    function fetchUserInfo() {
        axios
            .get("https://api.twitch.tv/helix/users", {
                headers: {
                    "Client-ID": API_CLIENT_ID,
                    Authorization: "Bearer " + API_USER_TOKEN,
                },
            })
            .then((response) => {
                setUserId(response.data.data[0].id);
            });
    }

    function updateChannels(userId) {
        // Fetch the list of live channels from Twitch API
        axios
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
                const channels = response.data.data.map((stream) => ({
                    id: stream.id,
                    name: stream.title,
                    game: stream.game_name,
                    viewers: stream.viewer_count,
                    thumbnail: stream.thumbnail_url,
                }));
                setChannels(channels);
            })
            .catch((error) => {
                console.error(error);
            });
    }

    useEffect(() => {
        if (!userId) {
            fetchUserInfo();
            return;
        }

        console.log("user id is " + userId);

        updateChannels(userId);
    }, [userId]);

    return (
        <GridContainer>
            {channels.map((channel) => (
                <ChannelCard data={channel} key={channel.id} />
            ))}
        </GridContainer>
    );
}
