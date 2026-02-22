import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('renders the hero section', async ({ page }) => {
    // Should have the main heading
    const h1 = page.locator('h1')
    await expect(h1).toBeVisible()
  })

  test('displays the SIGIL brand in header', async ({ page }) => {
    await expect(page.getByText('SIGIL').first()).toBeVisible()
  })

  test('renders Core Features section', async ({ page }) => {
    const features = page.locator('#features')
    await expect(features).toBeVisible()
  })

  test('renders the Developer SDK section', async ({ page }) => {
    const sdk = page.locator('#sdk')
    await sdk.scrollIntoViewIfNeeded()
    await expect(sdk).toBeVisible()
  })

  test('FAQ accordion expands and collapses', async ({ page }) => {
    // Find first FAQ item
    const faqItem = page.locator('[aria-expanded]').first()
    await expect(faqItem).toHaveAttribute('aria-expanded', 'false')

    await faqItem.click()
    await expect(faqItem).toHaveAttribute('aria-expanded', 'true')

    await faqItem.click()
    await expect(faqItem).toHaveAttribute('aria-expanded', 'false')
  })

  test('try-it-now CTA is visible', async ({ page }) => {
    const cta = page.getByRole('link', { name: /Try on Sepolia Testnet|Sepolia 테스트넷에서 체험/i })
    await cta.scrollIntoViewIfNeeded()
    await expect(cta).toBeVisible()
  })

  test('has footer with social links', async ({ page }) => {
    const footer = page.locator('footer')
    await footer.scrollIntoViewIfNeeded()
    await expect(footer).toBeVisible()
    // Should have GitHub link
    await expect(footer.locator('a[href*="github.com"]').first()).toBeVisible()
  })
})
