console.log("Background script running");

browser.runtime.onInstalled.addListener(() => {
    console.log("Extension installed");
});

browser.browserAction.onClicked.addListener(() => {
    console.log("Browser action clicked");
});
