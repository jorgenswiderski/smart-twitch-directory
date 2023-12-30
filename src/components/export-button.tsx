import React from "react";
import styled from "styled-components";
import { exportData } from "../models/exporter";

const Button = styled.button``;

export function ExportButton() {
    return <Button onClick={exportData()} />
}
