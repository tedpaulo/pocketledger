const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite web runs SQLite as a WebAssembly asset inside a web worker.
config.resolver.assetExts.push('wasm');

module.exports = config;
