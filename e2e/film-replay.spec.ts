import { expect, test } from '@playwright/test'

test('replay failure is announced and successful playback clears it', async ({ page }) => {
  await page.goto('/')
  const replay = page.getByRole('button', { name: 'Replay film' })
  test.skip(await replay.count() === 0, 'Film asset is absent from this build')
  await page.evaluate(() => {
    HTMLMediaElement.prototype.play = async () => { throw new Error('Playback unavailable') }
  })
  await replay.click()
  const status = page.locator('#product-film [role=status]')
  await expect(status).toContainText('could not restart')
  await page.locator('#product-film video').dispatchEvent('playing')
  await expect(status).toBeEmpty()
})
