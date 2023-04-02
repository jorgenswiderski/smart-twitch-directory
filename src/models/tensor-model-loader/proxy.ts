import { MessageService, MessageType } from "../messaging";

/**
 * TensorModelProxy class creates a proxy object to interact with a TensorModelHost that exists in a different context.
 * It forwards method calls and property access to the remote model through messaging.
 *
 * Note: All inputs and outputs to proxied properties must be JSON-serializable!
 *
 * @template Constructor - The type of the model constructor.
 * @template Model - The type of the model instance.
 * @template ModelInterface - The type of the interface that the proxy object should implement.
 */
export class TensorModelProxy<Constructor, Model, ModelInterface> {
    modelName: string;

    constructor(private modelConstructor: Constructor) {
        this.modelName = (this.modelConstructor as any).modelName;
        this.createProxy();
    }

    async accessRemoteKey(key: string, ...args: any[]) {
        return MessageService.send(MessageType.TENSOR_MODEL_LOADER_EXEC, {
            modelName: this.modelName,
            key,
            args,
        });
    }

    // Wait for an environment to start the service by checking the status of the lock
    static async waitForService() {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const response = await MessageService.send(
                MessageType.TENSOR_MODEL_LOADER_PING,
                {}
            );

            if (response) {
                break;
            }
        }
    }

    proxy: ModelInterface;

    // Define a proxy object which will augment this class with the interface defined by "ModelInterface"
    // Under the hood the proxy will ferry the function calls via messages to the environment that holds the lock
    createProxy(): void {
        // Save loader to local scope so handler function can access it;
        const loader = this;

        // Create a dummy model that we can leverage for checking whether a key is a property or a function
        const dummyModel: Model = new (this.modelConstructor as any)();

        const handler = {
            get(
                target: object,
                key: string
                // receiver: object
            ) {
                if (typeof dummyModel[key] === "function") {
                    return async (...args: any[]) => {
                        await TensorModelProxy.waitForService();
                        return loader.accessRemoteKey(key, ...args);
                    };
                }

                return TensorModelProxy.waitForService().then(() =>
                    loader.accessRemoteKey(key)
                );
            },
        };

        const proxy = new Proxy({}, handler);

        this.proxy = proxy as ModelInterface;
    }
}
