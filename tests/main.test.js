/**
 * Tests for main.js
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

// Mock the imported functions before importing main.js
vi.mock('../src/settings.js', () => ({
  registerSettings: vi.fn(),
  MODULE_ID: 'journal-translator'
}));

vi.mock('../src/translation-handlers.js', () => ({
  translateJournal: vi.fn()
}));

vi.mock('../src/utils.js', () => ({
  showPageSelectionDialog: vi.fn()
}));

import { registerSettings } from '../src/settings.js';
import { translateJournal } from '../src/translation-handlers.js';
import { showPageSelectionDialog } from '../src/utils.js';

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
    showPageSelectionDialog.mockClear();
    global.game.journal.get.mockClear();
    global.ui.notifications.info.mockClear();
    global.ui.notifications.error.mockClear();
    global.foundry.applications.api.DialogV2.confirm.mockClear();
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

    it('should show page selection dialog when translate is clicked', async () => {
      const mockJournal = { 
        name: 'Test Journal',
        pages: [{ 
          id: 'page1', 
          name: 'Page 1', 
          text: { content: 'Content 1' },
          getFlag: vi.fn(() => false)
        }]
      };
      global.game.journal.get.mockReturnValue(mockJournal);
      showPageSelectionDialog.mockResolvedValue([mockJournal.pages[0]]);
      
      const mockApplication = {};
      const mockClickedElement = {
        dataset: {
          entryId: 'journal-123'
        }
      };
      
      contextMenuCallback(mockApplication, mockOptions);
      const translateCallback = mockOptions[0].callback;
      
      await translateCallback(mockClickedElement);
      
      expect(global.game.journal.get).toHaveBeenCalledWith('journal-123');
      expect(showPageSelectionDialog).toHaveBeenCalledWith(mockJournal);
    });

    it('should handle journal translation when user confirms', async () => {
      const mockJournal = {
        name: 'Test Journal',
        pages: [{
          id: 'page1',
          name: 'Page 1',
          text: { content: 'Content 1' },
          getFlag: vi.fn(() => false)
        }]
      };
      const selectedPages = [mockJournal.pages[0]];

      global.game.journal.get.mockReturnValue(mockJournal);
      showPageSelectionDialog.mockResolvedValue(selectedPages);
      global.foundry.applications.api.DialogV2.confirm.mockResolvedValue(true);

      const mockApplication = {};
      const mockClickedElement = {
        dataset: {
          entryId: 'journal-123'
        }
      };

      contextMenuCallback(mockApplication, mockOptions);
      const translateCallback = mockOptions[0].callback;

      await translateCallback(mockClickedElement);

      expect(global.game.journal.get).toHaveBeenCalledWith('journal-123');
      expect(showPageSelectionDialog).toHaveBeenCalledWith(mockJournal);
      expect(global.ui.notifications.info).toHaveBeenCalledWith('Translating journal entry: Test Journal');
      expect(translateJournal).toHaveBeenCalledWith(mockJournal, selectedPages);
    });

    it('should handle documentId fallback for journal identification', async () => {
      const mockJournal = {
        name: 'Test Journal',
        pages: [{
          id: 'page1',
          name: 'Page 1',
          text: { content: 'Content 1' },
          getFlag: vi.fn(() => false)
        }]
      };
      const selectedPages = [mockJournal.pages[0]];

      global.game.journal.get.mockReturnValue(mockJournal);
      showPageSelectionDialog.mockResolvedValue(selectedPages);
      global.foundry.applications.api.DialogV2.confirm.mockResolvedValue(true);

      const mockApplication = {};
      const mockClickedElement = {
        dataset: {
          documentId: 'journal-456' // No entryId, but has documentId
        }
      };

      contextMenuCallback(mockApplication, mockOptions);
      const translateCallback = mockOptions[0].callback;

      await translateCallback(mockClickedElement);

      expect(global.game.journal.get).toHaveBeenCalledWith('journal-456');
      expect(translateJournal).toHaveBeenCalledWith(mockJournal, selectedPages);
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
      
      await translateCallback(mockClickedElement);
      
      expect(global.game.journal.get).toHaveBeenCalledWith('non-existent-journal');
      expect(global.ui.notifications.error).toHaveBeenCalledWith('Could not process the selected journal entry.');
      expect(showPageSelectionDialog).not.toHaveBeenCalled();
      expect(translateJournal).not.toHaveBeenCalled();
    });

    it('should not translate when user cancels page selection', async () => {
      const mockJournal = { 
        name: 'Test Journal',
        pages: [{ 
          id: 'page1', 
          name: 'Page 1', 
          text: { content: 'Content 1' },
          getFlag: vi.fn(() => false)
        }]
      };
      
      global.game.journal.get.mockReturnValue(mockJournal);
      showPageSelectionDialog.mockResolvedValue([]); // User cancelled or selected no pages
      
      const mockApplication = {};
      const mockClickedElement = {
        dataset: {
          entryId: 'journal-123'
        }
      };
      
      contextMenuCallback(mockApplication, mockOptions);
      const translateCallback = mockOptions[0].callback;
      
      await translateCallback(mockClickedElement);
      
      expect(global.game.journal.get).toHaveBeenCalledWith('journal-123');
      expect(showPageSelectionDialog).toHaveBeenCalledWith(mockJournal);
      expect(global.ui.notifications.info).toHaveBeenCalledWith('No pages selected for translation.');
      expect(global.foundry.applications.api.DialogV2.confirm).not.toHaveBeenCalled();
      expect(translateJournal).not.toHaveBeenCalled();
    });

    it('should not translate when user cancels confirmation dialog', async () => {
      const mockJournal = {
        name: 'Test Journal',
        pages: [{
          id: 'page1',
          name: 'Page 1',
          text: { content: 'Content 1' },
          getFlag: vi.fn(() => false)
        }]
      };
      const selectedPages = [mockJournal.pages[0]];

      global.game.journal.get.mockReturnValue(mockJournal);
      showPageSelectionDialog.mockResolvedValue(selectedPages);
      global.foundry.applications.api.DialogV2.confirm.mockResolvedValue(false);

      const mockApplication = {};
      const mockClickedElement = {
        dataset: {
          entryId: 'journal-123'
        }
      };

      contextMenuCallback(mockApplication, mockOptions);
      const translateCallback = mockOptions[0].callback;

      await translateCallback(mockClickedElement);

      expect(global.game.journal.get).toHaveBeenCalledWith('journal-123');
      expect(showPageSelectionDialog).toHaveBeenCalledWith(mockJournal);
      expect(global.foundry.applications.api.DialogV2.confirm).toHaveBeenCalled();
      expect(translateJournal).not.toHaveBeenCalled();
    });

    it('should handle missing dataset gracefully', async () => {
      global.game.journal.get.mockReturnValue(null);
      
      const mockApplication = {};
      const mockClickedElement = {
        dataset: {} // No entryId or documentId
      };
      
      contextMenuCallback(mockApplication, mockOptions);
      const translateCallback = mockOptions[0].callback;
      
      await translateCallback(mockClickedElement);
      
      expect(global.game.journal.get).toHaveBeenCalledWith(undefined);
      expect(global.ui.notifications.error).toHaveBeenCalledWith('Could not process the selected journal entry.');
      expect(showPageSelectionDialog).not.toHaveBeenCalled();
    });
  });

  describe('hook registration', () => {
    it('should register all required hooks', () => {
      expect(global.Hooks.on).toHaveBeenCalledWith('init', expect.any(Function));
      expect(global.Hooks.on).toHaveBeenCalledWith('getJournalEntryContextOptions', expect.any(Function));
      expect(global.Hooks.on).toHaveBeenCalledWith('getJournalDirectoryFolderContext', expect.any(Function));
      expect(global.Hooks.on).toHaveBeenCalledTimes(3);
    });
  });

  describe('folder context menu', () => {
    let folderContextCallback;
    let mockOptions;

    beforeEach(() => {
      mockOptions = [];
      const hookCall = global.Hooks.on.mock.calls.find(
        call => call[0] === 'getJournalDirectoryFolderContext'
      );
      expect(hookCall).toBeDefined();
      folderContextCallback = hookCall[1];
    });

    it('should not add Translate All when enableFolderMenu is false', () => {
      global.game.settings.get.mockImplementation((moduleId, key) =>
        key === 'enableFolderMenu' ? false : undefined
      );

      folderContextCallback({}, mockOptions);

      expect(mockOptions).toHaveLength(0);
    });

    it('should add Translate All option when enableFolderMenu is true', () => {
      global.game.settings.get.mockImplementation((moduleId, key) =>
        key === 'enableFolderMenu' ? true : undefined
      );

      folderContextCallback({}, mockOptions);

      expect(mockOptions).toHaveLength(1);
      expect(mockOptions[0].name).toBe('Translate All');
      expect(mockOptions[0].icon).toBe('<i class="fas fa-language"></i>');
    });

    it('should show error when folder cannot be resolved', async () => {
      global.game.settings.get.mockImplementation((moduleId, key) =>
        key === 'enableFolderMenu' ? true : undefined
      );
      global.game.folders.get.mockReturnValue(null);

      folderContextCallback({}, mockOptions);
      const clickedEl = { dataset: { folderId: 'folder-xyz' }, closest: vi.fn(() => null) };
      await mockOptions[0].callback(clickedEl);

      expect(global.ui.notifications.error).toHaveBeenCalledWith(
        'Could not identify the selected folder.'
      );
    });
  });
});
