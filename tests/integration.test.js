/**
 * Integration tests for the Journal Translator module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import all modules
import { registerSettings, MODULE_ID } from '../src/settings.js';
import { createPageUpdates, createTranslatedPagesData } from '../src/utils.js';
import { callOpenAIBatch } from '../src/openai-batch.js';
import { translateJournal } from '../src/translation-handlers.js';

describe('Integration Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup comprehensive mock environment
    global.game.settings.settings.clear();
    
    // Mock settings with realistic values
    game.settings.get.mockImplementation((moduleId, setting) => {
      const settings = {
        apiKey: 'sk-test-api-key-123',
        customPrompt: 'Translate to Polish',
        translationMode: 'new',
        modelVersion: 'gpt-4o',
        systemPrompt: 'You are a helpful translator for RPG content',
        pollingDelay: 30,
        maxPollingAttempts: 120
      };
      return settings[setting] || 'default';
    });
  });

  describe('Full Translation Workflow - New Journal Mode', () => {
    it('should complete full translation workflow successfully', async () => {
      // Setup mock data
      const mockJournal = {
        name: 'Adventure Module',
        pages: [
          {
            id: 'page1',
            name: 'Chapter 1',
            text: { 
              content: '<h1>The Beginning</h1><p>Our heroes start their journey...</p>',
              format: 'html'
            },
            type: 'text',
            sort: 0,
            ownership: { default: 0 },
            getFlag: vi.fn((moduleId, flagName) => {
              if (flagName === 'translationBatchIndex') return 0;
              return false;
            }),
            update: vi.fn()
          },
          {
            id: 'page2',
            name: 'Chapter 2', 
            text: {
              content: '<h1>The Challenge</h1><p>They face a great @Check{type=perception,dc=15}...</p>',
              format: 'html'
            },
            type: 'text',
            sort: 100,
            ownership: { default: 0 },
            getFlag: vi.fn((moduleId, flagName) => {
              if (flagName === 'translationBatchIndex') return 1;
              return false;
            }),
            update: vi.fn()
          }
        ],
        ownership: { default: 0 },
        folder: { id: 'adventures' }
      };

      // Mock OpenAI batch response
      const mockBatchResponses = [
        '<h1>Początek</h1><p>Nasi bohaterowie rozpoczynają swoją podróż...</p>',
        '<h1>Wyzwanie</h1><p>Stają przed wielkim @Check{type=perception,dc=15}...</p>'
      ];

      // Mock successful API calls
      const mockFileResponse = { json: vi.fn().mockResolvedValue({ id: 'file-123' }) };
      const mockBatchResponse = { json: vi.fn().mockResolvedValue({ id: 'batch-123' }) };
      const mockCompletedBatch = { 
        id: 'batch-123', 
        status: 'completed', 
        output_file_id: 'output-file-123'
      };
      const mockResultsResponse = { 
        text: vi.fn().mockResolvedValue(
          '{"custom_id": "request-0", "response": {"body": {"choices": [{"message": {"content": "' + mockBatchResponses[0] + '"}}]}}}\n' +
          '{"custom_id": "request-1", "response": {"body": {"choices": [{"message": {"content": "' + mockBatchResponses[1] + '"}}]}}}'
        ) 
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, ...mockFileResponse }) // File upload
        .mockResolvedValueOnce({ ok: true, ...mockBatchResponse }) // Batch creation
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockCompletedBatch) }) // Batch status
        .mockResolvedValueOnce({ ok: true, ...mockResultsResponse }); // Results download

      // Execute translation
      await translateJournal(mockJournal);

      // Verify OpenAI batch was called with correct content
      expect(fetch).toHaveBeenCalledWith('https://api.openai.com/v1/files', expect.objectContaining({
        method: 'POST',
        headers: { 'Authorization': 'Bearer sk-test-api-key-123' }
      }));

      // Verify new journal was created
      expect(JournalEntry.create).toHaveBeenCalledWith({
        name: 'Adventure Module (Translated)',
        pages: expect.arrayContaining([
          expect.objectContaining({
            name: 'Chapter 1 (Translated)',
            type: 'text',
            text: {
              content: mockBatchResponses[0],
              format: 'html'
            }
          }),
          expect.objectContaining({
            name: 'Chapter 2 (Translated)',
            type: 'text', 
            text: {
              content: mockBatchResponses[1],
              format: 'html'
            }
          })
        ]),
        ownership: { default: 0 },
        folder: 'adventures'
      });

      // Verify success notification
      expect(ui.notifications.info).toHaveBeenCalledWith('All translations completed successfully!');
      expect(ui.notifications.info).toHaveBeenCalledWith('Successfully created a new journal "Adventure Module (Translated)" with translations from "Adventure Module".');
    });
  });

  describe('Full Translation Workflow - Prepend Mode', () => {
    it('should complete prepend mode workflow successfully', async () => {
      // Change to prepend mode
      game.settings.get.mockImplementation((moduleId, setting) => {
        const settings = {
          translationMode: 'prepend',
          apiKey: 'sk-test-api-key-123',
          customPrompt: 'Translate to Polish',
          modelVersion: 'gpt-4o',
          systemPrompt: 'You are a helpful translator for RPG content',
          pollingDelay: 30,
          maxPollingAttempts: 120
        };
        return settings[setting] || 'default';
      });

      const mockJournal = {
        name: 'Test Journal',
        pages: [
          {
            id: 'page1',
            name: 'Page 1',
            text: { content: 'Original content' },
            getFlag: vi.fn((moduleId, flagName) => {
              if (flagName === 'translationBatchIndex') return 0;
              return false;
            }),
            update: vi.fn()
          }
        ],
        updateEmbeddedDocuments: vi.fn().mockResolvedValue(true)
      };

      // Mock OpenAI response
      const mockFileResponse = { json: vi.fn().mockResolvedValue({ id: 'file-123' }) };
      const mockBatchResponse = { json: vi.fn().mockResolvedValue({ id: 'batch-123' }) };
      const mockCompletedBatch = { 
        id: 'batch-123', 
        status: 'completed', 
        output_file_id: 'output-file-123'
      };
      const mockResultsResponse = { 
        text: vi.fn().mockResolvedValue(
          '{"custom_id": "request-0", "response": {"body": {"choices": [{"message": {"content": "Translated content"}}]}}}'
        ) 
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, ...mockFileResponse })
        .mockResolvedValueOnce({ ok: true, ...mockBatchResponse })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockCompletedBatch) })
        .mockResolvedValueOnce({ ok: true, ...mockResultsResponse });

      await translateJournal(mockJournal);

      // Verify journal was updated with prepended content
      expect(mockJournal.updateEmbeddedDocuments).toHaveBeenCalledWith('JournalEntryPage', [
        {
          _id: 'page1',
          'text.content': 'Translated content<hr style="margin: 1em 0;">Original content'
        }
      ]);

      expect(ui.notifications.info).toHaveBeenCalledWith('Successfully prepended translations to "Test Journal".');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle API key missing gracefully', async () => {
      game.settings.get.mockImplementation((moduleId, setting) => {
        if (setting === 'apiKey') return '';
        return 'default';
      });

      const mockJournal = {
        name: 'Test Journal',
        pages: [{ 
          id: 'page1', 
          text: { content: 'Content' }, 
          getFlag: vi.fn(() => false),
          update: vi.fn()
        }]
      };

      await translateJournal(mockJournal);

      expect(ui.notifications.error).toHaveBeenCalledWith('OpenAI API Key is missing. Please enter your API key in the module settings.');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should handle OpenAI API errors gracefully', async () => {
      const mockJournal = {
        name: 'Test Journal',
        pages: [{ 
          id: 'page1', 
          text: { content: 'Content' }, 
          getFlag: vi.fn(() => false),
          update: vi.fn()
        }]
      };

      // Mock API failure - Return response with ok: false but without json method for error
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: { message: 'Rate limit exceeded' } })
      });

      await translateJournal(mockJournal);

      expect(ui.notifications.error).toHaveBeenCalledWith('Batch translation failed: File Upload Failed: Rate limit exceeded');
    });

    it('should handle partial translation failures', async () => {
      const mockJournal = {
        name: 'Test Journal',
        pages: [
          { 
            id: 'page1', 
            name: 'Page 1', 
            text: { content: 'Content 1' },
            getFlag: vi.fn((moduleId, flagName) => {
              if (flagName === 'translationBatchIndex') return 0;
              return false;
            }),
            update: vi.fn()
          },
          { 
            id: 'page2', 
            name: 'Page 2', 
            text: { content: 'Content 2' },
            getFlag: vi.fn((moduleId, flagName) => {
              if (flagName === 'translationBatchIndex') return 1;
              return false;
            }),
            update: vi.fn()
          }
        ]
      };

      // Mock successful API calls but with one failed translation
      const mockFileResponse = { json: vi.fn().mockResolvedValue({ id: 'file-123' }) };
      const mockBatchResponse = { json: vi.fn().mockResolvedValue({ id: 'batch-123' }) };
      const mockCompletedBatch = { 
        id: 'batch-123', 
        status: 'completed', 
        output_file_id: 'output-file-123'
      };
      const mockResultsResponse = { 
        text: vi.fn().mockResolvedValue(
          '{"custom_id": "request-0", "response": {"body": {"choices": [{"message": {"content": "Translated content 1"}}]}}}\n' +
          '{"custom_id": "request-1", "response": {"body": {"error": {"message": "Translation failed"}}}}'
        ) 
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, ...mockFileResponse })
        .mockResolvedValueOnce({ ok: true, ...mockBatchResponse })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockCompletedBatch) })
        .mockResolvedValueOnce({ ok: true, ...mockResultsResponse });

      await translateJournal(mockJournal);

      // Should still create journal with successful translations (only first page should succeed)
      expect(JournalEntry.create).toHaveBeenCalledWith(expect.objectContaining({
        pages: expect.arrayContaining([
          expect.objectContaining({
            name: 'Page 1 (Translated)',
            text: { content: 'Translated content 1' }
          })
          // Page 2 should be skipped due to failed translation
        ])
      }));
      
      // Verify warning was shown for the failed translation
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Page 2" (batch index 1). Skipping this page.');
    });
  });

  describe('Utils Functions Integration', () => {
    it('should handle edge cases in page processing', () => {
      const pages = [
        { 
          id: 'page1', 
          name: 'Valid Page', 
          text: { content: 'Valid content', format: 'html' }, 
          sort: 0, 
          ownership: {},
          getFlag: vi.fn((moduleId, flagName) => {
            if (flagName === 'translationBatchIndex') return 0;
            return false;
          })
        },
        { 
          id: 'page2', 
          name: 'Empty Page', 
          text: { content: '', format: 'html' }, 
          sort: 100, 
          ownership: {},
          getFlag: vi.fn(() => false)
        },
        { 
          id: 'page3', 
          name: 'Null Content', 
          text: { content: null, format: 'html' }, 
          sort: 200, 
          ownership: {},
          getFlag: vi.fn(() => false)
        }
      ];

      const translations = ['Translated valid content', '', null];

      // Test createPageUpdates
      const contentTransformer = (original, translated) => translated;
      const updates = createPageUpdates(pages, translations, contentTransformer);
      
      expect(updates).toHaveLength(1); // Only valid page should be included
      expect(updates[0]).toEqual({
        _id: 'page1',
        'text.content': 'Translated valid content'
      });

      // Test createTranslatedPagesData
      const translatedPages = createTranslatedPagesData(pages, translations);
      
      expect(translatedPages).toHaveLength(1); // Only valid page should be included
      expect(translatedPages[0]).toEqual({
        name: 'Valid Page (Translated)',
        type: undefined, // Not set in test data
        text: {
          content: 'Translated valid content',
          format: 'html'
        },
        sort: 0,
        ownership: {}
      });

      // Verify warnings were shown for invalid pages
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Empty Page" (batch index false). Skipping this page.');
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Null Content" (batch index false). Skipping this page.');
    });
  });
});
