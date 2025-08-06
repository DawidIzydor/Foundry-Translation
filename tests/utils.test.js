/**
 * Tests for utils.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPageUpdates, createTranslatedPagesData } from '../src/utils.js';

describe('utils.js', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('createPageUpdates', () => {
    it('should create update objects for valid pages and translations', () => {
      const pagesToTranslate = [
        {
          id: 'page1',
          name: 'Page 1',
          text: { content: 'Original content 1' }
        },
        {
          id: 'page2', 
          name: 'Page 2',
          text: { content: 'Original content 2' }
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
          text: { content: 'Original content 1' }
        },
        {
          id: 'page2',
          name: 'Page 2', 
          text: { content: 'Original content 2' }
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
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Page 2". Skipping this page.');
    });

    it('should skip pages with null translations', () => {
      const pagesToTranslate = [
        {
          id: 'page1',
          name: 'Page 1',
          text: { content: 'Original content 1' }
        }
      ];

      const translatedContents = [null];
      const contentTransformer = (original, translated) => translated;

      const result = createPageUpdates(pagesToTranslate, translatedContents, contentTransformer);

      expect(result).toHaveLength(0);
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Page 1". Skipping this page.');
    });

    it('should skip pages with whitespace-only translations', () => {
      const pagesToTranslate = [
        {
          id: 'page1',
          name: 'Page 1',
          text: { content: 'Original content 1' }
        }
      ];

      const translatedContents = ['   \n\t   '];
      const contentTransformer = (original, translated) => translated;

      const result = createPageUpdates(pagesToTranslate, translatedContents, contentTransformer);

      expect(result).toHaveLength(0);
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Page 1". Skipping this page.');
    });

    it('should handle pages with empty original content', () => {
      const pagesToTranslate = [
        {
          id: 'page1',
          name: 'Page 1',
          text: { content: null }
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
          text: { content: 'Original content' }
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
          ownership: { default: 0 }
        },
        {
          name: 'Page 2',
          type: 'text',
          text: {
            content: 'Original content 2', 
            format: 'html'
          },
          sort: 100,
          ownership: { default: 0 }
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
          ownership: { default: 0 }
        },
        {
          name: 'Page 2',
          type: 'text',
          text: {
            content: 'Original content 2',
            format: 'html'
          },
          sort: 100,
          ownership: { default: 0 }
        }
      ];

      const translatedContents = [
        'Translated content 1',
        '' // Empty translation
      ];

      const result = createTranslatedPagesData(pagesToTranslate, translatedContents);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Page 1 (Translated)');
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Page 2". Skipping this page.');
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
          ownership: { default: 0 }
        }
      ];

      const translatedContents = [null];

      const result = createTranslatedPagesData(pagesToTranslate, translatedContents);

      expect(result).toHaveLength(0);
      expect(ui.notifications.warn).toHaveBeenCalledWith('Translation returned empty for page "Page 1". Skipping this page.');
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
          }
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
});
