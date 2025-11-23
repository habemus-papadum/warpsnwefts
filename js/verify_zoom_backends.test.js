import { test, expect } from '@playwright/test';

test('verify zoom on all backends', async ({ page }) => {
  // Go to the demo page
  // Assuming the server is running on localhost:5173 (Vite default)
  // If not, we might need to start it or assume it's running.
  // For this environment, we can assume we can access the file directly or via a local server if running.
  // Let's try to use the file path first if possible, or localhost.
  // Given the environment, localhost:5173 is likely where `npm run dev` serves.
  await page.goto('http://localhost:5174');

  const backends = ['canvas', 'webgl', 'webgpu', 'svg'];

  for (const backend of backends) {
    console.log(`Testing backend: ${backend}`);
    
    // Select backend
    await page.selectOption('#backend-select', backend);
    
    // Wait for render
    await page.waitForTimeout(500);

    // Move mouse to center to prepare for zoom
    const canvasContainer = page.locator('#canvas-container');
    const box = await canvasContainer.boundingBox();
    if (!box) throw new Error('Canvas container not found');
    
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await page.mouse.move(centerX, centerY);
    
    // Click to activate zoom
    await page.mouse.click(centerX, centerY);
    
    // Wait for zoom render
    await page.waitForTimeout(500);
    
    // Take screenshot
    await page.screenshot({ path: `zoom_${backend}.png` });
    
    // Check for console errors (optional, but good practice)
    // We can't easily capture past console logs here unless we set up a listener earlier.
    // But if the page crashed or threw, Playwright might fail or we can check if canvas exists.
    
    // Click again to deactivate zoom (toggle)
    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(200);
  }
});
