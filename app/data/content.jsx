// content.jsx
import ChannelsGrid from "./components/ChannelsGrid";
import React from "react";
import ReactDOM from "react-dom";

console.log("Loading extension...");
console.log("Loading grid...");

// Append the new instance to the page
const container = document.createElement("div");
document.body.insertBefore(container, document.body.firstChild);

ReactDOM.render(<ChannelsGrid />, container);
