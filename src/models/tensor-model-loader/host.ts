import Browser from "webextension-polyfill";
import { error, log } from "../logger";
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

        this.startService()
            .then(() => {
                log(`Initialized ${this.modelName} service.`);
            })
            .catch(error);
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

    listenForUpdates() {
        Browser.storage.local.onChanged.addListener(async (changes) => {
            try {
                if (changes?.[this.modelName]) {
                    await this.loadModel();
                    log("Reloaded Juicy Pear model.");
                }
            } catch (err) {
                log(err);
            }
        });
    }

    async loadModel() {
        this.model = await (this.modelConstructor as any).loadModel();

        if (!this.model) {
            throw new Error(`Failed to load model ${this.modelName}.`);
        }

        // Add to window context, so proxy class can shortcut the proxy if possible
        window.models[this.modelName] = this.model;
    }

    async startService(): Promise<void> {
        await this.loadModel();
        this.registerForRemoteAccess();
        this.listenForUpdates();
    }
}

window.models = {};
