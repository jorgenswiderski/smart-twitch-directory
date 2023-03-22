console.log("Background script running");

browser.runtime.onInstalled.addListener(() => {
    console.log("Extension installed");
});

browser.browserAction.onClicked.addListener(() => {
    console.log("Browser action clicked");
});

// browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     if (message.name === "exposeFunction") {
//         const module = window[message.module];
//         const func = module[message.function];
//         const tabId = message.tabId;
//         const options = { defineAs: message.function };

//         browser.tabs.executeScript(
//             tabId,
//             {
//                 code: `(${exportFunction.toString()})(window.${
//                     message.function
//                 }, ${JSON.stringify(options)})`,
//             },
//             () => {
//                 sendResponse({ success: true });
//             }
//         );
//     }
// });

// function exportFunction(functionToExport, exportOptions = {}) {
//     const exportName = exportOptions.defineAs || functionToExport.name;

//     // Expose the function to the content script:
//     const exported = {};
//     exported[exportName] = functionToExport;
//     browser.runtime.sendNativeMessage("browser-extension@Twitch Helper", {
//         type: "exportFunction",
//         payload: exported,
//     });
// }
