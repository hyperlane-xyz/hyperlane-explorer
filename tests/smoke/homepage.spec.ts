import { expect, test } from '@playwright/test';

const DELIVERED_MESSAGE_ID = '0xcddfe5f46ea816472b3ad331cee25b4d34be7280d5ba03d2358f1b5a8d049f55';

test('smokes the Explorer runtime, data path, and widget layouts', async ({ page }) => {
  const pageErrors: string[] = [];
  const graphqlMethods: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (request.url().startsWith('https://explorer4.hasura.app/v1/graphql')) {
      graphqlMethods.push(request.method());
    }
  });

  await page.goto('/');

  const searchInput = page.getByPlaceholder('Search by address, hash, message id, or warp route');
  await expect(searchInput).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await expect(page.getByText('Sorry, an error has occurred. Please try again later.')).toHaveCount(
    0,
  );
  expect(pageErrors).toEqual([]);
  expect(graphqlMethods).toContain('POST');
  expect(graphqlMethods).not.toContain('GET');

  await expect(page.locator('header img')).toHaveCSS('height', '40px');
  await expect(page.locator('footer img')).toHaveCSS('height', '48px');
  await expect(searchInput).toHaveCSS('height', '48px');

  for (const label of ['Origin', 'Destination', 'Time', 'Status']) {
    const box = await page.getByRole('button', { name: label, exact: true }).boundingBox();
    expect(box?.height).toBeLessThan(40);
  }

  await page.getByRole('button', { name: 'Origin', exact: true }).click();
  await expect(page.getByPlaceholder('Chain Name or ID')).toBeVisible();
  await expect(page.getByText('Abstract', { exact: true }).first()).toBeVisible();

  const pickerGrids = page.locator('[class*="htw-grid-cols-"]');
  await expect(pickerGrids.first()).toHaveCSS('display', 'grid');
  await expect(pickerGrids.nth(1)).toHaveCSS('display', 'grid');

  const pickerControls = await pickerGrids.first().boundingBox();
  const firstChainRow = await pickerGrids.nth(1).boundingBox();
  expect(pickerControls?.width).toBeGreaterThan(400);
  expect(firstChainRow?.width).toBeGreaterThan(400);
  expect(firstChainRow?.height).toBeLessThan(70);

  await page.goto(`/message/${DELIVERED_MESSAGE_ID}`);

  const timeline = page.locator('.htw-pt-14').first();
  await expect(timeline).toBeVisible({ timeout: 30_000 });
  await expect(timeline).toHaveCSS('display', 'flex');
  await expect(timeline).toHaveCSS('padding-top', '56px');

  const stageBars = timeline.locator('.htw-h-6.htw-relative');
  const stageIcons = timeline.locator('.htw--top-12');
  await expect(stageBars).toHaveCount(4);
  await expect(stageIcons).toHaveCount(4);

  for (let index = 0; index < 4; index += 1) {
    await expect(stageBars.nth(index)).toHaveCSS('height', '24px');
    await expect(stageBars.nth(index)).toHaveCSS('position', 'relative');
    await expect(stageIcons.nth(index)).toHaveCSS('position', 'absolute');
    await expect(stageIcons.nth(index)).toHaveCSS('top', '-48px');
  }

  await expect(page.getByText('Sent', { exact: true })).toBeVisible();
  await expect(page.getByText('Finalized', { exact: true })).toBeVisible();
  await expect(page.getByText('Validated', { exact: true })).toBeVisible();
  await expect(page.getByText('Relayed', { exact: true })).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await expect(page.getByText('Sorry, an error has occurred. Please try again later.')).toHaveCount(
    0,
  );
  expect(pageErrors).toEqual([]);
});
