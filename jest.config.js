module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@callstack|@noble|react-native-fs|react-native-document-picker|react-native-config|react-native-vector-icons|react-native-video|react-native-linear-gradient)/)',
  ],
};
