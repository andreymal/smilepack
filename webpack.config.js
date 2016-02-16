'use strict';

var path = require("path"),
    webpack = require("webpack"),
    ExtractTextPlugin = require("extract-text-webpack-plugin"),
    ManifestRevisionPlugin = require("manifest-revision-webpack-plugin");

var root = "./smilepack/assets";
var isProduction = process.env.NODE_ENV == 'production';

module.exports = {
    entry: {
        landing_js: root + "/scripts/landing.js",
        generator_js: root + "/scripts/generator",
        viewer_js: root + "/scripts/viewer",
        admin_js: root + "/scripts/admin",
        landing_css: root + "/styles/landing.css",
        simplepage_css: root + "/styles/simplepage.css",
        base_css: root + "/styles/base.css",
        widget_collection_css: root + "/styles/widgets/Collection.css",
        generator_css: root + "/styles/generator.css",
        admin_css: root + "/styles/admin.css"
    },
    output: {
        path: "./smilepack/public",
        publicPath: "/assets/",
        filename: "[name].[hash:8].js"
    },
    resolve: {
        extensions: ["", ".js", ".css"]
    },
    module: {
        loaders: [
            {
                test: /\.css/i,
                loader: ExtractTextPlugin.extract("style-loader", "css-loader")
            },
            {
                test: /\.(jpe?g|png|gif|svg)([\?].*)?$/i,
                loader: 'file?context=' + root + '&name=[name].[hash:8].[ext]'
            }
        ]
    },
    plugins: Array.prototype.concat(
        [
            new ExtractTextPlugin("[name].[hash:8].css"),
            new ManifestRevisionPlugin(path.join("smilepack", "manifest.json"), {
                rootAssetPath: root,
                ignorePaths: ["/styles", "/scripts"]
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
