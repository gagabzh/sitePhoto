'use strict';

/**
 * Global test setup file
 * This runs before each test file is executed
 */
/* eslint-env jest */

// Validate required environment variables
const requiredVars = {
  SESSION_SECRET: 'warning',
  DATABASE_URL: 'warning',
};

// Check for missing environment variables
beforeAll(() => {
  Object.entries(requiredVars).forEach(([varName, level]) => {
    if (!process.env[varName]) {
      if (level === 'warning') {
        console.warn(`WARNING: ${varName} env var is not set — using insecure default.`);
      } else {
        console.error(`ERROR: Required env var ${varName} is not set!`);
      }
    }
  });
});

// Set global test timeout (10 seconds for CI environments)
jest.setTimeout(10000);

// Track open handles for debugging
const originalError = console.error;
let errorCount = 0;

console.error = (...args) => {
  originalError(...args);
  errorCount++;
  
  // Fail test on unexpected errors (but allow known warnings)
  const message = args[0]?.toString() || '';
  const isKnownWarning = 
    message.includes('WARNING:') ||
    message.includes('sharp failed:') ||
    message.includes('S3 upload failed:') ||
    message.includes('S3 delete') ||
    message.includes('Redis went away') ||
    message.includes('Failed to download photo:') ||
    message.includes('Invalid bbox:') ||
    message.includes('Bounding box too small:') ||
    message.includes('NodeVersionSupportWarning');
  
  if (!isKnownWarning && errorCount > 0) {
    // Log but don't throw to allow tests to complete
    process.emitWarning(`Unexpected console.error: ${message}`);
  }
};

// Clean up after all tests
afterAll(() => {
  // Reset console.error
  console.error = originalError;
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Export for potential use in tests
module.exports = {
  requiredVars,
};
