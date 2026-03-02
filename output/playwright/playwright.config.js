// temp config for local UI smoke runs
module.exports = {
  testDir: '.',
  timeout: 60000,
  reporter: 'line',
  use: {
    headless: true,
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: true,
  },
  outputDir: './test-results',
};
