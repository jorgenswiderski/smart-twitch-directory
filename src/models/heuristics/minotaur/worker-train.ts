import { RandomForestRegression } from "ml-random-forest";
import { log } from "../../logger";
import { MessageService, MessageType } from "../../messaging";

log("init worker-train.ts");

MessageService.listen(
    MessageType.TRAIN_MINOTAUR,
    ({ data }, sender, sendResponse) => {
        const { options, x, y } = data;

        log("Building Random Forest model...");

        const model = new RandomForestRegression(options);

        model.train(x, y);

        log("Random Forest training complete.");

        const result = model.toJSON();

        sendResponse(result);
    }
);
