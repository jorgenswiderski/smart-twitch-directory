import React, { useState, useEffect, useMemo } from "react";
import styled from "styled-components";
// import { TailSpin } from "react-loader-spinner";
import { ChannelCard } from "./channel-card";
import { HelixApi } from "../api/helix";
import { TotemPoleService } from "../models/heuristics/totem-pole";
import { JuicyPearService } from "../models/heuristics/juicy-pear/juicy-pear";
import { error } from "../models/logger";

const GridContainer = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
    grid-gap: 10px;
`;

function HeuristicService() {
    return JuicyPearService() ?? TotemPoleService;
}

export function ChannelsGrid() {
    const [channels, setChannels] = useState([]);
    const [userId, setUserId] = useState();
    const [isLoaded, setIsLoaded] = useState(false);

    async function updateChannels(id: string) {
        try {
            const response = await HelixApi.getStreamsFollowed(id);

            if (response) {
                const channelData = response.data.data;
                const scored = await HeuristicService().scoreAndSortStreams(channelData);
                setChannels(scored);
            }
        } catch (err) {
            error(err)
        }
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
                .catch(error);
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
                // Force change on URL to avoid cache, this allows the thumbnail image to refresh
                thumbnail_url: `${channel.thumbnail_url}?${Date.now()}`
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
