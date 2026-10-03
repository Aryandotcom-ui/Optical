import next from '@optical/config/eslint/next';

export default [
  ...next,
  {
    ignores: [
      '.next/**',
      'public/**',
      '.lighthouseci/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
];
