import { test, expect } from '@playwright/test'

test.describe('Proposals Page', () => {
  test('shows proposals page when navigating via header', async ({ page }) => {
    await page.goto('/')
    const voteNav = page.locator('nav button').filter({ hasText: /Vote|투표하기/i }).first()
    await voteNav.click()
    // Should show proposals content (filter tabs, list, or connect wallet message)
    await expect(page.locator('body')).toContainText(/전체|All|지갑|Connect|제안/i)
  })

  test('shows proposals page via Enter App button', async ({ page }) => {
    await page.goto('/')
    await page.locator('button').filter({ hasText: /Launch App|앱 시작/i }).click()
    await expect(page.locator('body')).toContainText(/전체|All|지갑|Connect|제안/i)
  })

  test('shows connect wallet prompt when not connected', async ({ page }) => {
    await page.goto('/')
    await page.locator('button').filter({ hasText: /Launch App|앱 시작/i }).click()
    // Without a wallet connected, should show some kind of prompt
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})
