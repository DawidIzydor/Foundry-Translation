/**
 * Tests for translation-handlers.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { translateJournal } from '../src/translation-handlers.js';

// Mock the imported functions
vi.mock('../src/openai-batch.js', () => ({
  callOpenAIBatch: vi.fn()
}));

vi.mock('../src/utils.js', () => ({
  createPageUpdates: vi.fn(),
  createTranslatedPagesData: vi.fn()
}));

vi.mock('../src/batch-queue.js', () => ({
  addBatchToQueue: vi.fn(),
  removeBatchFromQueue: vi.fn()
}));

vi.mock('../src/translation-flags.js', () => ({
  setTranslationStartedFlags: vi.fn().mockResolvedValue(),
  setTranslationCompletedFlags: vi.fn().mockResolvedValue()
}));

import { callOpenAIBatch } from '../src/openai-batch.js';
import { createPageUpdates, createTranslatedPagesData } from '../src/utils.js';
import { addBatchToQueue, removeBatchFromQueue } from '../src/batch-queue.js';
import { setTranslationStartedFlags, setTranslationCompletedFlags } from '../src/translation-flags.js';

describe('translation-handlers.js', () => {
  let mockJournal;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Setup mock journal
    mockJournal = {
      name: 'Test Journal',
      pages: [
        {
          id: 'page1',
          name: 'Page 1',
          text: { content: 'Content 1' }
        },
        {
          id: 'page2', 
          name: 'Page 2',
          text: { content: 'Content 2' }
        }
      ],
      updateEmbeddedDocuments: vi.fn().mockResolvedValue(true),
      ownership: { default: 0 },
      folder: { id: 'folder1' }
    };

    // Setup global mocks
    global.game = {
      settings: {
        get: vi.fn()
      }
    };

    global.ui = {
      notifications: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    };

    global.JournalEntry = {
      create: vi.fn().mockResolvedValue(true)
    };

    // Setup default mock responses
    game.settings.get.mockImplementation((moduleId, setting) => {
      if (setting === 'translationMode') return 'new';
      return 'default-value';
    });

    callOpenAIBatch.mockResolvedValue({ 
      batchId: 'test-batch-123', 
      translations: ['Translated content 1', 'Translated content 2'] 
    });
  });

  describe('translateJournal', () => {
    it('should warn when journal has no pages with content', async () => {
      mockJournal.pages = [];
      
      await translateJournal(mockJournal);

      expect(ui.notifications.warn).toHaveBeenCalledWith('No pages selected for translation in "Test Journal".');
      expect(callOpenAIBatch).not.toHaveBeenCalled();
    });

    it('should warn when no pages are selected for translation', async () => {
      await translateJournal(mockJournal, []);

      expect(ui.notifications.warn).toHaveBeenCalledWith('No pages selected for translation in "Test Journal".');
      expect(callOpenAIBatch).not.toHaveBeenCalled();
    });

    it('should use selected pages when provided', async () => {
      const selectedPages = [mockJournal.pages[0]]; // Only first page
      callOpenAIBatch.mockResolvedValue({ 
        batchId: 'test-batch-456', 
        translations: ['Translated content 1'] 
      });
      createTranslatedPagesData.mockReturnValue([
        { name: 'Page 1 (Translated)', text: { content: 'Translated content 1' } }
      ]);

      await translateJournal(mockJournal, selectedPages);

      expect(callOpenAIBatch).toHaveBeenCalledWith(['Content 1'], expect.objectContaining({
        onBatchCreated: expect.any(Function)
      }));
      expect(createTranslatedPagesData).toHaveBeenCalledWith(
        selectedPages,
        ['Translated content 1']
      );
    });

    it('should filter out pages without text content when no selection provided', async () => {
      mockJournal.pages = [
        { id: 'page1', name: 'Page 1', text: { content: 'Content 1' } },
        { id: 'page2', name: 'Page 2', text: null },
        { id: 'page3', name: 'Page 3', text: { content: '' } },
        { id: 'page4', name: 'Page 4', text: { content: 'Content 4' } }
      ];

      callOpenAIBatch.mockResolvedValue({ 
        batchId: 'test-batch-789', 
        translations: ['Translated 1', 'Translated 4'] 
      });
      createTranslatedPagesData.mockReturnValue([
        { name: 'Page 1 (Translated)', text: { content: 'Translated 1' } },
        { name: 'Page 4 (Translated)', text: { content: 'Translated 4' } }
      ]);

      await translateJournal(mockJournal);

      expect(callOpenAIBatch).toHaveBeenCalledWith(['Content 1', 'Content 4'], expect.objectContaining({
        onBatchCreated: expect.any(Function)
      }));
    });

    it('should handle new journal mode', async () => {
      game.settings.get.mockReturnValue('new');
      createTranslatedPagesData.mockReturnValue([
        { name: 'Page 1 (Translated)', text: { content: 'Translated content 1' } },
        { name: 'Page 2 (Translated)', text: { content: 'Translated content 2' } }
      ]);

      await translateJournal(mockJournal);

      expect(createTranslatedPagesData).toHaveBeenCalledWith(
        mockJournal.pages,
        ['Translated content 1', 'Translated content 2']
      );
      expect(JournalEntry.create).toHaveBeenCalledWith({
        name: 'Test Journal (Translated)',
        pages: [
          { name: 'Page 1 (Translated)', text: { content: 'Translated content 1' } },
          { name: 'Page 2 (Translated)', text: { content: 'Translated content 2' } }
        ],
        ownership: { default: 0 },
        folder: 'folder1'
      });
      expect(ui.notifications.info).toHaveBeenCalledWith('Successfully created a new journal "Test Journal (Translated)" with translations from "Test Journal".');
    });

    it('should handle new journal mode with no folder', async () => {
      game.settings.get.mockReturnValue('new');
      mockJournal.folder = null;
      createTranslatedPagesData.mockReturnValue([
        { name: 'Page 1 (Translated)', text: { content: 'Translated content 1' } }
      ]);

      await translateJournal(mockJournal);

      expect(JournalEntry.create).toHaveBeenCalledWith(expect.objectContaining({
        folder: null
      }));
    });

    it('should handle append mode', async () => {
      game.settings.get.mockReturnValue('append');
      createPageUpdates.mockReturnValue([
        { _id: 'page1', 'text.content': 'Content 1<hr style="margin: 1em 0;">Translated content 1' },
        { _id: 'page2', 'text.content': 'Content 2<hr style="margin: 1em 0;">Translated content 2' }
      ]);

      await translateJournal(mockJournal);

      expect(createPageUpdates).toHaveBeenCalledWith(
        mockJournal.pages,
        ['Translated content 1', 'Translated content 2'],
        expect.any(Function)
      );

      // Test the content transformer function
      const contentTransformer = createPageUpdates.mock.calls[0][2];
      const result = contentTransformer('Original', 'Translated');
      expect(result).toBe('Original<hr style="margin: 1em 0;">Translated');

      expect(mockJournal.updateEmbeddedDocuments).toHaveBeenCalledWith('JournalEntryPage', [
        { _id: 'page1', 'text.content': 'Content 1<hr style="margin: 1em 0;">Translated content 1' },
        { _id: 'page2', 'text.content': 'Content 2<hr style="margin: 1em 0;">Translated content 2' }
      ]);
      expect(ui.notifications.info).toHaveBeenCalledWith('Successfully appended translations to "Test Journal".');
    });

    it('should handle prepend mode', async () => {
      game.settings.get.mockReturnValue('prepend');
      createPageUpdates.mockReturnValue([
        { _id: 'page1', 'text.content': 'Translated content 1<hr style="margin: 1em 0;">Content 1' },
        { _id: 'page2', 'text.content': 'Translated content 2<hr style="margin: 1em 0;">Content 2' }
      ]);

      await translateJournal(mockJournal);

      expect(createPageUpdates).toHaveBeenCalledWith(
        mockJournal.pages,
        ['Translated content 1', 'Translated content 2'],
        expect.any(Function)
      );

      // Test the content transformer function
      const contentTransformer = createPageUpdates.mock.calls[0][2];
      const result = contentTransformer('Original', 'Translated');
      expect(result).toBe('Translated<hr style="margin: 1em 0;">Original');

      expect(mockJournal.updateEmbeddedDocuments).toHaveBeenCalledWith('JournalEntryPage', [
        { _id: 'page1', 'text.content': 'Translated content 1<hr style="margin: 1em 0;">Content 1' },
        { _id: 'page2', 'text.content': 'Translated content 2<hr style="margin: 1em 0;">Content 2' }
      ]);
      expect(ui.notifications.info).toHaveBeenCalledWith('Successfully prepended translations to "Test Journal".');
    });

    it('should handle replace mode', async () => {
      game.settings.get.mockReturnValue('replace');
      createPageUpdates.mockReturnValue([
        { _id: 'page1', 'text.content': 'Translated content 1' },
        { _id: 'page2', 'text.content': 'Translated content 2' }
      ]);

      await translateJournal(mockJournal);

      expect(createPageUpdates).toHaveBeenCalledWith(
        mockJournal.pages,
        ['Translated content 1', 'Translated content 2'],
        expect.any(Function)
      );

      // Test the content transformer function
      const contentTransformer = createPageUpdates.mock.calls[0][2];
      const result = contentTransformer('Original', 'Translated');
      expect(result).toBe('Translated');

      expect(mockJournal.updateEmbeddedDocuments).toHaveBeenCalledWith('JournalEntryPage', [
        { _id: 'page1', 'text.content': 'Translated content 1' },
        { _id: 'page2', 'text.content': 'Translated content 2' }
      ]);
      expect(ui.notifications.info).toHaveBeenCalledWith('Successfully replaced original with translations in "Test Journal".');
    });

    it('should handle empty page updates gracefully', async () => {
      game.settings.get.mockReturnValue('append');
      createPageUpdates.mockReturnValue([]); // No valid updates

      await translateJournal(mockJournal);

      expect(mockJournal.updateEmbeddedDocuments).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalledWith('No pages were updated for "Test Journal".');
    });

    it('should handle empty translated pages data gracefully', async () => {
      game.settings.get.mockReturnValue('new');
      createTranslatedPagesData.mockReturnValue([]); // No valid translations

      await translateJournal(mockJournal);

      expect(JournalEntry.create).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalledWith('No pages were translated for "Test Journal".');
    });

    it('should default to new mode for unknown translation modes', async () => {
      game.settings.get.mockReturnValue('unknown-mode');
      createTranslatedPagesData.mockReturnValue([
        { name: 'Page 1 (Translated)', text: { content: 'Translated content 1' } }
      ]);

      await translateJournal(mockJournal);

      expect(createTranslatedPagesData).toHaveBeenCalled();
      expect(JournalEntry.create).toHaveBeenCalled();
    });

    it('should show correct notification messages during processing', async () => {
      game.settings.get.mockReturnValue('new');
      createTranslatedPagesData.mockReturnValue([
        { name: 'Page 1 (Translated)', text: { content: 'Translated content 1' } }
      ]);

      await translateJournal(mockJournal);

      expect(ui.notifications.info).toHaveBeenCalledWith('Translating 2 pages in batch...');
    });

    it('should handle journal update errors gracefully', async () => {
      game.settings.get.mockReturnValue('append');
      createPageUpdates.mockReturnValue([
        { _id: 'page1', 'text.content': 'Updated content' }
      ]);
      mockJournal.updateEmbeddedDocuments.mockRejectedValue(new Error('Update failed'));

      await expect(translateJournal(mockJournal)).rejects.toThrow('Update failed');
    });

    it('should handle journal creation errors gracefully', async () => {
      game.settings.get.mockReturnValue('new');
      createTranslatedPagesData.mockReturnValue([
        { name: 'Page 1 (Translated)', text: { content: 'Translated content 1' } }
      ]);
      JournalEntry.create.mockRejectedValue(new Error('Creation failed'));

      await expect(translateJournal(mockJournal)).rejects.toThrow('Creation failed');
    });

    it('should pass correct page contents to batch API', async () => {
      const mockPagesWithContent = [
        { id: 'page1', name: 'Page 1', text: { content: 'First content' } },
        { id: 'page2', name: 'Page 2', text: { content: 'Second content' } },
        { id: 'page3', name: 'Page 3', text: { content: 'Third content' } }
      ];
      mockJournal.pages = mockPagesWithContent;

      await translateJournal(mockJournal);

      expect(callOpenAIBatch).toHaveBeenCalledWith(['First content', 'Second content', 'Third content'], expect.objectContaining({
        onBatchCreated: expect.any(Function)
      }));
    });

    it('should properly handle batch queue operations and translation flags', async () => {
      // Mock callOpenAIBatch to simulate the callback behavior
      callOpenAIBatch.mockImplementation(async (texts, options) => {
        // Simulate the callback being called during batch creation
        if (options && options.onBatchCreated) {
          await options.onBatchCreated('test-batch-callback-123');
        }
        return { 
          batchId: 'test-batch-callback-123', 
          translations: ['Translated content 1', 'Translated content 2'] 
        };
      });

      createTranslatedPagesData.mockReturnValue([
        { name: 'Page 1 (Translated)', text: { content: 'Translated content 1' } },
        { name: 'Page 2 (Translated)', text: { content: 'Translated content 2' } }
      ]);

      await translateJournal(mockJournal);

      // Verify batch queue operations
      expect(addBatchToQueue).toHaveBeenCalledWith('test-batch-callback-123');
      expect(removeBatchFromQueue).toHaveBeenCalledWith('test-batch-callback-123');

      // Verify translation flags are set for each page
      expect(setTranslationStartedFlags).toHaveBeenCalledTimes(2);
      expect(setTranslationStartedFlags).toHaveBeenNthCalledWith(1, mockJournal.pages[0], 'test-batch-callback-123', 0);
      expect(setTranslationStartedFlags).toHaveBeenNthCalledWith(2, mockJournal.pages[1], 'test-batch-callback-123', 1);

      // Verify completion flags are set for each page
      expect(setTranslationCompletedFlags).toHaveBeenCalledTimes(2);
      expect(setTranslationCompletedFlags).toHaveBeenNthCalledWith(1, mockJournal.pages[0]);
      expect(setTranslationCompletedFlags).toHaveBeenNthCalledWith(2, mockJournal.pages[1]);
    });

    it('should handle case when no batch ID is returned', async () => {
      callOpenAIBatch.mockResolvedValue({ 
        batchId: null, 
        translations: [] 
      });

      await translateJournal(mockJournal);

      // Verify batch queue operations are not called when no batch ID
      expect(addBatchToQueue).not.toHaveBeenCalled();
      expect(removeBatchFromQueue).not.toHaveBeenCalled();
      expect(setTranslationStartedFlags).not.toHaveBeenCalled();

      expect(ui.notifications.warn).toHaveBeenCalledWith('No translations received for "Test Journal".');
    });

    it('should still remove batch from queue even if translation fails', async () => {
      callOpenAIBatch.mockImplementation(async (texts, options) => {
        if (options && options.onBatchCreated) {
          await options.onBatchCreated('test-batch-fail-123');
        }
        return { 
          batchId: 'test-batch-fail-123', 
          translations: ['Translated content'] 
        };
      });

      // Mock translation application to fail
      createTranslatedPagesData.mockReturnValue([]);

      await translateJournal(mockJournal);

      // Verify batch is still removed from queue even after failure
      expect(addBatchToQueue).toHaveBeenCalledWith('test-batch-fail-123');
      expect(removeBatchFromQueue).toHaveBeenCalledWith('test-batch-fail-123');
    });
  });
});
