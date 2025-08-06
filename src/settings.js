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
}

export { MODULE_ID };
