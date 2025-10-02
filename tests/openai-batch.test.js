/**
 * Tests for openai-batch.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callOpenAIBatch } from '../src/openai-batch.js';

describe('openai-batch.js', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Setup default mock responses
    game.settings.get.mockImplementation((moduleId, setting) => {
      const defaults = {
        apiKey: 'test-api-key',
        customPrompt: 'Translate to English',
        modelVersion: 'gpt-4o',
        systemPrompt: 'You are a helpful translator',
        pollingDelay: 30,
        maxPollingAttempts: 120
      };
      return defaults[setting];
    });
  });

  describe('callOpenAIBatch', () => {
    it('should return empty result when API key is missing', async () => {
      game.settings.get.mockImplementation((moduleId, setting) => {
        if (setting === 'apiKey') return '';
        return 'default-value';
      });

      const result = await callOpenAIBatch(['Test text']);

      expect(result).toEqual({ batchId: null, translations: [] });
      expect(ui.notifications.error).toHaveBeenCalledWith('OpenAI API Key is missing. Please enter your API key in the module settings.');
    });

    it('should return empty result when API key is whitespace only', async () => {
      game.settings.get.mockImplementation((moduleId, setting) => {
        if (setting === 'apiKey') return '   \t\n   ';
        return 'default-value';
      });

      const result = await callOpenAIBatch(['Test text']);

      expect(result).toEqual({ batchId: null, translations: [] });
      expect(ui.notifications.error).toHaveBeenCalledWith('OpenAI API Key is missing. Please enter your API key in the module settings.');
    });

    it('should handle successful batch translation', async () => {
      const mockFileResponse = { json: vi.fn().mockResolvedValue({ id: 'file-123' }) };
      const mockBatchResponse = { json: vi.fn().mockResolvedValue({ id: 'batch-123' }) };
      const mockCompletedBatch = { 
        id: 'batch-123', 
        status: 'completed', 
        output_file_id: 'output-file-123',
        request_counts: { completed: 2, total: 2 }
      };
      const mockResultsResponse = { 
        text: vi.fn().mockResolvedValue(
          '{"custom_id": "request-0", "response": {"body": {"choices": [{"message": {"content": "Translated text 1"}}]}}}\n' +
          '{"custom_id": "request-1", "response": {"body": {"choices": [{"message": {"content": "Translated text 2"}}]}}}'
        ) 
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, ...mockFileResponse }) // File upload
        .mockResolvedValueOnce({ ok: true, ...mockBatchResponse }) // Batch creation
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockCompletedBatch) }) // Batch status
        .mockResolvedValueOnce({ ok: true, ...mockResultsResponse }); // Results download

      const textsToTranslate = ['Text 1', 'Text 2'];
      const result = await callOpenAIBatch(textsToTranslate);

      expect(result).toEqual({ 
        batchId: 'batch-123', 
        translations: ['Translated text 1', 'Translated text 2'] 
      });
      expect(ui.notifications.info).toHaveBeenCalledWith('All translations completed successfully!');
    });

    it('should handle file upload error', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'File upload failed' } })
      });

      const result = await callOpenAIBatch(['Test text']);

      expect(result).toEqual({ batchId: null, translations: [] });
      expect(ui.notifications.error).toHaveBeenCalledWith('Batch translation failed: File Upload Failed: File upload failed');
    });

    it('should handle batch creation error', async () => {
      const mockFileResponse = { json: vi.fn().mockResolvedValue({ id: 'file-123' }) };
      
      global.fetch
        .mockResolvedValueOnce({ ok: true, ...mockFileResponse }) // File upload success
        .mockResolvedValueOnce({ // Batch creation failure
          ok: false,
          json: () => Promise.resolve({ error: { message: 'Batch creation failed' } })
        });

      const result = await callOpenAIBatch(['Test text']);

      expect(result).toEqual({ batchId: null, translations: [] });
      expect(ui.notifications.error).toHaveBeenCalledWith('Batch translation failed: Batch Creation Failed: Batch creation failed');
    });

    it('should handle failed batch job', async () => {
      const mockFileResponse = { json: vi.fn().mockResolvedValue({ id: 'file-123' }) };
      const mockBatchResponse = { json: vi.fn().mockResolvedValue({ id: 'batch-123' }) };
      const mockFailedBatch = { 
        id: 'batch-123', 
        status: 'failed'
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, ...mockFileResponse }) // File upload
        .mockResolvedValueOnce({ ok: true, ...mockBatchResponse }) // Batch creation
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockFailedBatch) }); // Batch status

      const result = await callOpenAIBatch(['Test text']);

      expect(result).toEqual({ batchId: null, translations: [] });
      expect(ui.notifications.error).toHaveBeenCalledWith('Batch job failed with status: failed');
    });

    it('should handle results download error', async () => {
      const mockFileResponse = { json: vi.fn().mockResolvedValue({ id: 'file-123' }) };
      const mockBatchResponse = { json: vi.fn().mockResolvedValue({ id: 'batch-123' }) };
      const mockCompletedBatch = { 
        id: 'batch-123', 
        status: 'completed', 
        output_file_id: 'output-file-123'
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, ...mockFileResponse }) // File upload
        .mockResolvedValueOnce({ ok: true, ...mockBatchResponse }) // Batch creation
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockCompletedBatch) }) // Batch status
        .mockResolvedValueOnce({ // Results download failure
          ok: false,
          json: () => Promise.resolve({ error: { message: 'Download failed' } })
        });

      const result = await callOpenAIBatch(['Test text']);

      expect(result).toEqual({ batchId: null, translations: [] });
      expect(ui.notifications.error).toHaveBeenCalledWith('Batch translation failed: Failed to download results: Download failed');
    });

    it('should handle individual request errors in batch results', async () => {
      const mockFileResponse = { json: vi.fn().mockResolvedValue({ id: 'file-123' }) };
      const mockBatchResponse = { json: vi.fn().mockResolvedValue({ id: 'batch-123' }) };
      const mockCompletedBatch = { 
        id: 'batch-123', 
        status: 'completed', 
        output_file_id: 'output-file-123'
      };
      const mockResultsResponse = { 
        text: vi.fn().mockResolvedValue(
          '{"custom_id": "request-0", "response": {"body": {"choices": [{"message": {"content": "Translated text 1"}}]}}}\n' +
          '{"custom_id": "request-1", "response": {"body": {"error": {"message": "Individual request failed"}}}}'
        ) 
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, ...mockFileResponse }) // File upload
        .mockResolvedValueOnce({ ok: true, ...mockBatchResponse }) // Batch creation
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockCompletedBatch) }) // Batch status
        .mockResolvedValueOnce({ ok: true, ...mockResultsResponse }); // Results download

      const textsToTranslate = ['Text 1', 'Text 2'];
      const result = await callOpenAIBatch(textsToTranslate);

      expect(result).toEqual({ 
        batchId: 'batch-123', 
        translations: ['Translated text 1', ''] // Second translation should be empty due to error
      });
      expect(ui.notifications.info).toHaveBeenCalledWith('All translations completed successfully!');
    });

    it('should create correct batch file format', async () => {
      let capturedFormData;
      global.fetch.mockImplementation(async (url, options) => {
        if (url.includes('/files')) {
          capturedFormData = options.body;
          return { ok: true, json: () => Promise.resolve({ id: 'file-123' }) };
        }
        return { ok: false };
      });

      await callOpenAIBatch(['Text 1', 'Text 2']).catch(() => {
        // Expected to fail after file upload since we're not mocking the rest
      });

      expect(capturedFormData.get('purpose')).toBe('batch');
      expect(capturedFormData.get('file')).toBeInstanceOf(File);
      expect(capturedFormData.get('file').name).toBe('batch.jsonl');
      expect(capturedFormData.get('file').type).toBe('application/jsonlines');
    });

    it('should call onBatchCreated callback when batch is created', async () => {
      const mockFileResponse = { json: vi.fn().mockResolvedValue({ id: 'file-123' }) };
      const mockBatchResponse = { json: vi.fn().mockResolvedValue({ id: 'batch-123' }) };
      const mockCompletedBatch = { 
        id: 'batch-123', 
        status: 'completed', 
        output_file_id: 'output-file-123',
        request_counts: { completed: 1, total: 1 }
      };
      const mockResultsResponse = { 
        text: vi.fn().mockResolvedValue(
          '{"custom_id": "request-0", "response": {"body": {"choices": [{"message": {"content": "Translated text"}}]}}}'
        ) 
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, ...mockFileResponse }) // File upload
        .mockResolvedValueOnce({ ok: true, ...mockBatchResponse }) // Batch creation
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockCompletedBatch) }) // Batch status
        .mockResolvedValueOnce({ ok: true, ...mockResultsResponse }); // Results download

      const onBatchCreatedCallback = vi.fn().mockResolvedValue();
      
      const result = await callOpenAIBatch(['Test text'], { 
        onBatchCreated: onBatchCreatedCallback 
      });

      expect(onBatchCreatedCallback).toHaveBeenCalledWith('batch-123');
      expect(onBatchCreatedCallback).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ 
        batchId: 'batch-123', 
        translations: ['Translated text'] 
      });
    });

    it('should continue processing even if onBatchCreated callback fails', async () => {
      const mockFileResponse = { json: vi.fn().mockResolvedValue({ id: 'file-123' }) };
      const mockCompletedBatch = { 
        id: 'batch-123', 
        status: 'completed', 
        output_file_id: 'output-file-123',
        request_counts: { completed: 1, total: 1 }
      };
      const mockResultsResponse = { 
        text: vi.fn().mockResolvedValue(
          '{"custom_id": "request-0", "response": {"body": {"choices": [{"message": {"content": "Translated text"}}]}}}'
        ) 
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, ...mockFileResponse }) // File upload
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'batch-123' }) }) // Batch creation
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockCompletedBatch) }) // Batch status
        .mockResolvedValueOnce({ ok: true, ...mockResultsResponse }); // Results download

      const onBatchCreatedCallback = vi.fn().mockRejectedValue(new Error('Callback failed'));
      
      const result = await callOpenAIBatch(['Test text'], { 
        onBatchCreated: onBatchCreatedCallback 
      });

      expect(onBatchCreatedCallback).toHaveBeenCalledWith('batch-123');
      expect(result).toEqual({ 
        batchId: 'batch-123', 
        translations: ['Translated text'] 
      });
    });

    it('should work without onBatchCreated callback (backward compatibility)', async () => {
      const mockFileResponse = { json: vi.fn().mockResolvedValue({ id: 'file-123' }) };
      const mockCompletedBatch = { 
        id: 'batch-123', 
        status: 'completed', 
        output_file_id: 'output-file-123',
        request_counts: { completed: 1, total: 1 }
      };
      const mockResultsResponse = { 
        text: vi.fn().mockResolvedValue(
          '{"custom_id": "request-0", "response": {"body": {"choices": [{"message": {"content": "Translated text"}}]}}}'
        ) 
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, ...mockFileResponse }) // File upload
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'batch-123' }) }) // Batch creation
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockCompletedBatch) }) // Batch status
        .mockResolvedValueOnce({ ok: true, ...mockResultsResponse }); // Results download

      // Test with no options parameter (backward compatibility)
      const result = await callOpenAIBatch(['Test text']);

      expect(result).toEqual({ 
        batchId: 'batch-123', 
        translations: ['Translated text'] 
      });
    });

  });
});
