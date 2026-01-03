import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';

interface SidebarProps {
  currentRoute: string;
}

export function Sidebar({ currentRoute }: SidebarProps) {
  const navigation = useNavigation<any>();
  const [focusedItem, setFocusedItem] = React.useState<string | null>(null);

  const navItems = [
    { name: 'Home', route: 'Home', icon: 'home-outline' },
    { name: 'TV Shows', route: 'TVShows', icon: 'tv-outline', section: 'library' },
    { name: 'Movies', route: 'Movies', icon: 'film-outline', section: 'library' },
    { name: 'Live TV', route: 'LiveTV', icon: 'radio-outline' },
    { name: 'Search', route: 'Search', icon: 'search-outline' },
    { name: 'Settings', route: 'Settings', icon: 'settings-outline' },
  ];

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
                isFocused && !isActive && styles.navItemFocused,
              ]}
              onPress={() => navigation.navigate(item.route)}
              onFocus={() => setFocusedItem(item.route)}
              onBlur={() => setFocusedItem(null)}
              activeOpacity={0.7}
              focusable={true}
              hasTVPreferredFocus={index === 0}>
              <Icon
                name={item.icon}
                size={22}
                color={isActive ? '#8b5cf6' : 'rgba(255, 255, 255, 0.7)'}
                style={styles.navIcon}
              />
              <Text
                style={[
                  styles.navText,
                  isActive && styles.navTextActive,
                ]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 220,
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    backdropFilter: 'blur(20px)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 48,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 16,
  },
  logo: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.8,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  navContainer: {
    flex: 1,
    paddingHorizontal: 12,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  navItemFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    transform: [{ scale: 1.02 }],
  },
  navIcon: {
    marginRight: 12,
    width: 22,
  },
  navText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  navTextActive: {
    color: '#8b5cf6',
    fontWeight: '600',
  },
});
