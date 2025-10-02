/**
 * Journal Translator Module
 *
 * This module adds a "Translate" option to the context menu of journal entries.
 * When selected, it sends the journal's content to the OpenAI API for translation
 * based on a user-provided prompt and API key, then creates a new journal entry
 * with the translated content. Alternatively, it can prepend the translation
 * to the original journal entry or replace the original content.
 */

import { registerSettings, MODULE_ID } from './src/settings.js';
import { translateJournal, applyTranslationsWithMode, completeTranslation } from './src/translation-handlers.js';
import { showPageSelectionDialog, showBatchRestorationDialog } from './src/utils.js';
import { hasIncompleteTranslations, findIncompleteTranslations, clearTranslationFlags, setTranslationCompletedFlags } from './src/translation-flags.js';
import { isBatchInQueue, addBatchToQueue, removeBatchFromQueue } from './src/batch-queue.js';
import { pollBatchStatus, retrieveBatchResponse, processResults, assembleFinalResults } from './src/openai-batch.js';

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
        callback: async (clickedElement) => {
            const journalId = clickedElement.dataset.entryId || clickedElement.dataset.documentId;
            const journal = game.journal.get(journalId);
            
            if (!journal) {
                ui.notifications.error(`Could not process the selected journal entry.`);
                return;
            }

            // Check for incomplete translations first
            if (hasIncompleteTranslations(journal)) {
                const incompletePages = findIncompleteTranslations(journal);
                
                // Filter out batches that are already being monitored
                const availableBatches = {};
                let hasAvailableBatches = false;
                
                for (const [batchId, pages] of Object.entries(incompletePages)) {
                    availableBatches[batchId] = pages;
                    hasAvailableBatches = true;
                }
                
                if (hasAvailableBatches) {
                    const choice = await showBatchRestorationDialog(journal, availableBatches);
                    
                    if (choice.action === 'cancel') {
                        return;
                    }
                    
                    if (choice.action === 'restore') {
                        // Check if the selected batch is already being monitored
                        if (isBatchInQueue(choice.batchId)) {
                            ui.notifications.info(`Batch ${choice.batchId} is already being monitored.`);
                            return;
                        }
                        
                        // Attempt to restore the batch
                        await attemptBatchRestoration(choice.batchId, incompletePages[choice.batchId]);
                        return;
                    }
                    
                    // If user chose "new", clear old flags before continuing
                    if (choice.action === 'new') {
                        ui.notifications.info("Starting new translation. Clearing old incomplete translations...");
                        
                        // Clear flags from all incomplete pages
                        for (const pages of Object.values(incompletePages)) {
                            for (const page of pages) {
                                await clearTranslationFlags(page);
                            }
                        }
                    }
                }
            }

            // Show page selection dialog
            const selectedPages = await showPageSelectionDialog(journal);
            
            if (selectedPages.length === 0) {
                ui.notifications.info("No pages selected for translation.");
                return;
            }

            // Show confirmation dialog with selected page count
            Dialog.confirm({
                title: "Translate Journal Entry",
                content: `<p>You are about to translate ${selectedPages.length} page(s). This translation may take several minutes depending on the journal size and OpenAI API speed. Do you want to continue?</p>`,
                yes: async () => {
                    ui.notifications.info(`Translating journal entry: ${journal.name}`);
                    await translateJournal(journal, selectedPages);
                },
                no: () => {},
                defaultYes: false
            });
        }
    });
});

/**
 * Attempts to restore and monitor an existing OpenAI batch
 * @param {string} batchId - The batch ID to restore
 * @param {Array} pages - The pages associated with this batch
 */
async function attemptBatchRestoration(batchId, pages) {
    try {
        ui.notifications.info(`Attempting to restore batch ${batchId} with ${pages.length} pages...`);
        
        // Add batch to queue to prevent duplicates
        addBatchToQueue(batchId);
        
        // Get API key
        const apiKey = game.settings.get(MODULE_ID, "apiKey");
        if (!apiKey || apiKey.trim() === "") {
            ui.notifications.error("OpenAI API Key is missing. Please enter your API key in the module settings.");
            removeBatchFromQueue(batchId);
            return;
        }
        
        // Check batch status and wait for completion if needed
        ui.notifications.info(`Checking batch ${batchId} status...`);
        const completedBatch = await pollBatchStatus(batchId, apiKey);
        
        if (completedBatch.status === 'completed') {
            // Process the results
            ui.notifications.info(`Batch ${batchId} completed! Processing results...`);
            
            const resultsResponse = await retrieveBatchResponse(completedBatch, apiKey);
            const translationsMap = await processResults(resultsResponse);
            const finalTranslations = assembleFinalResults(translationsMap, pages.length);
            
            if (finalTranslations && finalTranslations.length > 0) {
                // Apply translations using the same logic as translateJournal
                const journal = pages[0].parent; // Get journal from first page
                const translationMode = game.settings.get(MODULE_ID, "translationMode");
                
                await applyTranslationsWithMode(journal, pages, finalTranslations, translationMode);
                await completeTranslation(pages);
                
                ui.notifications.info(`Successfully restored and applied translations from batch ${batchId}!`);
            } else {
                ui.notifications.warn(`Batch ${batchId} completed but no translations were retrieved.`);
            }
            
        } else if (completedBatch.status === 'failed') {
            ui.notifications.error(`Batch ${batchId} failed. Status: ${completedBatch.status}`);
        } else if (completedBatch.status === 'cancelled') {
            ui.notifications.warn(`Batch ${batchId} was cancelled.`);
        } else {
            ui.notifications.warn(`Batch ${batchId} is in unexpected status: ${completedBatch.status}`);
        }
        
    } catch (error) {
        console.error(`Journal Translator | Error restoring batch ${batchId}:`, error);
        ui.notifications.error(`Failed to restore batch ${batchId}: ${error.message}`);
    } finally {
        // Always remove from queue when done (success or failure)
        removeBatchFromQueue(batchId);
    }
}
