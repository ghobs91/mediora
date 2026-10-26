import {
  fetchCountryChannels,
  mergeFeedEntries,
} from '../src/services/iptvManager';

// Curated playlist (countries/*.m3u): enriched but missing Al Jazeera,
// mirroring the stale Qatar playlist from the bug report.
const CURATED_QA = `#EXTM3U
#EXTINF:-1 tvg-id="AlkassOne.qa@SD" tvg-logo="https://i.imgur.com/10mmlha.png" group-title="Sports",Alkass One (1080p)
https://liveeu-gcp.alkassdigital.net/alkass1-p/main.m3u8
#EXTINF:-1 tvg-id="AlJazeeraDocumentary.qa@SD" tvg-logo="https://i.imgur.com/5dNJlLo.png" group-title="Documentary",Al Jazeera Documentary (1080p) [Geo-blocked]
https://live-hls-apps-ajd-fa.getaj.net/AJD/index.m3u8
`;

// Full playlist (streams/*.m3u): every submitted feed, no logos/groups,
// one row per feed — mirrors https://iptv-org.github.io.
const FULL_QA = `#EXTM3U x-tvg-url="https://worker-9dd4.onrender.com/guide.xml.gz"
#EXTINF:-1 tvg-id="AlJazeera.qa@Arabic",Al Jazeera (1080p)
https://live-hls-apps-aja-fa.getaj.net/AJA/index.m3u8
#EXTINF:-1 tvg-id="AlJazeera.qa@Arabic",Al Jazeera (1080p)
https://live-hls-web-aja-fa.thehlive.com/AJA/index.m3u8
#EXTINF:-1 tvg-id="AlkassOne.qa@SD",Alkass One (1080p)
https://liveeu-gcp.alkassdigital.net/alkass1-p/main.m3u8
#EXTINF:-1 tvg-id="AlJazeeraDocumentary.qa@SD",Al Jazeera Documentary (1080p) [Geo-blocked]
https://live-hls-apps-ajd-v3-fa.getaj.net/AJD/index.m3u8
`;

