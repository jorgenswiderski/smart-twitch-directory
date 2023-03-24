import React from 'react';
import ReactDOM from 'react-dom';
import { ChannelsGrid } from '../components/channels-grid';

console.log('Loading directory.tsx...');
console.log('Loading grid...');

// Append the new instance to the page
const container = document.createElement('div');
document.body.insertBefore(container, document.body.firstChild);

ReactDOM.render(<ChannelsGrid />, container);
