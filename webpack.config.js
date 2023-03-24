const path = require('path');
const TransformJson = require('transform-json-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const packageInfo = require('./package.json')

// replace accordingly './.env' with the path of your .env file
require('dotenv').config();

module.exports = {
    mode: 'development',
    entry: {
        directory: './src/content/directory.tsx',
        "track-watch": './src/content/track-watch.ts',
        background: './src/background/background.ts'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.jsx?$/,
                exclude: path.resolve(__dirname, 'src'),
                enforce: 'pre',
                use: 'source-map-loader'
            },
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                use: 'babel-loader'
            },
        ],
    },
    resolve: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        fallback: {

        },
    },
    devServer: {
        static: './dist',
        port: 8080,
        hot: true,
        watchFiles: ['*'],
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env': JSON.stringify(process.env),
        }),
        new TransformJson({
            source: path.resolve(__dirname, 'src', 'manifest.json'),
            filename: 'manifest.json',
            object: {
                description: packageInfo.description,
                version: packageInfo.version
            }
        }),
        new CopyWebpackPlugin({
            patterns: [
                {from: 'src/static', to: './',},
                {from: 'src/images', to: './images',},
            ]
        }),
    ],
    // For when 1 HTML page can have multiple entry points
    // optimization: {
    //     runtimeChunk: 'single',
    // }
    devtool: 'source-map'
};
