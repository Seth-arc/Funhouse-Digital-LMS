const { test, expect } = require('@playwright/test');

test('debug splash dismiss', async ({ page }) => {
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  const splash = page.locator('.splash-root');
  console.log('splash visible initially', await splash.isVisible());
  const btn = page.locator('.splash-arrow-btn');
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  console.log('button visible, class before click:', await splash.getAttribute('class'));
  await btn.click({ force: true });
  await page.waitForTimeout(1000);
  console.log('class after click 1s:', await splash.getAttribute('class'));
  await page.waitForTimeout(2000);
  console.log('class after click 3s:', await splash.getAttribute('class'));
  console.log('splash visible after 3s', await splash.isVisible().catch(() => false));
});
