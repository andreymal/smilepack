'use strict';

var path = require("path"),
    webpack = require("webpack"),
    ExtractTextPlugin = require("extract-text-webpack-plugin"),
    ManifestRevisionPlugin = require("manifest-revision-webpack-plugin");

var root = path.join(__dirname, "smilepack", "assets");
var isProduction = process.env.NODE_ENV == 'production';

module.exports = {
    context: root,
    entry: {
        landing_js: "landing.js",
        generator_js: "generator",
        landing_css: "landing.css",
        generator_css: "generator.css"
    },
    output: {
        path: path.join(__dirname, "smilepack", "public"),
        publicPath: "/assets/",
        filename: "[name].[hash:8].js"
    },
    resolve: {
        modulesDirectories: ['node_modules', 'scripts', 'styles'],
        extensions: ["", ".js", ".css", ".styl"]
    },
    module: {
        loaders: [
            {
                test: /\.css/i,
                loader: ExtractTextPlugin.extract("style-loader", "css-loader")
            },
            {
                test: /\.styl/i,
                loader: ExtractTextPlugin.extract("css-loader!stylus-loader")
            },
            {
                test: /\.(jpe?g|png|gif|svg([\?]?.*))$/i,
                loader: 'file?name=[name].[hash:8].[ext]'
            }
        ]
    },
    plugins: Array.prototype.concat(
        [
            new ExtractTextPlugin("[name].[hash:8].css"),
            new ManifestRevisionPlugin(path.join(__dirname, "smilepack", "manifest.json"), {
                rootAssetPath: root,
                ignorePaths: ["styles", "scripts", "images"]
            })
        ],
        isProduction ? [
            new webpack.optimize.UglifyJsPlugin(),
            new webpack.DefinePlugin({
                "process.env": {
                    NODE_ENV: '"production"'
                }
            }),
            new webpack.NoErrorsPlugin()
        ] : []
    )
};
