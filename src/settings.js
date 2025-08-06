/**
 * Module settings configuration for the Journal Translator module.
 */

const MODULE_ID = "foundry-translation";

/**
 * Register all module settings.
 */
export function registerSettings() {
    // Register the setting for the OpenAI API Key
    game.settings.register(MODULE_ID, "apiKey", {
        name: "OpenAI API Key",
        hint: "Enter your API key from OpenAI to enable the translator.",
        scope: "client", // Stored on the user's machine
        config: true,    // Show this in the standard module settings list
        type: String,
        default: ""
    });

    // Register the setting for the default translation prompt
    game.settings.register(MODULE_ID, "customPrompt", {
        name: "Custom Prompt",
        hint: "Set the prompt for all translations. E.g., 'Translate to Polish.'",
        scope: "client",
        config: true,    // Show this in the standard module settings list
        type: String,
        default: "Translate the following text to English, preserving all original HTML formatting."
    });

    // Register the setting for how to handle the translation output
    game.settings.register(MODULE_ID, "translationMode", {
        name: "Translation Mode",
        hint: "Choose whether to create a new journal with the translation or prepend it to the original.",
        scope: "client",
        config: true,
        type: String,
        choices: {
            "new": "Create New Journal",
            "prepend": "Prepend to Original Journal",
            "append": "Append to Original Journal",
            "replace": "Replace Original Journal"
        },
        default: "new"
    });

    // Advanced settings section (collapsed by default)
    
    // Register the setting for the OpenAI model version
    game.settings.register(MODULE_ID, "modelVersion", {
        name: "OpenAI Model Version",
        hint: "Specify the OpenAI model to use for translations (e.g., gpt-4o, gpt-4o-mini, gpt-3.5-turbo).",
        scope: "client",
        config: true,
        group: "advanced",
        type: String,
        default: "gpt-4o"
    });

    // Register the setting for custom system prompt
    game.settings.register(MODULE_ID, "systemPrompt", {
        name: "System Prompt",
        hint: "Customize the system prompt that provides context to the AI about its role and behavior.",
        scope: "client",
        config: true,
        group: "advanced",
        type: String,
        default: "You are a helpful assistant that translates text found inside journal entries for a tabletop roleplaying game. You should preserve the original HTML formatting (headings, paragraphs, lists, bold, italics, classes etc.) in your translation as well as any tags starting with @ such as @Check."
    });

    // Register the setting for polling delay
    game.settings.register(MODULE_ID, "pollingDelay", {
        name: "Polling Delay (seconds)",
        hint: "How long to wait between status checks when polling for batch completion. Lower values check more frequently but may hit rate limits.",
        scope: "client",
        config: true,
        group: "advanced",
        type: Number,
        range: {
            min: 10,
            max: 300,
            step: 5
        },
        default: 30
    });

    // Register the setting for maximum polling attempts
    game.settings.register(MODULE_ID, "maxPollingAttempts", {
        name: "Maximum Polling Attempts",
        hint: "Maximum number of times to check batch status before timing out. Higher values allow longer processing times.",
        scope: "client",
        config: true,
        group: "advanced",
        type: Number,
        range: {
            min: 10,
            max: 500,
            step: 10
        },
        default: 120
    });

    // Register the advanced settings group
    game.settings.registerMenu(MODULE_ID, "advancedSettings", {
        name: "Advanced Settings",
        label: "Configure Advanced Options",
        hint: "Advanced configuration options for power users.",
        icon: "fas fa-cogs",
        type: class AdvancedSettingsMenu extends FormApplication {
            static get defaultOptions() {
                return foundry.utils.mergeObject(super.defaultOptions, {
                    title: "Journal Translator - Advanced Settings",
                    id: "journal-translator-advanced-settings",
                    template: "templates/generic-form.html",
                    width: 500,
                    height: "auto",
                    closeOnSubmit: true
                });
            }

            getData() {
                return {
                    settings: [
                        {
                            name: "modelVersion",
                            label: game.settings.settings.get(`${MODULE_ID}.modelVersion`).name,
                            hint: game.settings.settings.get(`${MODULE_ID}.modelVersion`).hint,
                            type: "text",
                            value: game.settings.get(MODULE_ID, "modelVersion")
                        },
                        {
                            name: "systemPrompt",
                            label: game.settings.settings.get(`${MODULE_ID}.systemPrompt`).name,
                            hint: game.settings.settings.get(`${MODULE_ID}.systemPrompt`).hint,
                            type: "textarea",
                            value: game.settings.get(MODULE_ID, "systemPrompt")
                        },
                        {
                            name: "pollingDelay",
                            label: game.settings.settings.get(`${MODULE_ID}.pollingDelay`).name,
                            hint: game.settings.settings.get(`${MODULE_ID}.pollingDelay`).hint,
                            type: "number",
                            value: game.settings.get(MODULE_ID, "pollingDelay")
                        },
                        {
                            name: "maxPollingAttempts",
                            label: game.settings.settings.get(`${MODULE_ID}.maxPollingAttempts`).name,
                            hint: game.settings.settings.get(`${MODULE_ID}.maxPollingAttempts`).hint,
                            type: "number",
                            value: game.settings.get(MODULE_ID, "maxPollingAttempts")
                        }
                    ]
                };
            }

            async _updateObject(event, formData) {
                for (const [key, value] of Object.entries(formData)) {
                    await game.settings.set(MODULE_ID, key, value);
                }
                ui.notifications.info("Advanced settings updated successfully!");
            }
        },
        restricted: false
    });
}

export { MODULE_ID };
