import React, { useEffect, useState, useMemo } from "react";
import styled from "styled-components";

function Thumbnail({ data, width = 320, height = 180 }) {
    const url = useMemo(() => {
        return data.thumbnail_url
            .replace("{width}", width)
            .replace("{height}", height);
    }, [data.thumbnail_url, width, height]);

    return (
        <ThumbnailContainer>
            <ChannelImage src={url} alt={data.title} />
            <LiveIndicator>LIVE</LiveIndicator>
            <ViewerText>{data.viewer_count} viewers</ViewerText>
        </ThumbnailContainer>
    );
}

export function ChannelCard({ data }) {
    // useEffect(() => {
    //     console.log(data);
    // }, [data]);

    return (
        <ChannelContainer key={data.id}>
            <Thumbnail data={data} />
            <Details>
                <Avatar
                    src={data.avatar_url}
                    alt={`${data.user_name}'s avatar`}
                />
                <Info>
                    <TitleText>{data.title}</TitleText>
                    <NameText>{data.user_name}</NameText>
                    <CategoryText>{data.game_name}</CategoryText>
                </Info>
            </Details>
        </ChannelContainer>
    );
}

const ChannelContainer = styled.div`
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;

const ThumbnailContainer = styled.div`
    position: relative;
`;

const ChannelImage = styled.img`
    width: 100%;
    height: 150px;
    object-fit: cover;
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
`;

const TitleText = styled(InfoText)`
    font-weight: bold;
    font-size: 14px;
`;

const NameText = styled(InfoText)``;

const CategoryText = styled(InfoText)``;
