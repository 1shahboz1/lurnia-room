module.exports = {
  testDir: './tests',
  timeout: 60000,
  use: {
    headless: false, // Run with visible browser so we can see what's happening
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
};