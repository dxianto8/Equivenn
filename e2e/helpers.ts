import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

export const testPassword = 'A long test passphrase 42!'

export async function onboard(page: Page, { budget = 120000 } = {}) {
  const email = `student-${randomUUID()}@northbridge.edu`
  await page.goto('/')
  await page.getByLabel('Full name', { exact: true }).fill('Jamie Lewis')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(testPassword)
  await page.getByRole('button', { name: 'Create my account', exact: true }).click()
  await page.getByLabel('School name', { exact: true }).fill('Northbridge University')
  await page.getByLabel('School domain', { exact: true }).fill('northbridge.edu')
  await page.getByLabel('Your school email', { exact: true }).fill(email)
  await page.getByRole('button', { name: 'Connect my school', exact: true }).click()
  await page.getByLabel('Workspace name', { exact: true }).fill('Student Council')
  await page.getByLabel('Your funding pool (USD)', { exact: true }).fill(String(budget))
  await page.getByRole('button', { name: 'Open my workspace', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Big ideas. Fair opportunities.')
  return { email, password: testPassword }
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'View account', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your community is waiting.' })).toBeVisible()
}
