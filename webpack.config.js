const path = require('path');

const webpack = require('webpack');

// replace accordingly './.env' with the path of your .env file
require('dotenv').config();

module.exports = {
    mode: 'development',
    entry: {
        content: './app/data/content/directory.tsx',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        fallback: {

        },
    },
    // other webpack configurations
    devServer: {
        port: 8080,
        hot: true,
        watchFiles: ['*'],
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env': JSON.stringify(process.env),
        }),
    ],
};
