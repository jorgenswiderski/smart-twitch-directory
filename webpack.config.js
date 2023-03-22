const path = require("path");

module.exports = {
    mode: "development",
    entry: {
        content: "./app/data/content.jsx",
        background: "./app/data/background.js",
    },
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "[name].js",
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env", "@babel/preset-react"],
                    },
                },
            },
        ],
    },
    resolve: {
        extensions: [".js", ".jsx"],
    },
    // other webpack configurations
    devServer: {
        port: 8080,
        hot: true,
        watchFiles: ["*"],
    },
};
