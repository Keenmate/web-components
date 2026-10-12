import { test, expect } from '@playwright/test';

test.describe('<{{TAG}}>', () => {
  test('renders the label and reacts to attribute changes', async ({ page }) => {
    await page.goto('/test/fixture.html');
    const label = page.locator('#subject .{{PREFIX}}__label');
    await expect(label).toHaveText('fixture');

    await page.evaluate(() => document.getElementById('subject')!.setAttribute('label', 'changed'));
    await expect(label).toHaveText('changed');
  });

  test('click toggles the active state, reflects it and fires change', async ({ page }) => {
    await page.goto('/test/fixture.html');
    const changeDetails = page.evaluate(
      () =>
        new Promise<unknown>((resolve) =>
          document.getElementById('subject')!.addEventListener('change', (event) => resolve((event as CustomEvent).detail), { once: true })
        )
    );
    await page.locator('#subject .{{PREFIX}}__root').click();
    expect(await changeDetails).toEqual({ isActive: true });
    await expect(page.locator('#subject')).toHaveAttribute('active', '');
    await expect(page.locator('#subject .{{PREFIX}}__root')).toHaveClass(/{{PREFIX}}__root--active/);
  });
});
