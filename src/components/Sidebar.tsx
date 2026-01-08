import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { scaleSize, scaleFontSize } from '../utils/scaling';

interface SidebarProps {
  currentRoute: string;
}

export function Sidebar({ currentRoute }: SidebarProps) {
  const navigation = useNavigation<any>();
  const [focusedItem, setFocusedItem] = useState<string | null>(null);

  const navItems = [
    { name: 'Home', route: 'Home', icon: 'home-outline' },
    { name: 'TV Shows', route: 'TVShows', icon: 'tv-outline', section: 'library' },
    { name: 'Movies', route: 'Movies', icon: 'film-outline', section: 'library' },
    { name: 'Live TV', route: 'LiveTV', icon: 'radio-outline' },
    { name: 'Search', route: 'Search', icon: 'search-outline' },
    { name: 'Settings', route: 'Settings', icon: 'settings-outline' },
  ];

  const handleFocus = useCallback((route: string) => {
    setFocusedItem(route);
  }, []);

  const handleBlur = useCallback((route: string) => {
    // Use a small timeout to check if focus moved to another sidebar item
    // If so, the new item's onFocus will have already updated the state
    setTimeout(() => {
      setFocusedItem(current => {
        // Only clear if still set to this route (meaning focus left sidebar entirely)
        if (current === route) {
          return null;
        }
        return current;
      });
    }, 50);
  }, []);

  return (
    <View style={styles.sidebar}>
      <View style={styles.header}>
        <Text style={styles.logo}>Mediora</Text>
      </View>
      
      <ScrollView style={styles.navContainer} showsVerticalScrollIndicator={false}>
        {navItems.map((item, index) => {
          const isActive = currentRoute === item.route;
          const isFocused = focusedItem === item.route;
          
          return (
            <TouchableOpacity
              key={item.route}
              style={[
                styles.navItem,
                isActive && styles.navItemActive,
                isFocused && styles.navItemFocused,
              ]}
              onPress={() => navigation.navigate(item.route)}
              onFocus={() => handleFocus(item.route)}
              onBlur={() => handleBlur(item.route)}
              activeOpacity={0.7}
              focusable={true}
              hasTVPreferredFocus={index === 0}
              tvParallaxProperties={Platform.isTV ? {
                enabled: false,
              } : undefined}>
              <View style={[
                styles.navItemInner,
                isFocused && styles.navItemInnerFocused,
              ]}>
                <Icon
                  name={item.icon}
                  size={scaleSize(26)}
                  color={isActive && !isFocused ? '#a78bfa' : isFocused ? '#ffffff' : 'rgba(255, 255, 255, 0.7)'}
                  style={styles.navIcon}
                />
                <Text
                  style={[
                    styles.navText,
                    isActive && !isFocused && styles.navTextActive,
                    isFocused && styles.navTextFocused,
                  ]}>
                  {item.name}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: scaleSize(240),
    backgroundColor: 'rgba(18, 18, 20, 0.98)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(139, 92, 246, 0.3)',
    paddingTop: scaleSize(48),
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    paddingHorizontal: scaleSize(24),
    paddingBottom: scaleSize(28),
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(139, 92, 246, 0.4)',
    marginBottom: scaleSize(20),
  },
  logo: {
    fontSize: scaleFontSize(32),
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(139, 92, 246, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  navContainer: {
    flex: 1,
    paddingHorizontal: scaleSize(16),
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scaleSize(16),
    paddingHorizontal: scaleSize(20),
    borderRadius: scaleSize(12),
    marginBottom: scaleSize(8),
    backgroundColor: 'transparent',
  },
  navItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navItemInnerFocused: {
    transform: [{ scale: 1.05 }],
  },
  navItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.35)',
    borderLeftWidth: scaleSize(6),
    borderLeftColor: '#a78bfa',
    borderWidth: 3,
    borderColor: 'rgba(167, 139, 250, 0.7)',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  navItemFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderLeftWidth: scaleSize(6),
    borderLeftColor: '#ffffff',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    transform: [{ scale: 1.1 }],
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
  },
  navIcon: {
    marginRight: scaleSize(16),
    width: scaleSize(28),
  },
  navText: {
    fontSize: scaleFontSize(19),
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  navTextActive: {
    color: '#e9d5ff',
    fontWeight: '700',
    fontSize: scaleFontSize(20),
  },
  navTextFocused: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: scaleFontSize(20),
  },
});