function mockFetch(curated: string | null, full: string | null) {
  (global as any).fetch = jest.fn((url: string) => {
    const body = url.includes('/countries/') ? curated : full;
    if (body === null) {
      return Promise.resolve({ ok: false, status: 404 });
    }
    return Promise.resolve({ ok: true, text: () => Promise.resolve(body) });
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  delete (global as any).fetch;
});

test('channels missing from the curated playlist are added from the full streams playlist', async () => {
  mockFetch(CURATED_QA, FULL_QA);
  const channels = await fetchCountryChannels('qa');

  const names = channels.map(c => c.name);
  // Al Jazeera only exists in the full playlist but must still show up
  expect(names).toContain('Al Jazeera (1080p)');
  expect(names).toContain('Alkass One (1080p)');
  expect(names).toContain('Al Jazeera Documentary (1080p) [Geo-blocked]');

  const jazeera = channels.find(c => c.tvgId === 'AlJazeera.qa@Arabic')!;
  expect(jazeera).toBeDefined();
  expect(jazeera.group).toBe('General');
  // Duplicate feeds collapse into one channel with backups
  expect(jazeera.backupUrls).toEqual([
    'https://live-hls-web-aja-fa.thehlive.com/AJA/index.m3u8',
  ]);
});

test('curated metadata wins and extra feeds become backup URLs', async () => {
  mockFetch(CURATED_QA, FULL_QA);
  const channels = await fetchCountryChannels('qa');

  const doc = channels.find(c => c.tvgId === 'AlJazeeraDocumentary.qa@SD')!;
  expect(doc.logo).toBe('https://i.imgur.com/5dNJlLo.png');
  expect(doc.group).toBe('Documentary');
  expect(doc.url).toBe('https://live-hls-apps-ajd-fa.getaj.net/AJD/index.m3u8');
  expect(doc.backupUrls).toEqual([
    'https://live-hls-apps-ajd-v3-fa.getaj.net/AJD/index.m3u8',
  ]);

  // Same URL in both playlists is not duplicated
  const alkass = channels.find(c => c.tvgId === 'AlkassOne.qa@SD')!;
  expect(alkass.backupUrls).toBeUndefined();
});

test('channel names survive commas inside quoted EXTINF attributes', async () => {
  // Mirrors the real Palestine playlist: the http-user-agent value contains
  // "(KHTML, like Gecko)", which a naive first-comma split treats as the
  // attributes/name separator.
  const WITH_USER_AGENT = `#EXTM3U
#EXTINF:-1 tvg-id="MusawaChannel.ps@SD" tvg-logo="https://i.imgur.com/GB2Q9kl.png" http-user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36" group-title="General",Musawa Channel (1080p) [Not 24/7]
https://pbc.furrera.ps/musawahd/index.m3u8
`;
  mockFetch(WITH_USER_AGENT, null);
  const channels = await fetchCountryChannels('ps');

  expect(channels).toHaveLength(1);
  expect(channels[0].name).toBe('Musawa Channel (1080p) [Not 24/7]');
  expect(channels[0].group).toBe('General');
  expect(channels[0].tvgId).toBe('MusawaChannel.ps@SD');
  expect(channels[0].logo).toBe('https://i.imgur.com/GB2Q9kl.png');
});

test('falls back to curated playlist when streams source 404s (e.g. int)', async () => {
  mockFetch(CURATED_QA, null);
  const channels = await fetchCountryChannels('int');

  expect(channels).toHaveLength(2);
  expect(channels[0].tvgId).toBe('AlkassOne.qa@SD');
});

test('returns empty array when both sources fail and there is no supplement', async () => {
  mockFetch(null, null);
  await expect(fetchCountryChannels('qa')).resolves.toEqual([]);
});

test('supplement still loads when both iptv-org sources fail', async () => {
  mockFetch(null, null);
  const channels = await fetchCountryChannels('lb');

  expect(channels.map(c => c.name)).toContain('TV NBN');
  expect(channels[0].countryCode).toBe('lb');
});

test('supplement merges into the playlist instead of duplicating it', async () => {
  mockFetch(null, null);
  const channels = await fetchCountryChannels('eg');

  // Coptic feeds iptv-org files under "us" are reachable from Egypt.
  expect(channels.map(c => c.name)).toEqual(
    expect.arrayContaining([
      'Al Horreya TV',
      'Alkarma TV Middle East',
      'Alkarma TV Praise',
      'Alkarma TV North America',
    ])
  );
});

test('external (non-HLS) channels keep their stream type through the merge', async () => {
  mockFetch(null, null);
  const channels = await fetchCountryChannels('eg');

  const youtube = channels.filter(c => c.streamType === 'external');
  expect(youtube.map(c => c.name)).toEqual(
    expect.arrayContaining([
      'Al Kahera Wal Nas',
      'AlQahera News',
      'Alghad TV',
      'eXtra news',
      'Al Mehwar',
      'Maspero Zaman',
      'Fr. Daoud Lamei TV',
    ])
  );
  // Channel /live URLs, not per-broadcast ?v= ids, so the rows survive stream restarts.
  expect(youtube.every(c => /^https:\/\/www\.youtube\.com\/channel\/UC[\w-]{22}\/live$/.test(c.url))).toBe(true);

  // HLS channels must not be marked external, or the player would be skipped.
  const hls = channels.find(c => c.name === 'Al Horreya TV')!;
  expect(hls.streamType).toBeUndefined();
});

test('external channels are only surfaced under the country they belong to', async () => {
  mockFetch(null, null);
  const jordan = await fetchCountryChannels('jo');
  const mauritania = await fetchCountryChannels('mr');
  const egypt = await fetchCountryChannels('eg');

  expect(jordan.map(c => c.name)).toContain('Roya News');
  expect(jordan.map(c => c.name)).not.toContain('Chinguit TV');
  expect(mauritania.map(c => c.name)).toContain('Chinguit TV');
  expect(egypt.map(c => c.name)).not.toContain('Roya News');
});

test('mergeFeedEntries keys entries without tvg-id by name', () => {
  const merged = mergeFeedEntries(
    [
      { name: 'Foo TV', url: 'https://a.example/x.m3u8', group: 'News' },
      { name: 'foo-tv!!', url: 'https://b.example/x.m3u8' },
    ],
    'qa'
  );
  expect(merged).toHaveLength(1);
  expect(merged[0].url).toBe('https://a.example/x.m3u8');
  expect(merged[0].backupUrls).toEqual(['https://b.example/x.m3u8']);
});
