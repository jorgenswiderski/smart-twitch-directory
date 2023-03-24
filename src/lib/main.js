/**
 * Enable debug mode
 * This allows console.log in a firefox default configuration
 */
require('sdk/preferences/service').set(
    'extensions.sdk.console.logLevel',
    'debug',
);

const { data } = require('sdk/self');
const { ToggleButton } = require('sdk/ui/button/toggle');
const { PageMod } = require('sdk/page-mod');
const { Panel } = require('sdk/panel');

let button;

const popup = Panel({
    contentURL: data.url('popup.html'),
    onHide() {
        button.state('window', { checked: false });
    },
});

// Show the popup when the user clicks the button.
function handleClick(state) {
    if (state.checked) {
        popup.show({
            position: button,
            width: 600,
            height: 400,
        });
    }
}

// Create a button
button = ToggleButton({
    id: 'show-popup',
    label: 'RSS Lector',
    icon: {
        16: './images/icon-16.png',
        32: './images/icon-32.png',
        64: './images/icon-64.png',
    },
    onClick: handleClick,
});

// Create a content script
/* const pageMod = */ PageMod({
    include: ['*twitch.tv/directory/following/live'],
    contentScriptFile: [data.url('content.js')],
    contentStyleFile: [data.url('content.css')],
});

// Create a background script
let bgPage;

browser.runtime.onStartup.addListener(() => {
    browser.runtime.getBackgroundPage().then((page) => {
        bgPage = page;
    });
});
