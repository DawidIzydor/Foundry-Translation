/**
 * Tests for settings.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerSettings, MODULE_ID } from '../src/settings.js';

describe('settings.js', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    global.game.settings.settings.clear();
  });

  describe('MODULE_ID', () => {
    it('should export the correct module ID', () => {
      expect(MODULE_ID).toBe('foundry-translation');
    });
  });

  describe('registerSettings', () => {
    it('should register all required settings', () => {
      registerSettings();

      // Check that game.settings.register was called the correct number of times
      expect(game.settings.register).toHaveBeenCalledTimes(7);
      
      // Check specific settings registrations
      expect(game.settings.register).toHaveBeenCalledWith(MODULE_ID, 'apiKey', expect.objectContaining({
        name: 'OpenAI API Key',
        scope: 'client',
        config: true,
        type: String,
        default: ''
      }));

      expect(game.settings.register).toHaveBeenCalledWith(MODULE_ID, 'customPrompt', expect.objectContaining({
        name: 'Custom Prompt',
        scope: 'client',
        config: true,
        type: String,
        default: 'Translate the following text to English, preserving all original HTML formatting.'
      }));

      expect(game.settings.register).toHaveBeenCalledWith(MODULE_ID, 'translationMode', expect.objectContaining({
        name: 'Translation Mode',
        scope: 'client',
        config: true,
        type: String,
        choices: {
          'new': 'Create New Journal',
          'prepend': 'Prepend to Original Journal',
          'append': 'Append to Original Journal',
          'replace': 'Replace Original Journal'
        },
        default: 'new'
      }));

      expect(game.settings.register).toHaveBeenCalledWith(MODULE_ID, 'modelVersion', expect.objectContaining({
        name: 'OpenAI Model Version',
        scope: 'client',
        config: true,
        type: String,
        default: 'gpt-4o'
      }));

      expect(game.settings.register).toHaveBeenCalledWith(MODULE_ID, 'systemPrompt', expect.objectContaining({
        name: 'System Prompt',
        scope: 'client',
        config: true,
        type: String,
        default: 'You are a helpful assistant that translates text found inside journal entries for a tabletop roleplaying game. You should preserve the original HTML formatting (headings, paragraphs, lists, bold, italics, classes etc.) in your translation as well as any tags starting with @ such as @Check.'
      }));

      expect(game.settings.register).toHaveBeenCalledWith(MODULE_ID, 'pollingDelay', expect.objectContaining({
        name: 'Polling Delay (seconds)',
        scope: 'client',
        config: true,
        type: Number,
        range: {
          min: 10,
          max: 300,
          step: 5
        },
        default: 30
      }));

      expect(game.settings.register).toHaveBeenCalledWith(MODULE_ID, 'maxPollingAttempts', expect.objectContaining({
        name: 'Maximum Polling Attempts',
        scope: 'client',
        config: true,
        type: Number,
        range: {
          min: 10,
          max: 500,
          step: 10
        },
        default: 120
      }));
    });

    it('should register advanced settings menu', () => {
      registerSettings();

      expect(game.settings.registerMenu).toHaveBeenCalledWith(MODULE_ID, 'advancedSettings', expect.objectContaining({
        name: 'Advanced Settings',
        label: 'Configure Advanced Options',
        hint: 'Advanced configuration options for power users.',
        icon: 'fas fa-cogs',
        type: expect.any(Function),
        restricted: false
      }));
    });

    it('should have correct setting hints', () => {
      registerSettings();

      const apiKeySetting = game.settings.register.mock.calls.find(call => call[1] === 'apiKey')[2];
      expect(apiKeySetting.hint).toBe('Enter your API key from OpenAI to enable the translator.');

      const customPromptSetting = game.settings.register.mock.calls.find(call => call[1] === 'customPrompt')[2];
      expect(customPromptSetting.hint).toBe('Set the prompt for all translations. E.g., \'Translate to Polish.\'');

      const translationModeSetting = game.settings.register.mock.calls.find(call => call[1] === 'translationMode')[2];
      expect(translationModeSetting.hint).toBe('Choose whether to create a new journal with the translation or prepend it to the original.');
    });

    it('should have correct range settings for numeric inputs', () => {
      registerSettings();

      const pollingDelaySetting = game.settings.register.mock.calls.find(call => call[1] === 'pollingDelay')[2];
      expect(pollingDelaySetting.range).toEqual({
        min: 10,
        max: 300,
        step: 5
      });

      const maxAttemptsSetting = game.settings.register.mock.calls.find(call => call[1] === 'maxPollingAttempts')[2];
      expect(maxAttemptsSetting.range).toEqual({
        min: 10,
        max: 500,
        step: 10
      });
    });

    it('should have all settings as client scope', () => {
      registerSettings();

      // Check that all registered settings have client scope
      game.settings.register.mock.calls.forEach(call => {
        const settingConfig = call[2];
        expect(settingConfig.scope).toBe('client');
      });
    });

    it('should have all main settings visible in config', () => {
      registerSettings();

      // Check that all registered settings have config: true
      game.settings.register.mock.calls.forEach(call => {
        const settingConfig = call[2];
        expect(settingConfig.config).toBe(true);
      });
    });
  });

  describe('AdvancedSettingsMenu', () => {
    let AdvancedSettingsMenu;

    beforeEach(() => {
      registerSettings();
      // Get the AdvancedSettingsMenu class from the registerMenu call
      const menuCall = game.settings.registerMenu.mock.calls.find(call => call[1] === 'advancedSettings');
      AdvancedSettingsMenu = menuCall[2].type;
    });

    it('should have correct default options', () => {
      const defaultOptions = AdvancedSettingsMenu.defaultOptions;
      expect(defaultOptions.title).toBe('Journal Translator - Advanced Settings');
      expect(defaultOptions.id).toBe('journal-translator-advanced-settings');
      expect(defaultOptions.template).toBe('templates/generic-form.html');
      expect(defaultOptions.width).toBe(500);
      expect(defaultOptions.height).toBe('auto');
      expect(defaultOptions.closeOnSubmit).toBe(true);
    });

    it('should return correct data structure from getData', () => {
      // Mock the settings.settings map to include our settings
      const mockSetting = {
        name: 'Test Setting',
        hint: 'Test hint'
      };
      game.settings.settings.set(`${MODULE_ID}.modelVersion`, mockSetting);
      game.settings.settings.set(`${MODULE_ID}.systemPrompt`, mockSetting);
      game.settings.settings.set(`${MODULE_ID}.pollingDelay`, mockSetting);
      game.settings.settings.set(`${MODULE_ID}.maxPollingAttempts`, mockSetting);

      // Mock game.settings.get to return test values
      game.settings.get.mockImplementation((moduleId, setting) => {
        const defaults = {
          modelVersion: 'gpt-4o',
          systemPrompt: 'System prompt',
          pollingDelay: 30,
          maxPollingAttempts: 120
        };
        return defaults[setting];
      });

      const menu = new AdvancedSettingsMenu();
      const data = menu.getData();

      expect(data.settings).toHaveLength(4);
      expect(data.settings[0].name).toBe('modelVersion');
      expect(data.settings[0].type).toBe('text');
      expect(data.settings[1].name).toBe('systemPrompt');
      expect(data.settings[1].type).toBe('textarea');
      expect(data.settings[2].name).toBe('pollingDelay');
      expect(data.settings[2].type).toBe('number');
      expect(data.settings[3].name).toBe('maxPollingAttempts');
      expect(data.settings[3].type).toBe('number');
    });

    it('should update settings correctly in _updateObject', async () => {
      game.settings.set = vi.fn().mockResolvedValue(true);
      
      const menu = new AdvancedSettingsMenu();
      const formData = {
        modelVersion: 'gpt-4o-mini',
        systemPrompt: 'Updated system prompt',
        pollingDelay: 60,
        maxPollingAttempts: 200
      };

      await menu._updateObject({}, formData);

      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'modelVersion', 'gpt-4o-mini');
      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'systemPrompt', 'Updated system prompt');
      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'pollingDelay', 60);
      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, 'maxPollingAttempts', 200);
      expect(ui.notifications.info).toHaveBeenCalledWith('Advanced settings updated successfully!');
    });
  });
});
