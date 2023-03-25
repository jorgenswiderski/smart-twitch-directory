import React, { useState, useEffect, useMemo } from "react";
import styled from "styled-components";
// import { TailSpin } from "react-loader-spinner";
import { ChannelCard } from "./channel-card";
import { HelixApi } from "../api/helix";
import { scoreStreams } from "../models/heuristics/totem-pole";

const GridContainer = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
    grid-gap: 10px;
`;

export function ChannelsGrid() {
    const [channels, setChannels] = useState([]);
    const [userId, setUserId] = useState();
    const [isLoaded, setIsLoaded] = useState(false);

    function injectScores(channelData: any[]) {
        const categoryMap = {};

        channelData.forEach(({user_id, game_id}) => {
            categoryMap[user_id] = game_id;
        });

        const scores = scoreStreams(categoryMap);

        return channelData.map((channel) => ({
            ...channel,
            score: scores[channel.user_id] || 0,
        }))
    }

    function sortChannels(channelData: any[]) {
        const positiveChannels = channelData.filter((stream) => stream.score > 0);
        const negativeChannels = channelData.filter((stream) => stream.score <= 0);

        positiveChannels.sort((a, b) => b.score - a.score);
        negativeChannels.sort((a,b) => b.viewer_count - a.viewer_count);

        return positiveChannels.concat(negativeChannels);
    }

    function updateChannels(id: string) {
        HelixApi.getStreamsFollowed(id).then((response) => {
            if (response) {
                setChannels(sortChannels(injectScores(response.data.data)));
            }
        });
    }

    const [timer, setTimer] = useState();
    const UPDATE_ENABLED = true;
    const UPDATE_INTERVAL = 60000;

    useEffect(() => {
        if (!userId) {
            HelixApi.getUsers()
                .then((response) => {
                    if (response) {
                        setUserId(response.data.data[0].id);
                    }
                })
                .catch((err) => {
                    console.error(err);
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

        HelixApi.getUsers(channels.map((channel) => channel.user_id)).then(
            (response) => {
                if (!response) {
                    return;
                }

                const { data } = response.data;
                const newAvatars = {};

                data.forEach(({ id, profile_image_url }) => {
                    newAvatars[id] = profile_image_url;
                });

                setAvatars(newAvatars);
                setIsLoaded(true);
            }
        );
    }, [channels]);

    const userState = useMemo(
        () =>
            channels.map((channel) => ({
                ...channel,
                avatar_url: avatars[channel.user_id],
            })),
        [channels, avatars]
    );

    return (
        <GridContainer>
            {isLoaded
                ? userState.map((user) => (
                      <ChannelCard data={user} key={user.id as String} />
                  ))
                : // <TailSpin color="#a970ff" />
                  "Loading..."}
        </GridContainer>
    );
}
