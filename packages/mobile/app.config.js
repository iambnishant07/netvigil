// Dynamic config so googleServicesFile can be injected via EAS secret file env var.
// Locally: reads ./google-services.json (gitignored — place it manually).
// EAS build: GOOGLE_SERVICES_JSON is set to a temp file path by EAS.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
