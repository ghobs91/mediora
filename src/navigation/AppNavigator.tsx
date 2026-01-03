import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, StyleSheet } from 'react-native';
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

const Stack = createNativeStackNavigator<RootStackParamList>();

// Wrapper components that include the sidebar
function HomeWithNav() {
  return (
    <View style={styles.container}>
      <Sidebar currentRoute="Home" />
      <View style={styles.content}>
        <HomeScreen />
      </View>
    </View>
  );
}

function TVShowsWithNav() {
  return (
    <View style={styles.container}>
      <Sidebar currentRoute="TVShows" />
      <View style={styles.content}>
        <LibraryScreen filterType="tvshows" />
      </View>
    </View>
  );
}

function MoviesWithNav() {
  return (
    <View style={styles.container}>
      <Sidebar currentRoute="Movies" />
      <View style={styles.content}>
        <LibraryScreen filterType="movies" />
      </View>
    </View>
  );
}

function SearchWithNav() {
  return (
    <View style={styles.container}>
      <Sidebar currentRoute="Search" />
      <View style={styles.content}>
        <SearchScreen />
      </View>
    </View>
  );
}

function SettingsWithNav() {
  return (
    <View style={styles.container}>
      <Sidebar currentRoute="Settings" />
      <View style={styles.content}>
        <SettingsScreen />
      </View>
    </View>
  );
}

function LiveTVWithNav() {
  return (
    <View style={styles.container}>
      <Sidebar currentRoute="LiveTV" />
      <View style={styles.content}>
        <LiveTVScreen />
      </View>
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
