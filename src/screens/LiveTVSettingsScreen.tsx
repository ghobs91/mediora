import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { LiquidGlassView } from '@callstack/liquid-glass';
import { useSettings } from '../context';
import { FocusableInput } from '../components';
import { IPTV_REGIONS, IPTVCountry } from '../services';
import { useDeviceType } from '../hooks/useResponsive';
import { scaleFontSize, scaleSize } from '../utils/scaling';

// TV circle grid dimensions
const CIRCLE_SIZE = scaleSize(110);
const CIRCLE_RADIUS = scaleSize(55);
const ITEM_WIDTH = scaleSize(132);
const EMOJI_SIZE = scaleFontSize(46);

export function LiveTVSettingsScreen() {
  const { settings, updateIPTVSettings } = useSettings();
  const { isMobile } = useDeviceType();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(
    new Set(settings.iptv?.selectedCountries || [])
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRegion, setActiveRegion] = useState<string | null>(null);

  const toggleCountry = async (code: string) => {
    const newSelected = new Set(selectedCountries);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelectedCountries(newSelected);
    try {
      const arr = Array.from(newSelected);
      if (arr.length > 0) {
        await updateIPTVSettings({ selectedCountries: arr });
      } else {
        await updateIPTVSettings(null);
      }
    } catch (error) {
      console.error('Failed to auto-save IPTV settings:', error);
    }
  };

  const bulkSelect = async (countries: IPTVCountry[], add: boolean) => {
    const newSelected = new Set(selectedCountries);
    countries.forEach(c => (add ? newSelected.add(c.code) : newSelected.delete(c.code)));
    setSelectedCountries(newSelected);
    try {
      const arr = Array.from(newSelected);
      if (arr.length > 0) {
        await updateIPTVSettings({ selectedCountries: arr });
      } else {
        await updateIPTVSettings(null);
      }
    } catch (error) {
      console.error('Failed to auto-save IPTV settings:', error);
    }
  };

  // ── TV / Wide layout ─────────────────────────────────────────────────────
  if (!isMobile) {
    const baseCountries: IPTVCountry[] = activeRegion
      ? (IPTV_REGIONS.find(r => r.name === activeRegion)?.countries ?? [])
      : IPTV_REGIONS.flatMap(r => r.countries);

    const displayCountries: IPTVCountry[] = searchQuery
      ? baseCountries.filter(
          c =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.code.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : baseCountries;

    return (
      <View style={styles.tvWrapper}>
        {/* ── Left sidebar: region list ── */}
        <View style={styles.tvLeftPanel}>
          <View style={styles.tvLeftHeader}>
            <Icon name="radio-outline" size={scaleSize(22)} color="rgba(10, 132, 255, 0.95)" />
            <Text style={styles.tvMainTitle}>Live TV</Text>
          </View>
          <Text style={styles.tvSelectedCount}>
            {selectedCountries.size}{' '}
            {selectedCountries.size === 1 ? 'country' : 'countries'} selected
          </Text>

          <View style={styles.tvSearchBox}>
            <FocusableInput
              label="Search"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Filter countries..."
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <ScrollView style={styles.tvRegionList} showsVerticalScrollIndicator={false}>
            {[null, ...IPTV_REGIONS.map(r => r.name)].map(regionName => {
              const isActive = activeRegion === regionName;
              return (
                <TouchableOpacity
                  key={regionName ?? '__all__'}
                  style={[styles.tvRegionItem, isActive && styles.tvRegionItemActive]}
                  onPress={() => setActiveRegion(regionName)}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.tvRegionItemText,
                      isActive && styles.tvRegionItemTextActive,
                    ]}>
                    {regionName ?? 'All Countries'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.tvAutoSaveRow}>
            <Icon name="checkmark-circle" size={scaleSize(16)} color="#30d158" />
            <Text style={styles.tvAutoSaveText}>Saved automatically</Text>
          </View>
        </View>

        {/* ── Right panel: circle grid ── */}
        <View style={styles.tvRightPanel}>
          <View style={styles.tvRightHeader}>
            <Text style={styles.tvRightTitle}>{activeRegion ?? 'All Countries'}</Text>
            <View style={styles.tvHeaderButtons}>
              <TouchableOpacity
                style={styles.tvHeaderButton}
                onPress={() => bulkSelect(displayCountries, true)}
                activeOpacity={0.7}>
                <Text style={styles.tvHeaderButtonText}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tvHeaderButton}
                onPress={() => bulkSelect(displayCountries, false)}
                activeOpacity={0.7}>
                <Text style={styles.tvHeaderButtonText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.tvCircleGrid}
            showsVerticalScrollIndicator={false}>
            {displayCountries.map((country: IPTVCountry) => {
              const isSelected = selectedCountries.has(country.code);
              return (
                <TouchableOpacity
                  key={country.code}
                  style={styles.tvCircleItem}
                  onPress={() => toggleCountry(country.code)}
                  activeOpacity={0.75}>
                  <View style={[styles.tvFlagCircle, isSelected && styles.tvFlagCircleSelected]}>
                    <Text style={styles.tvFlagEmoji}>{country.flag}</Text>
                    {isSelected && (
                      <View style={styles.tvStarBadge}>
                        <Icon name="star" size={scaleSize(12)} color="#fff" />
                      </View>
                    )}
                  </View>
                  <Text
                    style={[styles.tvCountryName, isSelected && styles.tvCountryNameSelected]}
                    numberOfLines={2}>
                    {country.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────
  const mobileScrollStyle = {
    paddingTop: insets.top + 72,
    paddingBottom: insets.bottom + 100,
    paddingHorizontal: 16,
  };

  const filteredRegions = IPTV_REGIONS.map(region => ({
    ...region,
    countries: region.countries.filter(
      country =>
        !searchQuery ||
        country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        country.code.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  })).filter(region => region.countries.length > 0);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.backButtonContainer, { top: insets.top + 8 }]}>
        <LiquidGlassView
          style={styles.backButtonGlass}
          effect="regular"
          tintColor="rgba(255, 255, 255, 0.25)">
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}>
            <Icon name="arrow-back" size={28} color="rgba(60, 60, 67, 0.85)" />
          </TouchableOpacity>
        </LiquidGlassView>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={mobileScrollStyle}>
        <View style={styles.sectionForm}>
          <View style={styles.sectionHeader}>
            <Icon name="radio-outline" size={24} color="rgba(10, 132, 255, 0.95)" />
            <Text style={styles.sectionTitle}>Live TV Settings</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Select countries to add IPTV channels to Jellyfin. Channels and EPG data will be
            managed via Jellyfin Live TV.
          </Text>
          <Text style={styles.selectedCount}>
            {selectedCountries.size}{' '}
            {selectedCountries.size === 1 ? 'country' : 'countries'} selected
          </Text>

          <FocusableInput
            label="Search Countries"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Type to filter countries..."
            autoCapitalize="none"
            autoCorrect={false}
          />

          {filteredRegions.map(region => (
            <View key={region.name} style={styles.mobileRegionContainer}>
              <View style={styles.mobileRegionHeader}>
                <Text style={styles.mobileRegionTitle}>{region.name}</Text>
                <View style={styles.regionButtons}>
                  <TouchableOpacity
                    onPress={() => bulkSelect(region.countries, true)}
                    style={styles.regionButton}>
                    <Text style={styles.regionButtonText}>Select All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => bulkSelect(region.countries, false)}
                    style={styles.regionButton}>
                    <Text style={styles.regionButtonText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.mobileCircleGrid}>
                {region.countries.map((country: IPTVCountry) => {
                  const isSelected = selectedCountries.has(country.code);
                  return (
                    <TouchableOpacity
                      key={country.code}
                      style={styles.mobileCircleItem}
                      onPress={() => toggleCountry(country.code)}
                      activeOpacity={0.75}>
                      <View
                        style={[
                          styles.mobileFlagCircle,
                          isSelected && styles.mobileFlagCircleSelected,
                        ]}>
                        <Text style={styles.mobileFlagEmoji}>{country.flag}</Text>
                        {isSelected && (
                          <View style={styles.mobileStarBadge}>
                            <Icon name="star" size={10} color="#fff" />
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.mobileCountryName,
                          isSelected && styles.mobileCountryNameSelected,
                        ]}
                        numberOfLines={2}>
                        {country.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          <View style={styles.autoSaveInfo}>
            <Icon name="checkmark-circle" size={20} color="#30d158" />
            <Text style={styles.autoSaveText}>Changes are saved automatically</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── TV Layout ─────────────────────────────────────────────────────────────
  tvWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000',
  },
  tvLeftPanel: {
    width: scaleSize(360),
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: scaleSize(56),
    paddingBottom: scaleSize(32),
    paddingHorizontal: scaleSize(28),
  },
  tvLeftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleSize(8),
    marginBottom: scaleSize(4),
  },
  tvMainTitle: {
    color: '#fff',
    fontSize: scaleFontSize(32),
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  tvSelectedCount: {
    color: 'rgba(10, 132, 255, 0.9)',
    fontSize: scaleFontSize(14),
    fontWeight: '600',
    marginBottom: scaleSize(20),
    marginTop: scaleSize(4),
  },
  tvSearchBox: {
    marginBottom: scaleSize(12),
  },
  tvRegionList: {
    flex: 1,
  },
  tvRegionItem: {
    paddingVertical: scaleSize(14),
    paddingHorizontal: scaleSize(16),
    borderRadius: scaleSize(8),
    marginBottom: scaleSize(2),
  },
  tvRegionItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  tvRegionItemText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: scaleFontSize(20),
    fontWeight: '500',
  },
  tvRegionItemTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  tvAutoSaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleSize(6),
    paddingTop: scaleSize(16),
    marginTop: scaleSize(8),
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  tvAutoSaveText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: scaleFontSize(12),
  },
  tvRightPanel: {
    flex: 1,
    paddingTop: scaleSize(56),
    paddingHorizontal: scaleSize(40),
    paddingBottom: scaleSize(32),
  },
  tvRightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scaleSize(28),
  },
  tvRightTitle: {
    color: '#fff',
    fontSize: scaleFontSize(30),
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  tvHeaderButtons: {
    flexDirection: 'row',
    gap: scaleSize(10),
  },
  tvHeaderButton: {
    paddingHorizontal: scaleSize(18),
    paddingVertical: scaleSize(10),
    borderRadius: scaleSize(8),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  tvHeaderButtonText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: scaleFontSize(15),
    fontWeight: '600',
  },
  tvCircleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scaleSize(20),
    paddingBottom: scaleSize(40),
  },
  tvCircleItem: {
    width: ITEM_WIDTH,
    alignItems: 'center',
  },
  tvFlagCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_RADIUS,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
    marginBottom: scaleSize(8),
    overflow: 'hidden',
  },
  tvFlagCircleSelected: {
    borderColor: 'rgba(10, 132, 255, 0.85)',
    backgroundColor: 'rgba(10, 132, 255, 0.1)',
  },
  tvFlagEmoji: {
    fontSize: EMOJI_SIZE,
    lineHeight: EMOJI_SIZE * 1.2,
  },
  tvStarBadge: {
    position: 'absolute',
    bottom: scaleSize(7),
    right: scaleSize(7),
    width: scaleSize(22),
    height: scaleSize(22),
    borderRadius: scaleSize(11),
    backgroundColor: 'rgba(10, 132, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tvCountryName: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: scaleFontSize(13),
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: scaleFontSize(17),
  },
  tvCountryNameSelected: {
    color: '#fff',
    fontWeight: '700',
  },

  // ── Mobile Layout ─────────────────────────────────────────────────────────
  wrapper: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
  },
  backButtonContainer: {
    position: 'absolute',
    left: 16,
    zIndex: 100,
  },
  backButtonGlass: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: 'rgba(139, 92, 246, 0.6)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  backButton: {
    padding: 10,
    backgroundColor: 'transparent',
  },
  sectionForm: {
    width: '100%',
    maxWidth: 600,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  sectionTitle: {
    color: 'rgba(10, 132, 255, 0.95)',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sectionDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 15,
    marginBottom: 20,
    lineHeight: 22,
    fontWeight: '500',
  },
  selectedCount: {
    color: 'rgba(10, 132, 255, 0.95)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 14,
  },
  mobileRegionContainer: {
    marginTop: 20,
    marginBottom: 8,
  },
  mobileRegionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    flexWrap: 'wrap',
    gap: 8,
  },
  mobileRegionTitle: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 16,
    fontWeight: '700',
  },
  regionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  regionButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  regionButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
  mobileCircleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  mobileCircleItem: {
    width: 72,
    alignItems: 'center',
  },
  mobileFlagCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 5,
    overflow: 'hidden',
  },
  mobileFlagCircleSelected: {
    borderColor: 'rgba(10, 132, 255, 0.85)',
    backgroundColor: 'rgba(10, 132, 255, 0.1)',
  },
  mobileFlagEmoji: {
    fontSize: 26,
    lineHeight: 32,
  },
  mobileStarBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(10, 132, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileCountryName: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 13,
  },
  mobileCountryNameSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  autoSaveInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(48, 209, 88, 0.1)',
    borderRadius: 8,
    gap: 6,
  },
  autoSaveText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    fontWeight: '500',
  },
});
