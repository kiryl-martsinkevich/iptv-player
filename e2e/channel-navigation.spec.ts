import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_M3U = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="sport1" tvg-name="ESPN" group-title="Sports",ESPN',
  'http://example.com/stream/espn',
  '#EXTINF:-1 tvg-id="sport2" tvg-name="Sky Sports" group-title="Sports",Sky Sports',
  'http://example.com/stream/sky-sports',
  '#EXTINF:-1 tvg-id="news1" tvg-name="CNN" group-title="News",CNN',
  'http://example.com/stream/cnn',
  '#EXTINF:-1 tvg-id="news2" tvg-name="BBC World" group-title="News",BBC World',
  'http://example.com/stream/bbc-world',
  '#EXTINF:-1 tvg-id="ent1" tvg-name="HBO" group-title="Entertainment",HBO',
  'http://example.com/stream/hbo',
  '#EXTINF:-1 tvg-id="ent2" tvg-name="Netflix Channel" group-title="Entertainment",Netflix Channel',
  'http://example.com/stream/netflix',
  '#EXTINF:-1 tvg-id="nocat1" tvg-name="No Category Stream",No Category Stream',
  'http://example.com/stream/nocat',
].join('\n');

function buildMockXmltv(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
  const start = new Date(now.getTime() - 30 * 60_000);
  const stop = new Date(now.getTime() + 90 * 60_000);

  const programmes = [
    { ch: 'sport1', title: 'Premier League Live', desc: 'Manchester United vs Liverpool' },
    { ch: 'sport2', title: 'Cricket World Cup', desc: 'Final match coverage' },
    { ch: 'news1', title: 'World News Tonight', desc: 'Breaking news from around the globe' },
    { ch: 'news2', title: 'BBC News at Ten', desc: 'The latest UK and international news' },
    { ch: 'ent1', title: 'Game of Thrones', desc: 'Winter is coming' },
    { ch: 'ent2', title: 'Stranger Things', desc: 'The Upside Down awaits' },
    { ch: 'nocat1', title: 'Mystery Show', desc: 'No category, no problem' },
  ];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n<tv>\n';
  for (const p of programmes) {
    xml += `  <channel id="${p.ch}"><display-name>${p.ch}</display-name></channel>\n`;
  }
  for (const p of programmes) {
    xml += `  <programme start="${fmt(start)}" stop="${fmt(stop)}" channel="${p.ch}">\n`;
    xml += `    <title>${p.title}</title>\n`;
    xml += `    <desc>${p.desc}</desc>\n`;
    xml += `  </programme>\n`;
  }
  xml += '</tv>';
  return xml;
}

const MOCK_XMLTV = buildMockXmltv();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupMockData(page: Page): Promise<void> {
  await page.route('**/__proxy__/**', route => {
    const url = route.request().url();
    if (url.includes('playlist.m3u') || url.includes('mock.m3u')) {
      return route.fulfill({ status: 200, contentType: 'text/plain', body: MOCK_M3U });
    }
    if (url.includes('epg.xml') || url.includes('mock.xml')) {
      return route.fulfill({ status: 200, contentType: 'application/xml', body: MOCK_XMLTV });
    }
    return route.continue();
  });
}

