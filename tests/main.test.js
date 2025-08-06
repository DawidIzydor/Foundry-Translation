/**
 * Tests for main.js
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

// Mock the imported functions before importing main.js
vi.mock('../src/settings.js', () => ({
  registerSettings: vi.fn()
}));

vi.mock('../src/translation-handlers.js', () => ({
  translateJournal: vi.fn()
}));

import { registerSettings } from '../src/settings.js';
import { translateJournal } from '../src/translation-handlers.js';

describe('main.js', () => {
  beforeAll(async () => {
    // Import main.js dynamically to trigger the Hooks.on calls
    // This ensures it runs after the global mocks are set up
    await import('../main.js');
  });

  beforeEach(() => {
    // Reset mocks before each test, but don't clear the Hooks.on calls history
    // Only clear the functions that should be reset between tests
    registerSettings.mockClear();
    translateJournal.mockClear();
    global.game.journal.get.mockClear();
    global.ui.notifications.info.mockClear();
    global.ui.notifications.error.mockClear();
    global.Dialog.confirm.mockClear();
  });

  describe('initialization', () => {
    it('should register settings on init hook', () => {
      // Find the init hook callback
      const initHookCall = global.Hooks.on.mock.calls.find(call => call[0] === 'init');
      expect(initHookCall).toBeDefined();
      
      // Execute the init callback
      const initCallback = initHookCall[1];
      initCallback();
      
      expect(registerSettings).toHaveBeenCalled();
    });
  });

  describe('context menu integration', () => {
    let contextMenuCallback;
    let mockOptions;

    beforeEach(() => {
      mockOptions = [];
      
      // Find the context menu hook callback
      const contextMenuHookCall = global.Hooks.on.mock.calls.find(call => call[0] === 'getJournalEntryContextOptions');
      expect(contextMenuHookCall).toBeDefined();
      
      contextMenuCallback = contextMenuHookCall[1];
    });

    it('should add translate option to context menu', () => {
      const mockApplication = {};
      
      contextMenuCallback(mockApplication, mockOptions);
      
      expect(mockOptions).toHaveLength(1);
      expect(mockOptions[0].name).toBe('Translate');
      expect(mockOptions[0].icon).toBe('<i class="fas fa-language"></i>');
      expect(typeof mockOptions[0].callback).toBe('function');
    });

    it('should show confirmation dialog when translate is clicked', () => {
      const mockApplication = {};
      const mockClickedElement = {
        dataset: {
          entryId: 'journal-123'
        }
      };
      
      contextMenuCallback(mockApplication, mockOptions);
      const translateCallback = mockOptions[0].callback;
      
      translateCallback(mockClickedElement);
      
      expect(global.Dialog.confirm).toHaveBeenCalledWith({
        title: 'Translate Journal Entry',
        content: '<p>This translation may take several minutes depending on the journal size and OpenAI API speed. Do you want to continue?</p>',
        yes: expect.any(Function),
        no: expect.any(Function),
        defaultYes: false
      });
    });

    it('should handle journal translation when user confirms', async () => {
      const mockJournal = { name: 'Test Journal' };
      global.game.journal.get.mockReturnValue(mockJournal);
      
      const mockApplication = {};
      const mockClickedElement = {
        dataset: {
          entryId: 'journal-123'
        }
      };
      
      contextMenuCallback(mockApplication, mockOptions);
      const translateCallback = mockOptions[0].callback;
      
      translateCallback(mockClickedElement);
      
      // Get the confirmation callback
      const confirmationCall = global.Dialog.confirm.mock.calls[0][0];
      const yesCallback = confirmationCall.yes;
      
      await yesCallback();
      
      expect(global.game.journal.get).toHaveBeenCalledWith('journal-123');
      expect(global.ui.notifications.info).toHaveBeenCalledWith('Translating journal entry: Test Journal');
      expect(translateJournal).toHaveBeenCalledWith(mockJournal);
    });

    it('should handle documentId fallback for journal identification', async () => {
      const mockJournal = { name: 'Test Journal' };
      global.game.journal.get.mockReturnValue(mockJournal);
      
      const mockApplication = {};
      const mockClickedElement = {
        dataset: {
          documentId: 'journal-456' // No entryId, but has documentId
        }
      };
      
      contextMenuCallback(mockApplication, mockOptions);
      const translateCallback = mockOptions[0].callback;
      
      translateCallback(mockClickedElement);
      
      // Get the confirmation callback
      const confirmationCall = global.Dialog.confirm.mock.calls[0][0];
      const yesCallback = confirmationCall.yes;
      
      await yesCallback();
      
      expect(global.game.journal.get).toHaveBeenCalledWith('journal-456');
      expect(translateJournal).toHaveBeenCalledWith(mockJournal);
    });

    it('should show error when journal is not found', async () => {
      global.game.journal.get.mockReturnValue(null);
      
      const mockApplication = {};
      const mockClickedElement = {
        dataset: {
          entryId: 'non-existent-journal'
        }
      };
      
      contextMenuCallback(mockApplication, mockOptions);
      const translateCallback = mockOptions[0].callback;
      
      translateCallback(mockClickedElement);
      
      // Get the confirmation callback
      const confirmationCall = global.Dialog.confirm.mock.calls[0][0];
      const yesCallback = confirmationCall.yes;
      
      await yesCallback();
      
      expect(global.game.journal.get).toHaveBeenCalledWith('non-existent-journal');
      expect(global.ui.notifications.error).toHaveBeenCalledWith('Could not process the selected journal entry.');
      expect(translateJournal).not.toHaveBeenCalled();
    });

    it('should not translate when user cancels confirmation', () => {
      const mockApplication = {};
      const mockClickedElement = {
        dataset: {
          entryId: 'journal-123'
        }
      };
      
      contextMenuCallback(mockApplication, mockOptions);
      const translateCallback = mockOptions[0].callback;
      
      translateCallback(mockClickedElement);
      
      // Get the confirmation callback
      const confirmationCall = global.Dialog.confirm.mock.calls[0][0];
      const noCallback = confirmationCall.no;
      
      noCallback();
      
      expect(global.game.journal.get).not.toHaveBeenCalled();
      expect(translateJournal).not.toHaveBeenCalled();
    });

    it('should handle missing dataset gracefully', async () => {
      const mockApplication = {};
      const mockClickedElement = {
        dataset: {} // No entryId or documentId
      };
      
      contextMenuCallback(mockApplication, mockOptions);
      const translateCallback = mockOptions[0].callback;
      
      translateCallback(mockClickedElement);
      
      // Get the confirmation callback
      const confirmationCall = global.Dialog.confirm.mock.calls[0][0];
      const yesCallback = confirmationCall.yes;
      
      await yesCallback();
      
      expect(global.game.journal.get).toHaveBeenCalledWith(undefined);
      expect(global.ui.notifications.error).toHaveBeenCalledWith('Could not process the selected journal entry.');
    });
  });

  describe('hook registration', () => {
    it('should register both required hooks', () => {
      expect(global.Hooks.on).toHaveBeenCalledWith('init', expect.any(Function));
      expect(global.Hooks.on).toHaveBeenCalledWith('getJournalEntryContextOptions', expect.any(Function));
      expect(global.Hooks.on).toHaveBeenCalledTimes(2);
    });
  });
});
