import { RandomForestRegression } from "ml-random-forest";
import { MessageService, MessageType } from "../../messaging";

console.log("init worker-train.ts");

MessageService.listen(
    MessageType.TRAIN_MINOTAUR,
    ({ data }, sender, sendResponse) => {
        const { options, x, y } = data;

        console.log("Building Random Forest model...");

        const model = new RandomForestRegression(options);

        model.train(x, y);

        console.log("Random Forest training complete.");

        const result = model.toJSON();

        sendResponse(result);
    }
);
