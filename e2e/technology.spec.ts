import { test, expect } from '@playwright/test'

test.describe('Technology Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    const techNav = page.locator('nav button').filter({ hasText: /Technology|기술 소개/i }).first()
    await techNav.click()
  })

  test('renders the technology page heading', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible()
  })

  test('displays three technology pillars', async ({ page }) => {
    await expect(page.getByText(/01\./)).toBeVisible()
    await expect(page.getByText(/02\./)).toBeVisible()
    await expect(page.getByText(/03\./)).toBeVisible()
  })

  test('contains cryptographic content', async ({ page }) => {
    const body = await page.locator('body').textContent()
    expect(body).toMatch(/Poseidon|Groth16|ECDH|EdDSA/i)
  })

  test('renders code examples', async ({ page }) => {
    const codeBlocks = page.locator('code, pre')
    await expect(codeBlocks.first()).toBeVisible()
  })

  test('is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.locator('h1')).toBeVisible()
    // Content should still be readable
    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(100)
  })
})
