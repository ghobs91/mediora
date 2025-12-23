# Mediora

A cross-platform TV application built with [**React Native tvOS**](https://github.com/react-native-tvos/react-native-tvos) for **Apple TV** and **Android TV**.

## Features

- 🍎 **Apple TV (tvOS)** - Full support for tvOS 15.1+
- 🤖 **Android TV** - Full support for Android TV API level 24+
- ⚡ **Hermes JS Engine** - Enabled by default for optimal performance
- 🏗️ **New Architecture (Fabric)** - React Native's new rendering system
- 📺 **TV Remote Support** - Native focus-based navigation
- 🎨 **TypeScript** - Full TypeScript support included

## Prerequisites

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

### For Apple TV Development (macOS only)
- Xcode 15+ with tvOS SDK
- Apple TV Simulator or physical Apple TV device
- CocoaPods (`sudo gem install cocoapods`)

### For Android TV Development
- Android Studio with Android TV emulator
- Android TV emulator (API level 24+) or physical Android TV device

## Getting Started

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android TV

```sh
# Using npm - run on Android TV emulator
npm run android

# Or specify a specific Android TV device/emulator
npx react-native run-android --device tv_api_31
```

### Apple TV (tvOS)

For tvOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

To run on Apple TV Simulator:

```sh
# Using npm
npm run ios

# Or specify Apple TV simulator explicitly
npx react-native run-ios --simulator "Apple TV"
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native TV development, take a look at the following resources:

- [React Native tvOS GitHub](https://github.com/react-native-tvos/react-native-tvos) - The official react-native-tvos repository
- [React Native tvOS Wiki](https://github.com/react-native-tvos/react-native-tvos/wiki) - Detailed TV development guides
- [React Native Website](https://reactnative.dev) - Learn more about React Native
- [Getting Started](https://reactnative.dev/docs/environment-setup) - Environment setup guide

## TV-Specific APIs

### Platform Detection

```javascript
import { Platform } from 'react-native';

// Check if running on any TV
const isTV = Platform.isTV;

// Check specifically for Apple TV
const isAppleTV = Platform.isTVOS;
```

### TV Remote Event Handling

```javascript
import { useTVEventHandler } from 'react-native';

function MyComponent() {
  useTVEventHandler((evt) => {
    console.log('TV Event:', evt.eventType);
    // Events: 'up', 'down', 'left', 'right', 'select', 'playPause', etc.
  });
  
  return <View>...</View>;
}
```

### Focus-based Navigation

The `Pressable`, `TouchableHighlight`, and `TouchableOpacity` components work automatically with TV remote navigation:

- `onFocus()` - When the view receives focus
- `onBlur()` - When the view loses focus
- `onPress()` - When the select button is pressed
- `onLongPress()` - When the select button is held
