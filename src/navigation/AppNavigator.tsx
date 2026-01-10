import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  HomeScreen,
  LibraryScreen,
  SearchScreen,
  SettingsScreen,
  PlayerScreen,
  ItemDetailsScreen,
  TMDBDetailsScreen,
  LiveTVScreen,
  LivePlayerScreen,
} from '../screens';
import { Sidebar } from '../components/Sidebar';
import { RootStackParamList } from '../types';
import { useDeviceType } from '../hooks/useResponsive';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Layout wrapper that handles sidebar visibility
function ScreenWithNav({ children, currentRoute }: { children: React.ReactNode; currentRoute: string }) {
  const { showSidebar } = useDeviceType();

  return (
    <View style={styles.container}>
      {showSidebar && <Sidebar currentRoute={currentRoute} />}
      <View style={styles.content}>
        {/* Mobile sidebar (hamburger menu) - rendered inside content when sidebar is hidden */}
        {!showSidebar && <Sidebar currentRoute={currentRoute} />}
        {children}
      </View>
    </View>
  );
}

// Wrapper components that include the sidebar
function HomeWithNav() {
  return (
    <ScreenWithNav currentRoute="Home">
      <HomeScreen />
    </ScreenWithNav>
  );
}

function TVShowsWithNav() {
  return (
    <ScreenWithNav currentRoute="TVShows">
      <LibraryScreen filterType="tvshows" />
    </ScreenWithNav>
  );
}

function MoviesWithNav() {
  return (
    <ScreenWithNav currentRoute="Movies">
      <LibraryScreen filterType="movies" />
    </ScreenWithNav>
  );
}

function SearchWithNav() {
  return (
    <ScreenWithNav currentRoute="Search">
      <SearchScreen />
    </ScreenWithNav>
  );
}

function SettingsWithNav() {
  return (
    <ScreenWithNav currentRoute="Settings">
      <SettingsScreen />
    </ScreenWithNav>
  );
}

function LiveTVWithNav() {
  return (
    <ScreenWithNav currentRoute="LiveTV">
      <LiveTVScreen />
    </ScreenWithNav>
  );
}

export function AppNavigator() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#000' },
            animation: 'none',
          }}>
          <Stack.Screen name="Home" component={HomeWithNav} />
          <Stack.Screen name="TVShows" component={TVShowsWithNav} />
          <Stack.Screen name="Movies" component={MoviesWithNav} />
          <Stack.Screen name="LiveTV" component={LiveTVWithNav} />
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
            name="LivePlayer"
            component={LivePlayerScreen}
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
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    backgroundColor: '#000',
  },
});