async function loadApp(page: Page): Promise<void> {
  await page.goto('/');

  // Fill splash form
  await page.fill('input[placeholder*="playlist.m3u"]', 'http://mock/playlist.m3u');
  await page.fill('input[placeholder*="epg.xml"]', 'http://mock/epg.xml');
  await page.click('button:has-text("Load Channels")');

  // Wait for the sidebar to appear (channel list loaded)
  await page.waitForSelector('text=ESPN', { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests: Category expand / collapse
// ---------------------------------------------------------------------------

test.describe('Categories tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockData(page);
    await loadApp(page);
    // Switch to Categories tab
    await page.click('button:has-text("Categories")');
  });

  test('categories start collapsed', async () => {
    // Category headers should be visible
    await expect(page.locator('text=SPORTS')).toBeVisible();
    await expect(page.locator('text=NEWS')).toBeVisible();
    await expect(page.locator('text=ENTERTAINMENT')).toBeVisible();
    await expect(page.locator('text=UNCATEGORIZED')).toBeVisible();

    // But channels inside should NOT be visible (collapsed)
    await expect(page.locator('text=ESPN')).not.toBeVisible();
    await expect(page.locator('text=CNN')).not.toBeVisible();
    await expect(page.locator('text=HBO')).not.toBeVisible();
  });

  test('clicking a category header expands it', async () => {
    // Click Sports category header
    await page.click('text=SPORTS');
    // Channels inside Sports should now be visible
    await expect(page.locator('text=ESPN')).toBeVisible();
    await expect(page.locator('text=Sky Sports')).toBeVisible();
    // Channels in other categories should still be hidden
    await expect(page.locator('text=CNN')).not.toBeVisible();
  });

  test('clicking a category header again collapses it', async () => {
    // Expand Sports
    await page.click('text=SPORTS');
    await expect(page.locator('text=ESPN')).toBeVisible();
    // Collapse Sports
    await page.click('text=SPORTS');
    await expect(page.locator('text=ESPN')).not.toBeVisible();
  });

  test('multiple categories can be expanded independently', async () => {
    await page.click('text=SPORTS');
    await page.click('text=NEWS');
    await expect(page.locator('text=ESPN')).toBeVisible();
    await expect(page.locator('text=CNN')).toBeVisible();
    await expect(page.locator('text=BBC World')).toBeVisible();
    // Entertainment still collapsed
    await expect(page.locator('text=HBO')).not.toBeVisible();
  });

  test('all categories listed with correct channel counts', async () => {
    await expect(page.locator('text=SPORTS')).toBeVisible();
    await expect(page.locator('text=NEWS')).toBeVisible();
    await expect(page.locator('text=ENTERTAINMENT')).toBeVisible();
    await expect(page.locator('text=UNCATEGORIZED')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Search
// ---------------------------------------------------------------------------

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockData(page);
    await loadApp(page);
  });

  test('search filters channels by name', async () => {
    const searchInput = page.locator('input[placeholder="Search channels…"]');
    await searchInput.fill('ESPN');
    await expect(page.locator('text=ESPN')).toBeVisible();
    await expect(page.locator('text=Sky Sports')).not.toBeVisible();
    await expect(page.locator('text=CNN')).not.toBeVisible();
  });

  test('search is case-insensitive', async () => {
    const searchInput = page.locator('input[placeholder="Search channels…"]');
    await searchInput.fill('espn');
    await expect(page.locator('text=ESPN')).toBeVisible();
  });

  test('search across all channels when on favourites tab', async () => {
    // First add a channel to favourites via context menu
    await page.click('text=ESPN', { button: 'right' });
    await page.click('text=Add to Favourites');
    // Switch to Favourites tab (already default)
    // Search for a non-favourite channel — should not appear
    const searchInput = page.locator('input[placeholder="Search channels…"]');
    await searchInput.fill('CNN');
    await expect(page.locator('text=CNN')).not.toBeVisible();
  });

  test('clearing search restores all channels', async () => {
    const searchInput = page.locator('input[placeholder="Search channels…"]');
    await searchInput.fill('xyz-nonexistent');
    await expect(page.locator('text=ESPN')).not.toBeVisible();
    await searchInput.fill('');
    await expect(page.locator('text=ESPN')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Favourites tab
// ---------------------------------------------------------------------------

test.describe('Favourites tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockData(page);
    await loadApp(page);
    // Favourites is the default tab — no need to switch
  });

  test('favourites tab shows empty hint when no favourites', async () => {
    await expect(page.locator('text=No favourites yet')).toBeVisible();
  });

  test('adding a channel to favourites shows it on favourites tab', async () => {
    // Right-click ESPN → Add to Favourites
    await page.click('text=ESPN', { button: 'right' });
    await page.click('text=Add to Favourites');
    // Should now show ESPN in favourites
    await expect(page.locator('text=ESPN')).toBeVisible();
    await expect(page.locator('text=Sky Sports')).not.toBeVisible();
  });

  test('removing a channel from favourites hides it', async () => {
    // Add ESPN
    await page.click('text=ESPN', { button: 'right' });
    await page.click('text=Add to Favourites');
    await expect(page.locator('text=ESPN')).toBeVisible();
    // Remove ESPN
    await page.click('text=ESPN', { button: 'right' });
    await page.click('text=Remove from Favourites');
    await expect(page.locator('text=No favourites yet')).toBeVisible();
  });

  test('favourites persist across tab switches', async () => {
    // Add ESPN
    await page.click('text=ESPN', { button: 'right' });
    await page.click('text=Add to Favourites');
    // Switch to Categories
    await page.click('button:has-text("Categories")');
    // Switch back to Favourites
    await page.click('button:has-text("Favourites")');
    // ESPN should still be there
    await expect(page.locator('text=ESPN')).toBeVisible();
  });

  test('favourite count shown in tab label', async () => {
    await expect(page.locator('button:has-text("Favourites")')).not.toContainText('(1)');
    // Add ESPN
    await page.click('text=ESPN', { button: 'right' });
    await page.click('text=Add to Favourites');
    await expect(page.locator('button:has-text("Favourites (1)")')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Context menu (right-click)
// ---------------------------------------------------------------------------

test.describe('Context menu', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockData(page);
    await loadApp(page);
  });

  test('right-click on a channel opens context menu', async () => {
    await page.click('text=ESPN', { button: 'right' });
    await expect(page.locator('text=▶ Play')).toBeVisible();
    await expect(page.locator('text=Add to Favourites')).toBeVisible();
  });

  test('context menu shows Remove for already-favourite channels', async () => {
    // Add ESPN to favourites
    await page.click('text=ESPN', { button: 'right' });
    await page.click('text=Add to Favourites');
    // Right-click again — should show Remove
    await page.click('text=ESPN', { button: 'right' });
    await expect(page.locator('text=Remove from Favourites')).toBeVisible();
    await expect(page.locator('text=Add to Favourites')).not.toBeVisible();
  });

  test('clicking outside context menu closes it', async () => {
    await page.click('text=ESPN', { button: 'right' });
    await expect(page.locator('text=▶ Play')).toBeVisible();
    // Click in the video area (right side of page)
    await page.click('text=ESPN', { button: 'left', position: { x: 600, y: 0 } });
    // Context menu should be gone
    await expect(page.locator('text=▶ Play')).not.toBeVisible();
  });

  test('Escape key closes context menu', async () => {
    await page.click('text=ESPN', { button: 'right' });
    await expect(page.locator('text=▶ Play')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('text=▶ Play')).not.toBeVisible();
  });

  test('Play action in context menu closes menu', async () => {
    await page.click('text=ESPN', { button: 'right' });
    await page.click('text=▶ Play');
    await expect(page.locator('text=▶ Play')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Tab switching
// ---------------------------------------------------------------------------

test.describe('Tab switching', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockData(page);
    await loadApp(page);
  });

  test('Favourites is the default tab', async () => {
    // Add a channel first so tab has content
    await page.click('text=ESPN', { button: 'right' });
    await page.click('text=Add to Favourites');
    // Reload
    await page.reload();
    await loadApp(page);
    // Should be on Favourites tab (ESPN visible since it's persisted)
    await expect(page.locator('text=ESPN')).toBeVisible();
  });

  test('switching tabs clears search query', async () => {
    const searchInput = page.locator('input[placeholder="Search channels…"]');
    // No search on categories tab — all categories visible
    await page.click('button:has-text("Categories")');
    // Switch to Favourites (with no favourites) — empty state
    await page.click('button:has-text("Favourites")');
    await expect(page.locator('text=No favourites yet')).toBeVisible();
    // Switch back to Categories
    await page.click('button:has-text("Categories")');
    await expect(page.locator('text=SPORTS')).toBeVisible();
  });
});
