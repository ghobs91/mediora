/**
 * IPTV Service - Country-based IPTV channels from iptv-org
 */

export interface IPTVCountry {
  code: string;
  name: string;
  flag: string;
}

// Comprehensive list of countries with IPTV channels from iptv-org
// URL pattern: https://iptv-org.github.io/iptv/countries/{code}.m3u
export const IPTV_COUNTRIES: IPTVCountry[] = [
  // International — pan-Arab channels (Al Arabiya, Sky News Arabia, etc.) live here,
  // not in country-specific playlists. Listed first so it appears at the top of the
  // Middle East region in the country picker.
  { code: 'int', name: 'International (Pan-Arab, Global)', flag: '🌐' },

  // North America
  { code: 'us', name: 'United States', flag: '🇺🇸' },
  { code: 'ca', name: 'Canada', flag: '🇨🇦' },
  { code: 'mx', name: 'Mexico', flag: '🇲🇽' },
  
  // Europe
  { code: 'uk', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'de', name: 'Germany', flag: '🇩🇪' },
  { code: 'fr', name: 'France', flag: '🇫🇷' },
  { code: 'es', name: 'Spain', flag: '🇪🇸' },
  { code: 'it', name: 'Italy', flag: '🇮🇹' },
  { code: 'nl', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'be', name: 'Belgium', flag: '🇧🇪' },
  { code: 'pt', name: 'Portugal', flag: '🇵🇹' },
  { code: 'pl', name: 'Poland', flag: '🇵🇱' },
  { code: 'at', name: 'Austria', flag: '🇦🇹' },
  { code: 'ch', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'se', name: 'Sweden', flag: '🇸🇪' },
  { code: 'no', name: 'Norway', flag: '🇳🇴' },
  { code: 'dk', name: 'Denmark', flag: '🇩🇰' },
  { code: 'fi', name: 'Finland', flag: '🇫🇮' },
  { code: 'ie', name: 'Ireland', flag: '🇮🇪' },
  { code: 'gr', name: 'Greece', flag: '🇬🇷' },
  { code: 'cz', name: 'Czech Republic', flag: '🇨🇿' },
  { code: 'hu', name: 'Hungary', flag: '🇭🇺' },
  { code: 'ro', name: 'Romania', flag: '🇷🇴' },
  { code: 'bg', name: 'Bulgaria', flag: '🇧🇬' },
  { code: 'ua', name: 'Ukraine', flag: '🇺🇦' },
  { code: 'ru', name: 'Russia', flag: '🇷🇺' },
  { code: 'hr', name: 'Croatia', flag: '🇭🇷' },
  { code: 'rs', name: 'Serbia', flag: '🇷🇸' },
  { code: 'sk', name: 'Slovakia', flag: '🇸🇰' },
  { code: 'si', name: 'Slovenia', flag: '🇸🇮' },
  
  // Asia
  { code: 'jp', name: 'Japan', flag: '🇯🇵' },
  { code: 'kr', name: 'South Korea', flag: '🇰🇷' },
  { code: 'cn', name: 'China', flag: '🇨🇳' },
  { code: 'in', name: 'India', flag: '🇮🇳' },
  { code: 'id', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'th', name: 'Thailand', flag: '🇹🇭' },
  { code: 'vn', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'ph', name: 'Philippines', flag: '🇵🇭' },
  { code: 'my', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'sg', name: 'Singapore', flag: '🇸🇬' },
  { code: 'pk', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'bd', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'hk', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'tw', name: 'Taiwan', flag: '🇹🇼' },
  
  // Middle East
  { code: 'ae', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'sa', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'il', name: 'Israel', flag: '🇮🇱' },
  { code: 'tr', name: 'Turkey', flag: '🇹🇷' },
  { code: 'eg', name: 'Egypt', flag: '🇪🇬' },
  { code: 'ir', name: 'Iran', flag: '🇮🇷' },
  { code: 'iq', name: 'Iraq', flag: '🇮🇶' },
  { code: 'kw', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'qa', name: 'Qatar', flag: '🇶🇦' },
  { code: 'lb', name: 'Lebanon', flag: '🇱🇧' },
  { code: 'jo', name: 'Jordan', flag: '🇯🇴' },
  
  // Latin America
  { code: 'br', name: 'Brazil', flag: '🇧🇷' },
  { code: 'ar', name: 'Argentina', flag: '🇦🇷' },
  { code: 'co', name: 'Colombia', flag: '🇨🇴' },
  { code: 'cl', name: 'Chile', flag: '🇨🇱' },
  { code: 'pe', name: 'Peru', flag: '🇵🇪' },
  { code: 've', name: 'Venezuela', flag: '🇻🇪' },
  { code: 'ec', name: 'Ecuador', flag: '🇪🇨' },
  { code: 'cu', name: 'Cuba', flag: '🇨🇺' },
  { code: 'do', name: 'Dominican Republic', flag: '🇩🇴' },
  { code: 'pr', name: 'Puerto Rico', flag: '🇵🇷' },
  { code: 'cr', name: 'Costa Rica', flag: '🇨🇷' },
  { code: 'pa', name: 'Panama', flag: '🇵🇦' },
  { code: 'uy', name: 'Uruguay', flag: '🇺🇾' },
  { code: 'py', name: 'Paraguay', flag: '🇵🇾' },
  { code: 'bo', name: 'Bolivia', flag: '🇧🇴' },
  
  // Africa
  { code: 'za', name: 'South Africa', flag: '🇿🇦' },
  { code: 'ng', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'ke', name: 'Kenya', flag: '🇰🇪' },
  { code: 'gh', name: 'Ghana', flag: '🇬🇭' },
  { code: 'ma', name: 'Morocco', flag: '🇲🇦' },
  { code: 'dz', name: 'Algeria', flag: '🇩🇿' },
  { code: 'tn', name: 'Tunisia', flag: '🇹🇳' },
  { code: 'et', name: 'Ethiopia', flag: '🇪🇹' },
  
  // Oceania
  { code: 'au', name: 'Australia', flag: '🇦🇺' },
  { code: 'nz', name: 'New Zealand', flag: '🇳🇿' },
  
  // Caribbean
  { code: 'jm', name: 'Jamaica', flag: '🇯🇲' },
  { code: 'tt', name: 'Trinidad and Tobago', flag: '🇹🇹' },
  { code: 'ht', name: 'Haiti', flag: '🇭🇹' },
];

