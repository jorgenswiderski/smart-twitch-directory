import Browser from "webextension-polyfill";

export enum MessageType {
    WATCHING_PULSE,
    TRAIN_MINOTAUR,
    TRAIN_MINOTAUR_DONE,
    TENSOR_MODEL_LOADER_EXEC,
    TENSOR_MODEL_LOADER_PING,
}

export class MessageService {
    static async send(type: MessageType, data: Object) {
        return Browser.runtime.sendMessage({ type, data });
    }

    static listen(
        type: MessageType,
        callback: (
            message: any,
            sender: Browser.Runtime.MessageSender,
            sendResponse: (response: any) => void
        ) => void
    ) {
        Browser.runtime.onMessage.addListener(
            // eslint-disable-next-line consistent-return
            (message, sender, sendResponse) => {
                if (message.type === type) {
                    callback(message, sender, sendResponse);
                    return true;
                }
            }
        );
    }
}
