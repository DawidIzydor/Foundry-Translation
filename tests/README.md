# Test Documentation

This directory contains comprehensive tests for the Foundry VTT Journal Translator module.

## Test Structure

### Unit Tests
- **`utils.test.js`** - Tests for utility functions (`createPageUpdates`, `createTranslatedPagesData`)
- **`settings.test.js`** - Tests for module settings registration and configuration
- **`openai-batch.test.js`** - Tests for OpenAI API integration and batch processing
- **`translation-handlers.test.js`** - Tests for translation workflow handlers
- **`main.test.js`** - Tests for main module initialization and context menu integration

### Integration Tests
- **`integration.test.js`** - End-to-end workflow tests covering complete translation scenarios

## Running Tests

### Prerequisites
Install dependencies:
```bash
npm install
```

### Available Scripts

```bash
# Run all tests once
npm test

# Run tests in watch mode (automatically re-run on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with interactive UI
npm run test:ui
```

## Test Features

### Mocking Strategy
The tests use comprehensive mocking to simulate the Foundry VTT environment:

- **Global Objects**: `game`, `ui`, `Dialog`, `JournalEntry`, `Hooks`, `FormApplication`
- **Browser APIs**: `fetch`, `File`, `FormData`
- **Module Dependencies**: OpenAI batch functions, utility functions

### Test Coverage

The test suite covers:

✅ **Happy Path Scenarios**
- Successful translation workflows for all modes (new, prepend, append, replace)
- Proper API interactions with OpenAI
- Correct data transformations

✅ **Error Handling**
- Missing API keys
- Network failures
- API errors
- Partial translation failures
- Timeout scenarios

✅ **Edge Cases**
- Empty content
- Null/undefined values
- Invalid translations
- Mixed success/failure scenarios

✅ **Integration Scenarios**
- Full end-to-end workflows
- Settings integration
- Context menu integration

### Mock Data Examples

The tests use realistic mock data including:
- Journal entries with multiple pages
- HTML content with Foundry-specific tags (@Check, etc.)
- Various page types and formats
- Ownership and folder structures

## Test Configuration

### Vitest Configuration (`vitest.config.js`)
- **Environment**: jsdom (simulates browser environment)
- **Globals**: Enabled for describe/it/expect
- **Setup**: Automatic mock setup via `tests/setup.js`
- **Coverage**: C8 provider with text, JSON, and HTML reports

### Setup File (`tests/setup.js`)
Provides global mocks for:
- Foundry VTT game objects
- Browser APIs
- UI notification system
- Dialog system

## Writing New Tests

### Test Structure Example

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { functionToTest } from '../src/module.js';

describe('Module Name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup test-specific mocks
  });

  describe('Function Name', () => {
    it('should handle normal case', () => {
      // Arrange
      const input = 'test input';
      
      // Act
      const result = functionToTest(input);
      
      // Assert
      expect(result).toBe('expected output');
    });

    it('should handle error case', () => {
      // Test error scenarios
    });
  });
});
```

### Mock Guidelines

1. **Reset mocks** in `beforeEach()` using `vi.clearAllMocks()`
2. **Mock external dependencies** at the module level
3. **Use realistic test data** that reflects actual Foundry VTT structures
4. **Test both success and failure paths**
5. **Verify side effects** (notifications, API calls, etc.)

## Continuous Integration

Tests are automatically run on:
- Pull requests
- Pushes to main branch
- Release branches

See `.github/workflows/test.yml` for CI configuration.

## Debugging Tests

### Common Issues

1. **Mock not working**: Ensure mock is set up before importing the module
2. **Async test failing**: Use `await` for async operations
3. **Global not found**: Add missing globals to `tests/setup.js`

### Debug Tips

```javascript
// Log mock calls
console.log(mockFunction.mock.calls);

// Check if mock was called
expect(mockFunction).toHaveBeenCalled();

// Debug test data
console.log(JSON.stringify(testData, null, 2));
```

## Coverage Reports

Coverage reports are generated in the `coverage/` directory:
- `coverage/index.html` - Interactive HTML report
- `coverage/coverage-summary.json` - Summary data
- `coverage/lcov.info` - LCOV format for CI tools

Target coverage: **90%+ for critical paths**

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure all tests pass
3. Maintain or improve coverage
4. Update test documentation if needed
