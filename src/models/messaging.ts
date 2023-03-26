import browser from "webextension-polyfill";

export enum MessageType {
    WATCHING_PULSE,
}

export class MessageService {
    static send(type: MessageType, data: Object) {
        return browser.runtime.sendMessage({ type, data });
    }

    static listen(
        type: MessageType,
        callback: (
            message: any,
            sender: browser.Runtime.MessageSender,
            sendResponse
        ) => void
    ) {
        browser.runtime.onMessage.addListener(
            (message, sender, sendResponse) => {
                if (message.type === type) {
                    callback(message, sender, sendResponse);
                }
            }
        );
    }
}
