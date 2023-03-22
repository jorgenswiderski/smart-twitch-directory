// content.jsx
import React from 'react';
import ReactDOM from 'react-dom';
import ChannelsGrid from './components/ChannelsGrid';

console.log('Loading extension...');
console.log('Loading grid...');

// Append the new instance to the page
const container = document.createElement('div');
document.body.insertBefore(container, document.body.firstChild);

ReactDOM.render(<ChannelsGrid />, container);