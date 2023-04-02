import { MessageService, MessageType } from "../messaging";

/**
 * TensorModelHost class is responsible for hosting a model and providing remote access
 * to the model's methods and properties for other scripts. This avoids multiple
 * instantiations of identical models, and is necessary to prevent Tensorflow.js from
 * running into errors caused by redeclaring tensor variables.
 *
 * @template Constructor - The type of the model constructor.
 * @template Model - The type of the model instance.
 */
export class TensorModelHost<Constructor, Model> {
    modelName: string;

    model: Model;

    constructor(private modelConstructor: Constructor) {
        this.modelName = (this.modelConstructor as any).modelName;

        this.startService().catch(console.error);
    }

    registerForRemoteAccess() {
        MessageService.listen(
            MessageType.TENSOR_MODEL_LOADER_EXEC,
            async (
                { data: { modelName, key, args } },
                sender,
                sendResponse
            ) => {
                if (this.modelName !== modelName) {
                    return;
                }

                if (typeof this.model[key] === "function") {
                    const results = await this.model[key](...args);
                    sendResponse(results);
                } else {
                    sendResponse(this.model[key]);
                }
            }
        );

        MessageService.listen(
            MessageType.TENSOR_MODEL_LOADER_PING,
            async (msg, sender, sendResponse) => sendResponse("pong")
        );
    }

    release: (value: void | PromiseLike<void>) => void;

    async startService(): Promise<void> {
        this.model = await (this.modelConstructor as any).loadModel();
        this.registerForRemoteAccess();
    }
}

// Browser.storage.local.onChanged.addListener(async (changes) => {
//     try {
//         if (changes?.[PairwiseLtr.modelName]) {
//             // Reload the model
//             const promise = PairwiseLtr.loadModel();
//             await promise;
//             JuicyPearService = promise;
//             console.log("Reloaded Juicy Pear model.");
//         }
//     } catch (err) {
//         console.log(err);
//     }
// });
