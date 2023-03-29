const path = require("path");

module.exports = {
    entry: "ml-random-forest",
    output: {
        filename: "ml-random-forest-bundle.js",
        path: path.resolve(__dirname, "dist"),
        libraryTarget: "umd",
    },
    mode: "production",
    target: "web",
    resolve: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        fallback: 
            {
                "crypto": require.resolve("crypto-browserify"),
                "buffer": require.resolve("buffer/") ,
                "stream": require.resolve("stream-browserify")
            },
    },
};
