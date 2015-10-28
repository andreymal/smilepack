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
        filename: "[hash:8]/[name].js"
    },
    resolve: {
        extensions: ["", ".js", ".styl"]
    },
    module: {
        loaders: [
            {
                test: /\.styl/i,
                loader: ExtractTextPlugin.extract("css!stylus")
            }
        ]
    },
    plugins: [
        new ExtractTextPlugin("[hash:8]/[name].css"),
        new ManifestRevisionPlugin(path.join("smilepack", "manifest.json"), {
            rootAssetPath: root,
            ignorePaths: ["/styles", "/scripts"]
        })
    ]
};