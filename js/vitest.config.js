import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    // Force IPv4 loopback to avoid environments that block ::1
    server: {
      host: '127.0.0.1',
    },
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        {
          browser: 'chromium',
          headless: true,
        },
      ],
    },
  },
});
