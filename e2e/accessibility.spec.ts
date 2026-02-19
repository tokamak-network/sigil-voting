import { test, expect } from '@playwright/test'

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('page has proper heading hierarchy (h1 exists)', async ({ page }) => {
    const h1 = page.locator('h1')
    await expect(h1.first()).toBeVisible()
  })

  test('all images have alt text', async ({ page }) => {
    const images = await page.locator('img').all()
    for (const img of images) {
      const alt = await img.getAttribute('alt')
      expect(alt, `Image missing alt text: ${await img.getAttribute('src')}`).toBeTruthy()
    }
  })

  test('interactive elements are keyboard accessible', async ({ page }) => {
    // Tab to first interactive element
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(['A', 'BUTTON', 'INPUT']).toContain(focused)
  })

  test('FAQ items have aria-expanded attribute', async ({ page }) => {
    const faqItems = page.locator('[aria-expanded]')
    const count = await faqItems.count()
    expect(count).toBeGreaterThanOrEqual(6)
    // All should start collapsed
    for (let i = 0; i < count; i++) {
      await expect(faqItems.nth(i)).toHaveAttribute('aria-expanded', 'false')
    }
  })

  test('language switcher buttons have aria-pressed', async ({ page }) => {
    const enBtn = page.getByLabel('Switch to English')
    const koBtn = page.getByLabel('한국어로 전환')
    await expect(enBtn).toHaveAttribute('aria-pressed')
    await expect(koBtn).toHaveAttribute('aria-pressed')
  })

  test('play button has aria-label', async ({ page }) => {
    const playBtn = page.getByLabel('Play demo video')
    await expect(playBtn).toBeVisible()
  })

  test('header has navigation landmark', async ({ page }) => {
    const header = page.locator('header')
    await expect(header).toBeVisible()
  })

  test('footer has contentinfo landmark', async ({ page }) => {
    const footer = page.locator('footer')
    await footer.scrollIntoViewIfNeeded()
    await expect(footer).toBeVisible()
  })
})
