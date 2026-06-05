module.exports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['react-native', 'react-native-*', '@react-native/*', '@react-native-*/*'],
            message:
              'packages/core must not import platform code. Implement the PlaybackController interface in packages/tv or packages/desktop instead.',
          },
        ],
      },
    ],
  },
};
