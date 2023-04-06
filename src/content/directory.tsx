import React from 'react';
import ReactDOM from 'react-dom';
import { ChannelsGrid } from '../components/channels-grid';
import { debug } from '../models/logger';

debug('Loading directory.tsx...');

function injectChannelsGrid(header) {
    const liveChannelsContent = header.nextElementSibling;

    // Append the new instance to the page
    const container = document.createElement('div');
    liveChannelsContent.insertAdjacentElement('afterend', container);
    ReactDOM.render(<ChannelsGrid />, container);

    // Hide the original content
    liveChannelsContent.style.display = "none";
}

// Use MutationObserver to wait for the liveChannelsHeader element to be added to the DOM
const observer = new MutationObserver((mutationsList) => {
    // eslint-disable-next-line no-restricted-syntax
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList') {
        const liveChannelsHeader = document.querySelector('header[aria-label="Live channels"]');
        if (liveChannelsHeader) {
          observer.disconnect(); // stop observing changes
          injectChannelsGrid(liveChannelsHeader);
          break;
        }
      }
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
