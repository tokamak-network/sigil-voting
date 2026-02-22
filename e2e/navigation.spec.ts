import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('navigates from landing to proposals via Enter App button', async ({ page }) => {
    // Click the "Launch App" / "앱 시작" CTA link
    const enterLink = page.getByRole('link', { name: /Launch App|앱 시작/i })
    await enterLink.click()
    await expect(page).toHaveURL(/\/vote/)
  })

  test('navigates via header Vote button', async ({ page }) => {
    // Click Vote in the desktop nav
    const voteNav = page.locator('nav a').filter({ hasText: /Vote|투표하기/i }).first()
    await voteNav.click()
    await expect(page).toHaveURL(/\/vote/)
  })

  test('navigates to Technology page', async ({ page }) => {
    const techNav = page.locator('nav a').filter({ hasText: /Technology|기술 소개/i }).first()
    await techNav.click()

    // Technology page should be visible
    await expect(page).toHaveURL(/\/technology/)
    await expect(page.locator('body')).toContainText(/MACI|Groth16|Poseidon/i)
  })

  test('language switcher toggles between ko and en', async ({ page }) => {
    // Default is Korean. Click EN to switch to English.
    const enBtn = page.getByLabel('Switch to English')
    await enBtn.click()

    // After switching to English, the hero CTA should say "Launch App"
    await expect(page.getByRole('link', { name: 'Launch App' })).toBeVisible()

    // Switch back to Korean
    const koBtn = page.getByLabel('한국어로 전환')
    await koBtn.click()

    // After switching to Korean, the hero CTA should say "앱 시작"
    await expect(page.getByRole('link', { name: /앱 시작/ })).toBeVisible()
  })

  test('mobile menu opens and closes', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 })

    // Click hamburger menu
    const menuBtn = page.getByLabel(/Menu|메뉴/i)
    await menuBtn.click()

    // Mobile nav should be visible
    const mobileNav = page.locator('nav.absolute, nav.fixed').first()
    await expect(mobileNav).toBeVisible()

    // Click overlay or menu button again to close
    await menuBtn.click()
    await expect(mobileNav).not.toBeVisible()
  })
})
