declare global {
    interface Window {
        models: {} | void;
    }
}

export {}; // This line is needed to make the file a module, ensuring the 'declare global' block is executed
