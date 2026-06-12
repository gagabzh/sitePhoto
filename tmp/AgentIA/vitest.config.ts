import { defineConfig } from 'vitest/config';

/**
 * Vitest Configuration for QA Agent Testing
 * 
 * This config allows you to:
 * - Run all tests: npm test
 * - Run only QA Agent: npm run test:qa
 * - Run only app tests: npm run test:app
 * - Run with coverage: npm run test:coverage
 * 
 * Place this file at your project root: vitest.config.ts
 */

export default defineConfig({
  test: {
    // Global setup
    globals: true,
    environment: 'node',
    
    // Test files pattern
    include: ['**/*.test.ts', '**/*.test.js'],
    
    // Exclude node_modules and dist
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    
    // Timeout for each test
    testTimeout: 10000,
    
    // Reporter
    reporters: ['verbose'],
    
    // Coverage options (optional)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.test.js',
      ],
    },
  },
});
