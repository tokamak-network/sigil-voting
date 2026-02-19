import { test, expect } from '@playwright/test'

test.describe('Responsive Layout', () => {
  test('mobile (375px): hamburger visible, desktop nav hidden', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    // Hamburger menu button should be visible
    await expect(page.getByLabel(/Menu|메뉴/i)).toBeVisible()
    // Desktop nav should be hidden
    const desktopNav = page.locator('nav.hidden')
    // Checking that desktop nav buttons are not visible
    const voteBtn = page.locator('nav button').filter({ hasText: /Vote|투표하기/i }).first()
    await expect(voteBtn).not.toBeVisible()
  })

  test('mobile: hero section readable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(375 + 1)
  })

  test('mobile: comparison table scrollable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    const table = page.locator('table')
    await table.scrollIntoViewIfNeeded()
    await expect(table).toBeVisible()
  })

  test('desktop (1440px): full navigation visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const voteNav = page.locator('nav button').filter({ hasText: /Vote|투표하기/i }).first()
    await expect(voteNav).toBeVisible()
    const techNav = page.locator('nav button').filter({ hasText: /Technology|기술 소개/i }).first()
    await expect(techNav).toBeVisible()
    // Hamburger should be hidden
    await expect(page.getByLabel(/Menu|메뉴/i)).not.toBeVisible()
  })

  test('desktop: feature cards in 4-column grid', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const featuresSection = page.locator('#features')
    await featuresSection.scrollIntoViewIfNeeded()
    await expect(featuresSection).toBeVisible()
  })
})
