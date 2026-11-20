# Pomelo

An independent AI-native Chromium browser.

Work in progress. No compiled browser release is available yet.

The approved product specifications and owner additions are staged on the documentation branch for review. Module and helper checks do not establish full browser or feature-parity acceptance.

## Build a test installer

```sh
npm run desktop:dist -- --config packaging/pomelo/electron-builder.cjs --win nsis
npm run desktop:dist -- --config packaging/pomelo/electron-builder.cjs --linux AppImage
```

The Windows installer installs Pomelo beside Friday and does not replace it.
