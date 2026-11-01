import { expect, test } from '@playwright/test';
// Explicit test catalog exercises navigation independently of the user's empty default catalog.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/demo-repositories', (route) =>
    route.fulfill({
      json: {
        items: ['pallets/flask', 'django/django', 'python/cpython'].map((full_name) => ({
          full_name,
          url: `https://github.com/${full_name}`,
          description: 'Test catalog entry',
          id: null,
          status: 'not_analyzed',
        })),
      },
    }),
  );
});
test('mobile drawer keeps keyboard focus visible and returns it on Escape', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'pallets/flask' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Open repositories' })).toBeFocused();
  await page.getByRole('button', { name: 'Open repositories' }).click();
  const sidebar = page.getByRole('complementary');
  await expect(sidebar.getByRole('button', { name: 'Close repositories' })).toBeFocused();
  await sidebar.getByRole('button', { name: /python\/cpython/ }).focus();
  await page.keyboard.press('Tab');
  await expect(sidebar.getByRole('link', { name: /DevRecall/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open repositories' })).toBeFocused();
});

test('chat renders exact evidence links and clears repository context on switching', async ({
  page,
}, info) => {
  const repo = {
    id: 999,
    full_name: 'test/fixture',
    name: 'fixture',
    owner: 'test',
    html_url: 'https://github.com/test/fixture',
    description: 'Synthetic browser test repository',
    status: 'ready',
    default_branch: 'main',
    last_indexed_at: null,
  };
  await page.route('**/api/v1/health', (route) =>
    route.fulfill({
      json: {
        status: 'ok',
        ai: { configured: true, provider: 'test-only', model: 'synthetic-test-model' },
      },
    }),
  );
  await page.route('**/api/v1/repositories', (route) => route.fulfill({ json: { items: [repo] } }));
  await page.route('**/api/v1/repositories/999', (route) =>
    route.fulfill({
      json: {
        repository: repo,
        summary: {
          decisions: 0,
          rejected_removed: 0,
          prs_analyzed: 1,
          comments_analyzed: 1,
          prs_scanned: 1,
          comments_scanned: 1,
        },
        job: null,
      },
    }),
  );
  await page.route('**/api/v1/repositories/999/chat', (route) =>
    route.fulfill({
      json:
        route.request().method() === 'GET'
          ? { items: [], session_id: null }
          : {
              session_id: '12345678-1234-4234-8234-123456789012',
              content: 'Synthetic test answer: global caching was rejected for tenant isolation.',
              citations: [
                {
                  source_id: 'fixture-source',
                  html_url: 'https://github.com/test/fixture/pull/7#issuecomment-777',
                  excerpt: 'Synthetic test excerpt: caching leaks tenant data.',
                  pr_number: 7,
                  author_login: 'test-maintainer',
                  kind: 'issue_comment_on_pr',
                  created_at: null,
                },
              ],
            },
    }),
  );
  await page.goto('/');
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open repositories' }).click();
  await page
    .getByRole('complementary')
    .getByRole('button', { name: /test\/fixture/ })
    .click();
  await page
    .getByRole('textbox', { name: 'Ask about this repository' })
    .fill('Why was global caching rejected?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByText('Synthetic test answer:', { exact: false })).toBeVisible();
  await expect(page.locator('a.evidence-card')).toHaveAttribute(
    'href',
    'https://github.com/test/fixture/pull/7#issuecomment-777',
  );
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open repositories' }).click();
  await page
    .getByRole('complementary')
    .getByRole('button', { name: /django\/django/ })
    .click();
  await expect(page.getByRole('heading', { name: 'django/django' })).toBeVisible();
  await expect(page.getByText('Synthetic test answer:', { exact: false })).toHaveCount(0);
});
test('three real demo links and accessible add-repository verification', async ({ page }, info) => {
  await page.goto('/');
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open repositories' }).click();
  const sidebar = page.getByRole('complementary');
  await expect(sidebar.getByText('pallets/flask', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('django/django', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('python/cpython', { exact: true })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Add Repository' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('GitHub repository URL').fill('https://evil.com/a/b');
  await dialog.getByRole('button', { name: 'Verify Repository' }).click();
  await expect(dialog.getByRole('alert')).toContainText('github.com');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
test('verified metadata leads to a real queued workflow with honest counters', async ({
  page,
}, info) => {
  // Synthetic HTTP metadata fixture used only in browser tests. Product never seeds it.
  const repo = {
    id: 999,
    full_name: 'test/fixture',
    name: 'fixture',
    owner: 'test',
    html_url: 'https://github.com/test/fixture',
    description: 'Synthetic browser test repository',
    status: 'queued',
    default_branch: 'main',
    last_indexed_at: null,
  };
  let added = false;
  await page.route('**/api/v1/repositories', async (route) => {
    if (route.request().method() === 'POST') {
      added = true;
      await route.fulfill({ json: { repository: repo, job: { id: 'job', status: 'queued' } } });
    } else await route.fulfill({ json: { items: added ? [repo] : [] } });
  });
  await page.route('**/api/v1/repositories/resolve', (route) =>
    route.fulfill({
      json: { repository: { ...repo, owner: { login: 'test' }, private: false, archived: false } },
    }),
  );
  await page.route('**/api/v1/repositories/999', (route) =>
    route.fulfill({
      json: {
        repository: repo,
        summary: {
          decisions: 0,
          rejected_removed: 0,
          prs_analyzed: 0,
          comments_analyzed: 0,
          prs_scanned: 0,
          comments_scanned: 0,
        },
        job: {
          status: 'queued',
          phase: 'queued',
          prs_discovered: 0,
          prs_fetched: 0,
          prs_analyzed: 0,
        },
      },
    }),
  );
  await page.route('**/api/v1/repositories/999/chat', (route) =>
    route.fulfill({ json: { items: [], session_id: null } }),
  );
  await page.route('**/api/v1/repositories/999/decisions**', (route) =>
    route.fulfill({ json: { items: [], next_offset: null } }),
  );
  await page.goto('/');
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open repositories' }).click();
  await page.getByRole('complementary').getByRole('button', { name: 'Add Repository' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('GitHub repository URL').fill('https://github.com/test/fixture');
  await dialog.getByRole('button', { name: 'Verify Repository' }).click();
  await expect(dialog.getByText('test/fixture', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Analyze Repository' }).click();
  await expect(page.getByRole('heading', { name: 'test/fixture' })).toBeVisible();
  await page.getByRole('tab', { name: /^Decisions/ }).click();
  await expect(page.getByText('No decisions yet', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('1,284');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
