const base = require("../../package.json").build;

module.exports = {
  ...base,
  publish: null,
  productName: "Pomelo",
  appId: "com.levidavidspublic.pomelo",
  extraMetadata: {
    ...base.extraMetadata,
    name: "pomelo",
  },
  icon: "packaging/pomelo/icon.png",
  mac: {
    ...base.mac,
    artifactName: "Pomelo-${arch}.${ext}",
  },
  linux: {
    ...base.linux,
    artifactName: "Pomelo-${arch}.${ext}",
  },
  nsis: {
    ...base.nsis,
    artifactName: "Pomelo-Setup.${ext}",
    shortcutName: "Pomelo",
  },
};
