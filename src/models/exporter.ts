import Browser from "webextension-polyfill";
import { log } from "./logger";

// Function to retrieve data from storage
function readFromStorage(): Promise<Record<string, any>> {
    return Browser.storage.local.get(null);
}

// Function to export data to a file
function exportDataToFile(data: Record<string, any>, filename: string) {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.click();

    URL.revokeObjectURL(url);
}

export async function exportData() {
    const data = await readFromStorage();
    exportDataToFile(data, "local_storage_data.json");
    log("Dumped data to file");
}

// export function initExporter() {
//     // Create a context menu item
//     Browser.contextMenus.create({
//         id: "exportLocalStorage",
//         title: "Export Local Storage",
//         contexts: ["browser_action"],
//         onclick: exportData,
//     });

//     log("Added context menu item");
// }
