'use strict';

var path = require("path"),
    webpack = require("webpack"),
    ExtractTextPlugin = require("extract-text-webpack-plugin"),
    ManifestRevisionPlugin = require("manifest-revision-webpack-plugin");

var root = "./smilepack/assets";

module.exports = {
    entry: {
        landing_js: root + "/scripts/landing.js",
        landing_css: root + "/styles/landing.styl"
    },
    output: {
        path: "./smilepack/public",
        publicPath: "/assets/",
        filename: "[name].[hash:8].js"
    },
    resolve: {
        extensions: ["", ".js", ".styl"]
    },
    module: {
        loaders: [
            {
                test: /\.styl/i,
                loader: ExtractTextPlugin.extract("css-loader!stylus-loader")
            },
            {
                test: /\.(jpe?g|png|gif|svg([\?]?.*))$/i,
                loader: 'file?context=' + root + '&name=[name].[hash:8].[ext]'
            }
        ]
    },
    plugins: [
        new ExtractTextPlugin("[name].[hash:8].css"),
        new ManifestRevisionPlugin(path.join("smilepack", "manifest.json"), {
            rootAssetPath: root,
            ignorePaths: ["/styles", "/scripts", "/images"]
        })
    ]
};