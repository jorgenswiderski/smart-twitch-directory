import React, { useMemo } from 'react';
import styled from 'styled-components';

function Thumbnail({ data, width = 320, height = 180 }) {
  const url = useMemo(() => data.thumbnail_url
    .replace('{width}', width)
    .replace('{height}', height), [data.thumbnail_url, width, height]);

  const countText = useMemo(() => {
    if (data.viewer_count >= 100000) {
      return `${(data.viewer_count / 1000).toFixed(0)}K`;
    } if (data.viewer_count >= 1000) {
      return `${(data.viewer_count / 1000).toFixed(1)}K`;
    }
    return `${data.viewer_count}`;
  }, [data.viewer_count]);

  return (
    <a href={`https://twitch.tv/${data.user_login}`}>
      <ThumbnailContainer>
        <ChannelImage src={url} alt={data.title} />
        <LiveIndicator>LIVE</LiveIndicator>
        <ViewerText>
          {countText}
          {' '}
          viewers
        </ViewerText>
        <ScoreText>{data.score.toFixed(0)}</ScoreText>
      </ThumbnailContainer>
    </a>
  );
}

export function ChannelCard({ data, key }) {
  return (
    <ChannelContainer>
      <Thumbnail data={data} />
      <Details>
        <a href={`https://twitch.tv/${data.user_login}/videos`}>
          <Avatar
            src={data.avatar_url}
            alt={`${data.user_name}'s avatar`}
          />
        </a>
        <Info>
          <a
            href={`https://twitch.tv/${data.user_login}`}
            title={data.title}
          >
            <TitleText>{data.title}</TitleText>
          </a>
          <a href={`https://twitch.tv/${data.user_login}`}>
            <NameText>{data.user_name}</NameText>
          </a>
          <a
            href={`https://twitch.tv/directory/game/${data.game_name}`}
          >
            <CategoryText>{data.game_name}</CategoryText>
          </a>
        </Info>
      </Details>
    </ChannelContainer>
  );
}

const ChannelContainer = styled.div`
    display: flex;
    flex-direction: column;
    overflow: hidden;

    a:link,
    a:visited,
    a:hover,
    a:active {
        text-decoration: none;
        color: inherit;
    }
`;

const ThumbnailContainer = styled.div`
    position: relative;
`;

const ChannelImage = styled.img`
    width: 100%;
`;

const LiveIndicator = styled.div`
    position: absolute;
    top: 10px;
    left: 10px;
    background-color: red;
    font-size: 13px;
    line-height: 150%;
    font-weight: 600;
    padding: 0px 5px;
    border-radius: 3px;
    text-transform: capitalize;
`;

const ViewerText = styled.div`
    position: absolute;
    bottom: 10px;
    left: 10px;
    font-size: 13px;
    line-height: 150%;
    background-color: #0007;
    padding: 0px 5px;
    border-radius: 3px;
`;

const ScoreText = styled(ViewerText)`
    bottom: unset;
    left: unset;
    top: 10px;
    right: 10px;
`;

const Details = styled.div`
    display: flex;
    padding: 10px;
    align-items: center;
`;

const Avatar = styled.img`
    width: 40px;
    height: 40px;
    border-radius: 50%;
    margin-right: 10px;
    overflow: hidden;
`;

const Info = styled.div`
    flex: 1;
    gap: 3px;
    display: flex;
    flex-direction: column;
`;

const InfoText = styled.div`
    font-size: 13px;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    color: rgb(173, 173, 184);
`;

const TitleText = styled(InfoText)`
    font-weight: bold;
    font-size: 14px;
    color: inherit;
`;

const NameText = styled(InfoText)``;

const CategoryText = styled(InfoText)``;
