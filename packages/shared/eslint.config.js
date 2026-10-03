import base from '@optical/config/eslint/base';

export default [
  ...base,
  {
    // Mesh code indexes typed arrays and outlines inside loops whose bounds
    // are the arrays' own lengths. With noUncheckedIndexedAccess every read is
    // `T | undefined`; guarding each one would bury the geometry, so non-null
    // assertions are allowed here and nowhere else in production code.
    files: ['src/frame-geometry/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
];