// Group countries by region for better UI organization
export interface IPTVRegion {
  name: string;
  countries: IPTVCountry[];
}

export const IPTV_REGIONS: IPTVRegion[] = [
  {
    name: 'North America',
    countries: IPTV_COUNTRIES.filter(c => ['us', 'ca', 'mx'].includes(c.code)),
  },
  {
    name: 'Europe',
    countries: IPTV_COUNTRIES.filter(c => 
      ['uk', 'de', 'fr', 'es', 'it', 'nl', 'be', 'pt', 'pl', 'at', 'ch', 'se', 'no', 'dk', 'fi', 'ie', 'gr', 'cz', 'hu', 'ro', 'bg', 'ua', 'ru', 'hr', 'rs', 'sk', 'si'].includes(c.code)
    ),
  },
  {
    name: 'Asia',
    countries: IPTV_COUNTRIES.filter(c => 
      ['jp', 'kr', 'cn', 'in', 'id', 'th', 'vn', 'ph', 'my', 'sg', 'pk', 'bd', 'hk', 'tw'].includes(c.code)
    ),
  },
  {
    name: 'Middle East',
    // 'int' is listed here because pan-Arab channels (Al Arabiya, Sky News Arabia, etc.)
    // are categorised as International in iptv-org and live in int.m3u, not country playlists.
    countries: IPTV_COUNTRIES.filter(c =>
      ['int', 'ae', 'sa', 'il', 'tr', 'eg', 'ir', 'iq', 'kw', 'qa', 'lb', 'jo'].includes(c.code)
    ),
  },
  {
    name: 'Latin America',
    countries: IPTV_COUNTRIES.filter(c => 
      ['br', 'ar', 'co', 'cl', 'pe', 've', 'ec', 'cu', 'do', 'pr', 'cr', 'pa', 'uy', 'py', 'bo'].includes(c.code)
    ),
  },
  {
    name: 'Africa',
    countries: IPTV_COUNTRIES.filter(c => 
      ['za', 'ng', 'ke', 'gh', 'ma', 'dz', 'tn', 'et'].includes(c.code)
    ),
  },
  {
    name: 'Oceania',
    countries: IPTV_COUNTRIES.filter(c => ['au', 'nz'].includes(c.code)),
  },
  {
    name: 'Caribbean',
    countries: IPTV_COUNTRIES.filter(c => ['jm', 'tt', 'ht'].includes(c.code)),
  },
];

/**
 * Get the M3U playlist URL for a country
 */
export function getCountryPlaylistUrl(countryCode: string): string {
  return `https://iptv-org.github.io/iptv/countries/${countryCode}.m3u`;
}

/**
 * Get the EPG URL for a country
 * Uses epg.pw XMLTV sources with format: epg_{UPPERCASE_CODE}.xml
 * Note: The actual fetching will use .xml.gz (compressed) version
 */
export function getCountryEPGUrl(countryCode: string): string | null {
  // Map non-standard codes to ISO 3166-1 alpha-2 used by epg.pw
  const codeMap: Record<string, string> = {
    uk: 'GB',
  };
  const code = codeMap[countryCode.toLowerCase()] || countryCode.toUpperCase();
  // Return base URL without extension - the EPG service will add .gz
  return `https://www.epg.pw/xmltv/epg_${code}.xml`;
}


/**
 * Get country by code
 */
export function getCountryByCode(code: string): IPTVCountry | undefined {
  return IPTV_COUNTRIES.find(c => c.code === code);
}

/**
 * Search countries by name
 */
export function searchCountries(query: string): IPTVCountry[] {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return IPTV_COUNTRIES;
  
  return IPTV_COUNTRIES.filter(country => 
    country.name.toLowerCase().includes(lowerQuery) ||
    country.code.toLowerCase().includes(lowerQuery)
  );
}
