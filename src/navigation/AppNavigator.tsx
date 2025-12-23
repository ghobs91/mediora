import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
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

function MainMenuScreen({ navigation }: any) {
  const menuItems = [
    { name: 'Home', route: 'Home', icon: '🏠' },
    { name: 'Library', route: 'Library', icon: '📚' },
    { name: 'Search', route: 'Search', icon: '🔍' },
    { name: 'Settings', route: 'Settings', icon: '⚙️' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mediora</Text>
        <Text style={styles.subtitle}>Your Media Center</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.menuContainer}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.menuItem}
            onPress={() => navigation.navigate(item.route as any)}
            activeOpacity={0.7}>
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={styles.menuText}>{item.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000' },
        }}>
        <Stack.Screen name="MainMenu" component={MainMenuScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Library" component={LibraryScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
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
  header: {
    padding: 60,
    alignItems: 'center',
  },
  title: {
    fontSize: 72,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 32,
    color: '#888',
  },
  menuContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    padding: 40,
  },
  menuItem: {
    width: 300,
    height: 200,
    margin: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  menuIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  menuText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#fff',
  },
});
