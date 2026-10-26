import { expect, test } from '@playwright/test'

test('a frontend-only deployment reports the missing account service and retry restores onboarding', async ({ page }) => {
  await page.route('**/api/session', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>Static frontend</body></html>' }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign-in is unavailable right now.' })).toBeVisible()
  await expect(page.getByText('Sign-in is not available on this deployment yet. Please contact the workspace administrator.')).toBeVisible()
  await expect(page.locator('.app-shell')).toHaveCount(0)
  await page.unroute('**/api/session')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Big ideas start with you.' })).toBeVisible()
})
