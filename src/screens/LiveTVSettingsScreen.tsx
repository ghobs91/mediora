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

export function LiveTVSettingsScreen() {
  const { settings, updateIPTVSettings } = useSettings();
  const { isMobile } = useDeviceType();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(
    new Set(settings.iptv?.selectedCountries || [])
  );
  const [searchQuery, setSearchQuery] = useState('');

  const toggleCountry = async (code: string) => {
    const newSelected = new Set(selectedCountries);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelectedCountries(newSelected);
    
    try {
      const countries = Array.from(newSelected);
      if (countries.length > 0) {
        await updateIPTVSettings({ selectedCountries: countries });
      } else {
        await updateIPTVSettings(null);
      }
    } catch (error) {
      console.error('Failed to auto-save IPTV settings:', error);
    }
  };

  const filteredRegions = IPTV_REGIONS.map(region => ({
    ...region,
    countries: region.countries.filter(country =>
      !searchQuery ||
      country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      country.code.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(region => region.countries.length > 0);

  const selectAllInRegion = async (regionName: string) => {
    const region = IPTV_REGIONS.find(r => r.name === regionName);
    if (region) {
      const newSelected = new Set(selectedCountries);
      region.countries.forEach(c => newSelected.add(c.code));
      setSelectedCountries(newSelected);
      
      try {
        const countries = Array.from(newSelected);
        await updateIPTVSettings({ selectedCountries: countries });
      } catch (error) {
        console.error('Failed to auto-save IPTV settings:', error);
      }
    }
  };

  const clearAllInRegion = async (regionName: string) => {
    const region = IPTV_REGIONS.find(r => r.name === regionName);
    if (region) {
      const newSelected = new Set(selectedCountries);
      region.countries.forEach(c => newSelected.delete(c.code));
      setSelectedCountries(newSelected);
      
      try {
        const countries = Array.from(newSelected);
        if (countries.length > 0) {
          await updateIPTVSettings({ selectedCountries: countries });
        } else {
          await updateIPTVSettings(null);
        }
      } catch (error) {
        console.error('Failed to auto-save IPTV settings:', error);
      }
    }
  };

  const dynamicStyles = {
    contentContainer: {
      paddingTop: isMobile ? insets.top + 72 : 48,
      paddingBottom: isMobile ? insets.bottom + 100 : 48,
      paddingHorizontal: isMobile ? 16 : 48,
    },
  };

  return (
    <View style={styles.wrapper}>
      {isMobile && (
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
      )}
      
      <ScrollView style={styles.container} contentContainerStyle={dynamicStyles.contentContainer}>
        <View style={styles.sectionForm}>
          <View style={styles.sectionHeader}>
            <Icon name="radio-outline" size={24} color="rgba(10, 132, 255, 0.95)" />
            <Text style={styles.sectionTitle}>Live TV Settings</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Select countries to add IPTV channels to Jellyfin. 
            Channels and EPG data will be managed via Jellyfin Live TV.
          </Text>
          
          <Text style={styles.selectedCount}>
            {selectedCountries.size} {selectedCountries.size === 1 ? 'country' : 'countries'} selected
          </Text>

          <FocusableInput
            label="Search Countries"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Type to filter countries..."
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.countryListContainer}>
            {filteredRegions.map(region => (
              <View key={region.name} style={styles.regionContainer}>
                <View style={styles.regionHeader}>
                  <Text style={styles.regionTitle}>{region.name}</Text>
                  <View style={styles.regionButtons}>
                    <TouchableOpacity
                      onPress={() => selectAllInRegion(region.name)}
                      style={styles.regionButton}>
                      <Text style={styles.regionButtonText}>Select All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => clearAllInRegion(region.name)}
                      style={styles.regionButton}>
                      <Text style={styles.regionButtonText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.countriesGrid}>
                  {region.countries.map((country: IPTVCountry) => {
                    const isSelected = selectedCountries.has(country.code);
                    return (
                      <TouchableOpacity
                        key={country.code}
                        style={[
                          styles.countryItem,
                          isSelected && styles.countryItemSelected,
                        ]}
                        onPress={() => toggleCountry(country.code)}>
                        <Text style={styles.countryFlag}>{country.flag}</Text>
                        <Text
                          style={[
                            styles.countryName,
                            isSelected && styles.countryNameSelected,
                          ]}
                          numberOfLines={1}>
                          {country.name}
                        </Text>
                        {isSelected && (
                          <Icon name="checkmark-circle" size={20} color="#30d158" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.autoSaveInfo}>
            <Icon name="checkmark-circle" size={20} color="#30d158" style={styles.autoSaveIcon} />
            <Text style={styles.autoSaveText}>
              Changes are saved automatically
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 24,
    fontWeight: '500',
  },
  selectedCount: {
    color: 'rgba(10, 132, 255, 0.95)',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
  },
  countryListContainer: {
    marginTop: 16,
    marginBottom: 24,
  },
  regionContainer: {
    marginBottom: 24,
  },
  regionHeader: {
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
  regionTitle: {
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
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  regionButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
  countriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 120,
    flexGrow: 1,
    flexBasis: '45%',
    maxWidth: '100%',
  },
  countryItemSelected: {
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
    borderColor: 'rgba(48, 209, 88, 0.5)',
  },
  countryFlag: {
    fontSize: 18,
  },
  countryName: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  countryNameSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  autoSaveInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(48, 209, 88, 0.1)',
    borderRadius: 8,
    gap: 6,
  },
  autoSaveIcon: {
    marginRight: 4,
  },
  autoSaveText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    fontWeight: '500',
  },
});
