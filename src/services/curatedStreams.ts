/**
 * Curated supplementary streams.
 *
 * Channels with a public, unauthenticated HLS endpoint that iptv-org's
 * per-country playlists do not surface to Arab audiences — either iptv-org has
 * no entry at all (NBN) or it files the channel under a different country (the
 * Coptic channels are catalogued under "us").
 *
 * Every URL here was verified to return a master playlist plus playable media
 * segments with no token, cookie or referer requirement. Re-verify before
 * adding an entry — dead entries make Live TV look broken, and mergeFeedEntries
 * will only ever pick the first URL that responds.
 */
export interface CuratedStream {
  /** Channel name as shown in the Live TV list. */
  name: string;
  url: string;
  /** Country the channel appears under in the Live TV country picker. */
  countryCode: string;
  group: string;
  /** Square channel logo. */
  logo?: string;
  /** tvg-id used for EPG matching. */
  tvgId?: string;
  /** Defaults to 'hls'. See LiveTVChannel.streamType. */
  streamType?: 'hls' | 'external';
}

export const CURATED_STREAMS: CuratedStream[] = [
  // Lebanon — NBN has no iptv-org entry at all.
  {
    name: 'TV NBN',
    url: 'https://cdn.jmvstream.com/w/LVW-8410/LVW8410_uiZOVm6vz1/playlist.m3u8',
    countryCode: 'lb',
    group: 'General',
  },

  // Egypt — Coptic channels that iptv-org catalogues under the United States,
  // so they were invisible to anyone selecting Egypt.
  {
    name: 'Al Horreya TV',
    url: 'http://media.smc-host.com:1935/alhorreya.tv/mp4:alhorreya3/playlist.m3u8',
    countryCode: 'eg',
    group: 'Religious',
    logo: 'https://i.imgur.com/EK75DMJ.png',
    tvgId: 'AlHorreyaTV.us@SD',
  },
  {
    name: 'Alkarma TV Middle East',
    url: 'https://58cc65c534c67.streamlock.net/alkarmatv.com/alkarmame1.smil/playlist.m3u8',
    countryCode: 'eg',
    group: 'Religious',
    logo: 'https://i.imgur.com/6OmNw5A.png',
    tvgId: 'AlkarmaTVMiddleEast.us@SD',
  },
  {
    name: 'Alkarma TV Praise',
    url: 'https://58cc65c534c67.streamlock.net/alkarmatv.com/alkarmapa.smil/playlist.m3u8',
    countryCode: 'eg',
    group: 'Religious',
    logo: 'https://i.imgur.com/bJLKkou.png',
    tvgId: 'AlkarmaTVPraise.us@SD',
  },
  {
    name: 'Alkarma TV North America',
    url: 'https://5aafcc5de91f1.streamlock.net/alkarmatv.com/alkarmana1.smil/playlist.m3u8',
    countryCode: 'eg',
    group: 'Religious',
    logo: 'https://i.imgur.com/pnm60bq.png',
    tvgId: 'AlkarmaTVNorthAmericaCanada.us@SD',
  },

  // Egypt — networks that publish no public HLS at all and broadcast only
  // through their own players (YouTube live). Marked 'external' so the app
  // opens them in YouTube instead of handing a dead URL to the video player.
  //
  // These use the channel's /live URL rather than a specific ?v= id: a video id
  // only exists for one broadcast and dies when the network restarts its
  // stream, while /live always resolves to whatever is on air.
  //
  // Only channels whose /live resolves to a live or scheduled broadcast belong
  // here. A channel that merely *has* live content is not enough: CBC Egypt, ON
  // and Sada Elbalad all carry past live broadcasts, so their /live lands on an
  // old recording and the row would play a months-old event. Re-check before
  // adding one.
  //
  // Al Kahera Wal Nas 2 is deliberately absent: it runs concurrently with the
  // main feed on the *same* channel (UCzWdc0aUo0IDk5ysLrt04hw), so /live
  // cannot address it separately — it currently resolves to the "2" feed.
  // Adding it means pinning a ?v= id and accepting that it goes stale.
  {
    name: 'Al Kahera Wal Nas',
    url: 'https://www.youtube.com/channel/UCzWdc0aUo0IDk5ysLrt04hw/live',
    countryCode: 'eg',
    group: 'General',
    streamType: 'external',
  },
  {
    name: 'AlQahera News',
    url: 'https://www.youtube.com/channel/UCktyejXTxWaKfrgp1Oq7CMQ/live',
    countryCode: 'eg',
    group: 'News',
    streamType: 'external',
  },
  {
    name: 'Alghad TV',
    url: 'https://www.youtube.com/channel/UCH4UNKBHSNwstan99YDoCVg/live',
    countryCode: 'eg',
    group: 'News',
    streamType: 'external',
  },
  {
    name: 'eXtra news',
    url: 'https://www.youtube.com/channel/UC65F33K2cXk9hGDbOQYhTOw/live',
    countryCode: 'eg',
    group: 'News',
    streamType: 'external',
  },
  {
    name: 'Al Mehwar',
    url: 'https://www.youtube.com/channel/UCYoo3rvwB24q9_kRCgR897Q/live',
    countryCode: 'eg',
    group: 'General',
    streamType: 'external',
  },
  {
    name: 'Maspero Zaman',
    url: 'https://www.youtube.com/channel/UColf1L4k9OVGwzuwNkzEOLg/live',
    countryCode: 'eg',
    group: 'General',
    streamType: 'external',
  },
  {
    name: 'Fr. Daoud Lamei TV',
    url: 'https://www.youtube.com/channel/UCq43CuXeeYpHdEq56Lod0JA/live',
    countryCode: 'eg',
    group: 'Religious',
    streamType: 'external',
  },

  // Lebanon / Jordan / Tunisia / Mauritania — pan-Arab networks whose only
  // public feed is YouTube live. Same rule: /live must resolve to an actual
  // live or scheduled broadcast, not a past recording.
  {
    name: 'Roya News',
    url: 'https://www.youtube.com/channel/UCsDQbVxQjBuFOa98vxRlbVQ/live',
    countryCode: 'jo',
    group: 'News',
    streamType: 'external',
  },
  {
    name: 'Tunisna TV',
    url: 'https://www.youtube.com/channel/UC18lZ1IQ5A6mlAYbC_2QHow/live',
    countryCode: 'tn',
    group: 'General',
    streamType: 'external',
  },
  {
    name: 'Chinguit TV',
    url: 'https://www.youtube.com/channel/UCWHiL1mvKqjAZHobywIrxwg/live',
    countryCode: 'mr',
    group: 'General',
    streamType: 'external',
  },
];
