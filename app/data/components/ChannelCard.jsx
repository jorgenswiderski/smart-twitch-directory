import React, { useEffect } from "react";
import styled from "styled-components";

const ChannelContainer = styled.div`
    display: flex;
    flex-direction: column;
    background-color: white;
    border: 1px solid #ddd;
    border-radius: 5px;
    overflow: hidden;
`;

const ChannelImage = styled.img`
    width: 100%;
    height: 150px;
    object-fit: cover;
`;

const ChannelDetails = styled.div`
    padding: 10px;
`;

const ChannelName = styled.div`
    font-weight: bold;
    margin-bottom: 5px;
`;

const ChannelGame = styled.div`
    font-size: 14px;
    margin-bottom: 5px;
`;

const ChannelViewers = styled.div`
    font-size: 14px;
    color: #666;
`;

function ChannelThumbnail({ data, width = 320, height = 180 }) {
    function getThumbnailUrl() {
        return data.thumbnail
            .replace("{width}", width)
            .replace("{height}", height);
    }

    return <ChannelImage src={getThumbnailUrl()} alt={data.name} />;
}

export function ChannelCard({ data }) {
    useEffect(() => {
        console.log(data.thumbnail);
    }, [data]);

    return (
        <ChannelContainer key={data.id}>
            <ChannelThumbnail data={data} />
            <ChannelDetails>
                <ChannelName>{data.name}</ChannelName>
                <ChannelGame>{data.game}</ChannelGame>
                <ChannelViewers>{data.viewers} viewers</ChannelViewers>
            </ChannelDetails>
        </ChannelContainer>
    );
}
