import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  HomeScreen,
  LibraryScreen,
  SearchScreen,
  SettingsScreen,
  PlayerScreen,
  ItemDetailsScreen,
  TMDBDetailsScreen,
} from '../screens';
import { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface TopNavProps {
  currentRoute: string;
}

function TopNav({ currentRoute }: TopNavProps) {
  const navigation = useNavigation<any>();
  const [focusedItem, setFocusedItem] = React.useState<string | null>(null);
  
  const navItems = [
    { name: 'Home', route: 'Home', icon: '🏠' },
    { name: 'TV Shows', route: 'TVShows', icon: '📺' },
    { name: 'Movies', route: 'Movies', icon: '🎬' },
    { name: 'Search', route: 'Search', icon: '🔍' },
    { name: 'Settings', route: 'Settings', icon: '⚙️' },
  ];

  return (
    <View style={styles.topNav}>
      <Text style={styles.logo}>Mediora</Text>
      <View style={styles.navItems}>
        {navItems.map((item, index) => (
          <TouchableOpacity
            key={item.route}
            style={[
              styles.navItem,
              currentRoute === item.route && styles.navItemActive,
              focusedItem === item.route && currentRoute !== item.route && styles.navItemFocused,
            ]}
            onPress={() => navigation.navigate(item.route as any)}
            onFocus={() => setFocusedItem(item.route)}
            onBlur={() => setFocusedItem(null)}
            activeOpacity={0.7}
            focusable={true}
            hasTVPreferredFocus={index === 0}>
            <Text style={[
              styles.navIcon,
              { color: currentRoute === item.route ? '#fff' : '#888' }
            ]}>{item.icon}</Text>
            <Text style={[
              styles.navText,
              currentRoute === item.route && styles.navTextActive,
            ]}>{item.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// Wrapper components that include the top nav
function HomeWithNav() {
  return (
    <View style={styles.container}>
      <TopNav currentRoute="Home" />
      <HomeScreen />
    </View>
  );
}

function TVShowsWithNav() {
  return (
    <View style={styles.container}>
      <TopNav currentRoute="TVShows" />
      <LibraryScreen filterType="tvshows" />
    </View>
  );
}

function MoviesWithNav() {
  return (
    <View style={styles.container}>
      <TopNav currentRoute="Movies" />
      <LibraryScreen filterType="movies" />
    </View>
  );
}

function SearchWithNav() {
  return (
    <View style={styles.container}>
      <TopNav currentRoute="Search" />
      <SearchScreen />
    </View>
  );
}

function SettingsWithNav() {
  return (
    <View style={styles.container}>
      <TopNav currentRoute="Settings" />
      <SettingsScreen />
    </View>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000' },
        }}>
        <Stack.Screen name="Home" component={HomeWithNav} />
        <Stack.Screen name="TVShows" component={TVShowsWithNav} />
        <Stack.Screen name="Movies" component={MoviesWithNav} />
        <Stack.Screen name="Search" component={SearchWithNav} />
        <Stack.Screen name="Settings" component={SettingsWithNav} />
        <Stack.Screen
          name="Player"
          component={PlayerScreen}
          options={{
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="ItemDetails"
          component={ItemDetailsScreen}
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="TMDBDetails"
          component={TMDBDetailsScreen}
          options={{
            animation: 'slide_from_right',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingVertical: 18,
    backgroundColor: 'rgba(28, 28, 30, 0.72)',
    backdropFilter: 'blur(20px)',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
  },
  logo: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    marginRight: 72,
    letterSpacing: 0.8,
  },
  navItems: {
    flexDirection: 'row',
    gap: 10,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderColor: 'transparent',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  navItemFocused: {
    borderColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    transform: [{ scale: 1.05 }],
  },
  navIcon: {
    marginRight: 8,
    fontSize: 26,
  },
  navText: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  navTextActive: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '700',
  },
});
