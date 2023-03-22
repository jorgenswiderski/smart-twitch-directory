const path = require('path');

module.exports = {
    mode: 'development',
    entry: {
        content: './app/data/content.tsx',
        background: './app/data/background.ts',
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
    },
    // other webpack configurations
    devServer: {
        port: 8080,
        hot: true,
        watchFiles: ['*'],
    },
};
