/* eslint-env jest */
// Register the official AsyncStorage in-memory mock before tests run.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// react-native-fs and react-native-document-picker have no bundled jest
// mocks and throw when their native modules are missing under jest.
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    exists: jest.fn(() => Promise.resolve(false)),
    readDir: jest.fn(() => Promise.resolve([])),
    stat: jest.fn(() =>
      Promise.resolve({ size: 0, mtime: new Date(), isFile: () => true }),
    ),
    DocumentDirectoryPath: '',
  },
}));

jest.mock('react-native-document-picker', () => ({
  __esModule: true,
  default: { pick: jest.fn(() => Promise.resolve([])) },
}));

// react-native-config reads env at native-module level; return an empty
// config object under jest.
jest.mock('react-native-config', () => ({}));

// Liquid Glass needs a native module; fall back to a plain View under jest.
jest.mock('@callstack/liquid-glass', () => {
  const React = require('react');
  const { View } = require('react-native');
  const LiquidGlassView = (props) =>
    React.createElement(View, props, props.children);
  return {
    isLiquidGlassSupported: false,
    LiquidGlassView,
  };
});
