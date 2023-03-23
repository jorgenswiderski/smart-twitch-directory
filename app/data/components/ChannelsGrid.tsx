import axios from 'axios';
import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { InfinitySpin, TailSpin } from 'react-loader-spinner';
import { ChannelCard } from './ChannelCard';
import { CONFIG } from '../models/config';

const GridContainer = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    grid-gap: 20px;
`;

export default function ChannelsGrid() {
  const [channels, setChannels] = useState([]);
  const [userId, setUserId] = useState();
  const [isLoaded, setIsLoaded] = useState(false);

  // function authenticate() {
  //     axios
  //         .post("https://id.twitch.tv/oauth2/token", {
  //             client_id: CONFIG.API.HELIX.CLIENT_ID,
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
    return axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': CONFIG.API.HELIX.CLIENT_ID,
        Authorization: `Bearer ${CONFIG.API.HELIX.USER_TOKEN}`,
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
        `https://api.twitch.tv/helix/streams/followed?user_id=${
          userId}`,
        {
          headers: {
            'Client-ID': CONFIG.API.HELIX.CLIENT_ID,
            Authorization: `Bearer ${CONFIG.API.HELIX.USER_TOKEN}`,
          },
        },
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
        }, UPDATE_INTERVAL),
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
        const { data } = response.data;
        const newAvatars = {};

        data.forEach(({ id, profile_image_url }) => {
          newAvatars[id] = profile_image_url;
        });

        setAvatars(newAvatars);
        setIsLoaded(true);
      },
    );
  }, [channels]);

  const userState = useMemo(() => channels.map((channel) => ({ ...channel, avatar_url: avatars[channel.user_id] })), [channels, avatars]);

  return (
    <GridContainer>
      {isLoaded ? (
        userState.map((user) => (
          <ChannelCard data={user} key={user.id as String} />
        ))
      ) : (
        <TailSpin color="#a970ff" />
      )}
    </GridContainer>
  );
}
