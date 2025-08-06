/**
 * Journal Translator Module
 *
 * This module adds a "Translate" option to the context menu of journal entries.
 * When selected, it sends the journal's content to the OpenAI API for translation
 * based on a user-provided prompt and API key, then creates a new journal entry
 * with the translated content. Alternatively, it can prepend the translation
 * to the original journal entry or replace the original content.
 */

import { registerSettings } from './src/settings.js';
import { translateJournal } from './src/translation-handlers.js';

/**
 * Initialization hook to register module settings.
 */
Hooks.on('init', () => {
    registerSettings();
});

/**
 * Adds the "Translate" option to the journal entry context menu.
 * This hook is triggered when the context menu for a journal entry is about to be displayed.
 */
Hooks.on('getJournalEntryContextOptions', (application, options) => {
    // Add the "Translate" option to the context menu.
    options.push({
        name: "Translate",
        icon: '<i class="fas fa-language"></i>',
        callback: (clickedElement) => {
            Dialog.confirm({
                title: "Translate Journal Entry",
                content: "<p>This translation may take several minutes depending on the journal size and OpenAI API speed. Do you want to continue?</p>",
                yes: async () => {
                    const journalId = clickedElement.dataset.entryId || clickedElement.dataset.documentId;
                    const journal = game.journal.get(journalId);
                    if (journal) {
                        ui.notifications.info(`Translating journal entry: ${journal.name}`);
                        translateJournal(journal);
                    } else {
                        ui.notifications.error(`Could not process the selected journal entry.`);
                    }
                },
                no: () => {},
                defaultYes: false
            });
        }
    });
});
