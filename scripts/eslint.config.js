import base from '@optical/config/eslint/base';

export default [
  ...base,
  {
    // Command-line tools report progress on the console.
    rules: { 'no-console': 'off' },
  },
];
