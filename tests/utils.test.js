/**
 * Tests for utils.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPageUpdates, createTranslatedPagesData, showPageSelectionDialog, getJournalsInFolder, showFolderSelectionDialog } from '../src/utils.js';

describe('utils.js', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Mock global UI
    global.ui = {
      notifications: {
        warn: vi.fn()
      }
    };
  });

  describe('createPageUpdates', () => {
    it('should create update objects for valid pages and translations', () => {
      const pagesToTranslate = [
        {
          id: 'page1',
          name: 'Page 1',
          text: { content: 'Original content 1' },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 0;
            return false;
          })
        },
        {
          id: 'page2', 
          name: 'Page 2',
          text: { content: 'Original content 2' },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 1;
            return false;
          })
        }
      ];

      const translatedContents = [
        'Translated content 1',
        'Translated content 2'
      ];

      const contentTransformer = (original, translated) => translated;

      const result = createPageUpdates(pagesToTranslate, translatedContents, contentTransformer);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        _id: 'page1',
        'text.content': 'Translated content 1'
      });
      expect(result[1]).toEqual({
        _id: 'page2',
        'text.content': 'Translated content 2'
      });
    });

    it('should skip pages with empty translations', () => {
      const pagesToTranslate = [
        {
          id: 'page1',
          name: 'Page 1',
          text: { content: 'Original content 1' },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 0;
            return false;
          })
        },
        {
          id: 'page2',
          name: 'Page 2', 
          text: { content: 'Original content 2' },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 1;
            return false;
          })
        }
      ];

      const translatedContents = [
        'Translated content 1',
        '' // Empty translation
      ];

      const contentTransformer = (original, translated) => translated;

      const result = createPageUpdates(pagesToTranslate, translatedContents, contentTransformer);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        _id: 'page1',
        'text.content': 'Translated content 1'
      });
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Page 2" (batch index 1). Skipping this page.');
    });

    it('should skip pages with null translations', () => {
      const pagesToTranslate = [
        {
          id: 'page1',
          name: 'Page 1',
          text: { content: 'Original content 1' },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 0;
            return false;
          })
        }
      ];

      const translatedContents = [null];
      const contentTransformer = (original, translated) => translated;

      const result = createPageUpdates(pagesToTranslate, translatedContents, contentTransformer);

      expect(result).toHaveLength(0);
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Page 1" (batch index 0). Skipping this page.');
    });

    it('should skip pages with whitespace-only translations', () => {
      const pagesToTranslate = [
        {
          id: 'page1',
          name: 'Page 1',
          text: { content: 'Original content 1' },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 0;
            return false;
          })
        }
      ];

      const translatedContents = ['   \n\t   '];
      const contentTransformer = (original, translated) => translated;

      const result = createPageUpdates(pagesToTranslate, translatedContents, contentTransformer);

      expect(result).toHaveLength(0);
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Page 1" (batch index 0). Skipping this page.');
    });

    it('should handle pages with empty original content', () => {
      const pagesToTranslate = [
        {
          id: 'page1',
          name: 'Page 1',
          text: { content: null },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 0;
            return false;
          })
        }
      ];

      const translatedContents = ['Translated content 1'];
      const contentTransformer = (original, translated) => `${original || ''}${translated}`;

      const result = createPageUpdates(pagesToTranslate, translatedContents, contentTransformer);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        _id: 'page1',
        'text.content': 'Translated content 1'
      });
    });

    it('should apply content transformer correctly', () => {
      const pagesToTranslate = [
        {
          id: 'page1',
          name: 'Page 1',
          text: { content: 'Original content' },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 0;
            return false;
          })
        }
      ];

      const translatedContents = ['Translated content'];
      const contentTransformer = (original, translated) => `${translated}<hr>${original}`;

      const result = createPageUpdates(pagesToTranslate, translatedContents, contentTransformer);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        _id: 'page1',
        'text.content': 'Translated content<hr>Original content'
      });
    });
  });

  describe('createTranslatedPagesData', () => {
    it('should create translated page data objects', () => {
      const pagesToTranslate = [
        {
          name: 'Page 1',
          type: 'text',
          text: { 
            content: 'Original content 1',
            format: 'html'
          },
          sort: 0,
          ownership: { default: 0 },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 0;
            return false;
          })
        },
        {
          name: 'Page 2',
          type: 'text',
          text: {
            content: 'Original content 2', 
            format: 'html'
          },
          sort: 100,
          ownership: { default: 0 },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 1;
            return false;
          })
        }
      ];

      const translatedContents = [
        'Translated content 1',
        'Translated content 2'
      ];

      const result = createTranslatedPagesData(pagesToTranslate, translatedContents);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'Page 1 (Translated)',
        type: 'text',
        text: {
          content: 'Translated content 1',
          format: 'html'
        },
        sort: 0,
        ownership: { default: 0 }
      });
      expect(result[1]).toEqual({
        name: 'Page 2 (Translated)',
        type: 'text',
        text: {
          content: 'Translated content 2',
          format: 'html'
        },
        sort: 100,
        ownership: { default: 0 }
      });
    });

    it('should skip pages with empty translations', () => {
      const pagesToTranslate = [
        {
          name: 'Page 1',
          type: 'text',
          text: { 
            content: 'Original content 1',
            format: 'html'
          },
          sort: 0,
          ownership: { default: 0 },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 0;
            return false;
          })
        },
        {
          name: 'Page 2',
          type: 'text',
          text: {
            content: 'Original content 2',
            format: 'html'
          },
          sort: 100,
          ownership: { default: 0 },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 1;
            return false;
          })
        }
      ];

      const translatedContents = [
        'Translated content 1',
        '' // Empty translation
      ];

      const result = createTranslatedPagesData(pagesToTranslate, translatedContents);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Page 1 (Translated)');
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Page 2" (batch index 1). Skipping this page.');
    });

    it('should handle null and undefined translations', () => {
      const pagesToTranslate = [
        {
          name: 'Page 1',
          type: 'text',
          text: { 
            content: 'Original content 1',
            format: 'html'
          },
          sort: 0,
          ownership: { default: 0 },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 0;
            return false;
          })
        }
      ];

      const translatedContents = [null];

      const result = createTranslatedPagesData(pagesToTranslate, translatedContents);

      expect(result).toHaveLength(0);
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Page 1" (batch index 0). Skipping this page.');
    });

    it('should preserve all page properties correctly', () => {
      const pagesToTranslate = [
        {
          name: 'Complex Page',
          type: 'image',
          text: { 
            content: 'Original content',
            format: 'markdown'
          },
          sort: 250,
          ownership: { 
            default: 0,
            user1: 3,
            user2: 2
          },
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 0;
            return false;
          })
        }
      ];

      const translatedContents = ['Translated content'];

      const result = createTranslatedPagesData(pagesToTranslate, translatedContents);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'Complex Page (Translated)',
        type: 'image',
        text: {
          content: 'Translated content',
          format: 'markdown'
        },
        sort: 250,
        ownership: {
          default: 0,
          user1: 3,
          user2: 2
        }
      });
    });
  });

  describe('showPageSelectionDialog', () => {
    let mockJournal;

    beforeEach(() => {
      mockJournal = {
        name: 'Test Journal',
        pages: [
          {
            id: 'page1',
            name: 'Page 1',
            text: { content: 'Content for page 1' },
            getFlag: vi.fn(() => false)
          },
          {
            id: 'page2',
            name: 'Page 2',
            text: { content: 'Content for page 2' },
            getFlag: vi.fn(() => false)
          },
          {
            id: 'page3',
            name: 'Page 3',
            text: null, // Page without content
            getFlag: vi.fn(() => false)
          }
        ]
      };

      global.foundry.applications.api.DialogV2.wait.mockReset();

      // Mock ui.notifications
      global.ui = {
        notifications: {
          warn: vi.fn()
        }
      };
    });

    it('should warn and return empty array when journal has no pages with content', async () => {
      mockJournal.pages = [
        { id: 'page1', name: 'Page 1', text: null, getFlag: vi.fn(() => false) },
        { id: 'page2', name: 'Page 2', text: { content: '' }, getFlag: vi.fn(() => false) }
      ];

      const result = await showPageSelectionDialog(mockJournal);

      expect(ui.notifications.warn).toHaveBeenCalledWith('No untranslated pages with content found in "Test Journal".');
      expect(result).toEqual([]);
      expect(global.foundry.applications.api.DialogV2.wait).not.toHaveBeenCalled();
    });

    it('should create dialog with correct pages and configuration', async () => {
      await showPageSelectionDialog(mockJournal);

      expect(global.foundry.applications.api.DialogV2.wait).toHaveBeenCalledWith(
        expect.objectContaining({
          window: { title: 'Select Pages to Translate - Test Journal' },
          content: expect.stringContaining('Select which pages you want to translate:'),
          buttons: expect.arrayContaining([
            expect.objectContaining({ action: 'translate', label: 'Translate Selected' }),
            expect.objectContaining({ action: 'cancel', label: 'Cancel' })
          ])
        })
      );
    });
  });

  describe('getJournalsInFolder', () => {
    const makeJournal = (id, folderId) => ({ id, folder: folderId ? { id: folderId } : null });
    const makeFolder = (id, parentId) => ({ id, folder: parentId ? { id: parentId } : null, type: 'JournalEntry' });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns only direct children when recursive is false', () => {
      const j1 = makeJournal('j1', 'folder1');
      const j2 = makeJournal('j2', 'folder2');
      global.game.journal.filter.mockImplementation(fn => [j1, j2].filter(fn));
      global.game.folders.filter.mockImplementation(fn => []);

      const result = getJournalsInFolder('folder1', false);

      expect(result).toEqual([j1]);
      expect(global.game.folders.filter).not.toHaveBeenCalled();
    });

    it('includes journals from subfolders when recursive is true', () => {
      const j1 = makeJournal('j1', 'folder1');
      const j2 = makeJournal('j2', 'subfolder1');
      const sub = makeFolder('subfolder1', 'folder1');

      global.game.journal.filter.mockImplementation(fn => [j1, j2].filter(fn));
      global.game.folders.filter.mockImplementation(fn => [sub].filter(fn));

      const result = getJournalsInFolder('folder1', true);

      expect(result).toContain(j1);
      expect(result).toContain(j2);
    });

    it('returns empty array for an empty folder', () => {
      global.game.journal.filter.mockImplementation(() => []);
      global.game.folders.filter.mockImplementation(() => []);

      const result = getJournalsInFolder('empty-folder', true);

      expect(result).toEqual([]);
    });
  });

  describe('showFolderSelectionDialog', () => {
    let mockFolder;
    let mockJournals;

    beforeEach(() => {
      mockFolder = { id: 'folder1', name: 'Test Folder' };
      mockJournals = [
        {
          id: 'j1',
          name: 'Journal One',
          pages: [
            { id: 'p1', name: 'Page 1', text: { content: 'Hello' }, getFlag: vi.fn(() => false) },
            { id: 'p2', name: 'Page 2', text: { content: 'World' }, getFlag: vi.fn(() => false) }
          ]
        },
        {
          id: 'j2',
          name: 'Journal Two',
          pages: [
            { id: 'p3', name: 'Page 3', text: { content: 'Foo' }, getFlag: vi.fn(() => false) }
          ]
        }
      ];

      global.foundry.applications.api.DialogV2.wait.mockReset();
      global.ui = { notifications: { warn: vi.fn() } };
    });

    it('warns and returns empty array when no journals have translatable pages', async () => {
      const emptyJournals = [{ id: 'j1', name: 'Empty', pages: [] }];

      const result = await showFolderSelectionDialog(mockFolder, emptyJournals);

      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        'No translatable pages found in "Test Folder".'
      );
      expect(result).toEqual([]);
      expect(global.foundry.applications.api.DialogV2.wait).not.toHaveBeenCalled();
    });

    it('calls DialogV2.wait with correct window title and buttons', async () => {
      await showFolderSelectionDialog(mockFolder, mockJournals);

      expect(global.foundry.applications.api.DialogV2.wait).toHaveBeenCalledWith(
        expect.objectContaining({
          window: { title: 'Translate All — Test Folder' },
          buttons: expect.arrayContaining([
            expect.objectContaining({ action: 'translate', label: 'Translate Selected' }),
            expect.objectContaining({ action: 'cancel', label: 'Cancel' })
          ])
        })
      );
    });

    it('returns empty array on cancel', async () => {
      global.foundry.applications.api.DialogV2.wait.mockResolvedValue([]);

      const result = await showFolderSelectionDialog(mockFolder, mockJournals);

      expect(result).toEqual([]);
    });
  });
});
