/**
 * Translation mode handlers for the Journal Translator module.
 */

import { MODULE_ID } from './settings.js';
import { callOpenAIBatch } from './openai-batch.js';
import { createPageUpdates, createTranslatedPagesData } from './utils.js';

/**
 * Translates the entire journal entry using batch processing.
 * @param {JournalEntry} journal - The journal entry to translate.
 * @return {Promise<void>} - Resolves when the translation is complete.
 */
export async function translateJournal(journal) {
    const translationMode = game.settings.get(MODULE_ID, "translationMode");
    
    // Collect all page contents
    const pagesToTranslate = journal.pages.filter(page => page.text && page.text.content);
    const pageContents = pagesToTranslate.map(page => page.text.content);

    if (pageContents.length === 0) {
        ui.notifications.warn(`No pages with content found in "${journal.name}".`);
        return;
    }

    ui.notifications.info(`Translating ${pageContents.length} pages in batch...`);
    const translatedContents = await callOpenAIBatch(pageContents);

    switch (translationMode) {
        case 'append':
            await handleAppendMode(journal, pagesToTranslate, translatedContents);
            break;
        case 'prepend':
            await handlePrependMode(journal, pagesToTranslate, translatedContents);
            break;
        case 'replace':
            await handleReplaceMode(journal, pagesToTranslate, translatedContents);
            break;
        case 'new':
        default:
            await handleNewJournalMode(journal, pagesToTranslate, translatedContents);
            break;
    }
}

/**
 * Handles the append mode for translating journal pages by adding translated content
 * after the original content with a horizontal rule separator.
 * 
 * @async
 * @function handleAppendMode
 * @param {Object} journal - The journal object containing the pages to be updated
 * @param {Array} pagesToTranslate - Array of page objects that need translation
 * @param {Array} translatedContents - Array of translated content strings corresponding to the pages
 * @returns {Promise<void>} A promise that resolves when the operation is complete
 * @description Creates page updates by appending translated content to original content,
 *              separated by a horizontal rule. Updates the journal's embedded documents
 *              and displays appropriate notification messages based on the result.
 */
async function handleAppendMode(journal, pagesToTranslate, translatedContents) {
    const pageUpdates = createPageUpdates(pagesToTranslate, translatedContents, (original, translated) => 
        original + '<hr style="margin: 1em 0;">' + translated
    );
    
    if (pageUpdates.length > 0) {
        await journal.updateEmbeddedDocuments("JournalEntryPage", pageUpdates);
        ui.notifications.info(`Successfully appended translations to "${journal.name}".`);
    } else {
        ui.notifications.warn(`No pages were updated for "${journal.name}".`);
    }
}

/**
 * Handles prepending translated content to journal pages.
 * Creates page updates where translated content is prepended before the original content,
 * separated by a horizontal rule.
 * 
 * @async
 * @function handlePrependMode
 * @param {Object} journal - The journal document to update
 * @param {Array} pagesToTranslate - Array of pages that need translation
 * @param {Array} translatedContents - Array of translated content corresponding to the pages
 * @returns {Promise<void>} Promise that resolves when the operation is complete
 * @throws {Error} Throws error if journal update fails
 */
async function handlePrependMode(journal, pagesToTranslate, translatedContents) {
    const pageUpdates = createPageUpdates(pagesToTranslate, translatedContents, (original, translated) => 
        translated + '<hr style="margin: 1em 0;">' + original
    );
    
    if (pageUpdates.length > 0) {
        await journal.updateEmbeddedDocuments("JournalEntryPage", pageUpdates);
        ui.notifications.info(`Successfully prepended translations to "${journal.name}".`);
    } else {
        ui.notifications.warn(`No pages were updated for "${journal.name}".`);
    }
}

/**
 * Handles the replace mode operation for journal translation by replacing original content with translated content.
 * 
 * @async
 * @function handleReplaceMode
 * @param {Object} journal - The journal document to update
 * @param {Array} pagesToTranslate - Array of journal pages that need translation
 * @param {Array} translatedContents - Array of translated content corresponding to the pages
 * @returns {Promise<void>} Promise that resolves when the replacement operation is complete
 * @description Creates page updates by replacing original content with translations, then updates the journal's embedded documents. Shows success notification if pages were updated, or warning if no updates occurred.
 */
async function handleReplaceMode(journal, pagesToTranslate, translatedContents) {
    const pageUpdates = createPageUpdates(pagesToTranslate, translatedContents, (original, translated) => 
        translated
    );
    
    if (pageUpdates.length > 0) {
        await journal.updateEmbeddedDocuments("JournalEntryPage", pageUpdates);
        ui.notifications.info(`Successfully replaced original with translations in "${journal.name}".`);
    } else {
        ui.notifications.warn(`No pages were updated for "${journal.name}".`);
    }
}

/**
 * Handles the creation of a new journal entry with translated content.
 * Creates a new journal with the suffix "(Translated)" containing all translated pages.
 * 
 * @async
 * @function handleNewJournalMode
 * @param {JournalEntry} journal - The original journal entry to translate from
 * @param {Array} pagesToTranslate - Array of pages that need to be translated
 * @param {Array} translatedContents - Array of translated content corresponding to the pages
 * @returns {Promise<void>} Promise that resolves when the new journal is created or warns if no translations were made
 * @throws {Error} Throws an error if journal creation fails
 */
async function handleNewJournalMode(journal, pagesToTranslate, translatedContents) {
    const translatedPagesData = createTranslatedPagesData(pagesToTranslate, translatedContents);
    
    if (translatedPagesData.length > 0) {
        const translatedJournalName = `${journal.name} (Translated)`;
        const newEntryData = {
            name: translatedJournalName,
            pages: translatedPagesData,
            ownership: journal.ownership,
            folder: journal.folder ? journal.folder.id : null,
        };
        await JournalEntry.create(newEntryData);
        ui.notifications.info(`Successfully created a new journal "${translatedJournalName}" with translations from "${journal.name}".`);
    } else {
        ui.notifications.warn(`No pages were translated for "${journal.name}".`);
    }
}
