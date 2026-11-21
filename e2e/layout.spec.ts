import { expect, test } from '@playwright/test'

test('guided scenarios keep labels, numbers and navigation aligned', async ({ page }) => {
  await page.goto('/demo')
  const rows = page.locator('.walk-row')
  await expect(rows).toHaveCount(5)
  await expect(page.getByRole('progressbar')).toHaveAttribute('value','0')
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const aligned = await rows.evaluateAll(buttons => buttons.every(button => {
      const [number, copy, arrow] = Array.from(button.children, el => el.getBoundingClientRect())
      const [title, subtitle] = Array.from(button.children[1].children, el => el.getBoundingClientRect())
      return number.right <= copy.left && copy.right <= arrow.left && title.bottom <= subtitle.top + 1
    }))
    expect(aligned).toBe(true)
  }
  await rows.nth(3).click()
  const banner = page.locator('.checkpoint-strip')
  await expect(banner).toBeVisible()
  await banner.getByRole('button', { name: /Return to Demo/ }).click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value','80')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.locator('.walk-session')).toContainText('Paused')
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.reload()
  await expect(rows.nth(3)).toHaveAttribute('aria-current', 'step')
})

test('extraction fields, inspector tabs and persisted theme', async ({ page }) => {
  await page.goto('/app/ai-workspace')
  await page.locator('textarea').first().fill('Website for 50000. 20000 after design approval and 30000 on delivery. 5 days to review.')
  await page.getByRole('button', { name: 'Extract terms' }).click()
  await expect(page.locator('.extracted-fields dt')).toHaveCount(4)
  await expect(page.locator('.extracted-fields dd')).toHaveCount(4)
  await page.getByRole('button', { name: 'Open Contract IR' }).click()
  for (const mode of ['dark', 'light']) {
    await page.getByRole('button', { name: `Switch to ${mode} mode` }).click()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
    const contrast = await page.locator('.ir-tabs button.active').evaluate(button => {
      const luminance = (color: string) => {
        const channels = color.match(/\d+/g)!.slice(0,3).map(Number).map(n => n / 255)
          .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
        return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722
      }
      const style = getComputedStyle(button)
      const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a,b) => b-a)
      return (values[0]+.05)/(values[1]+.05)
    })
    expect(contrast).toBeGreaterThanOrEqual(4.5)
  }
})

