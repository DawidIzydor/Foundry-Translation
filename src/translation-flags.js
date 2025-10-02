/**
 * Translation flags management for the Journal Translator module.
 */

import { MODULE_ID } from './settings.js';

/**
 * Sets translation flags on a page when translation starts
 * @param {JournalEntryPage} page - The page to set flags on
 * @param {string} batchId - The OpenAI batch ID
 * @param {number} batchIndex - The position of this page in the batch (0-based)
 * @returns {Promise<void>}
 */
export async function setTranslationStartedFlags(page, batchId, batchIndex) {
    await page.update({
        [`flags.${MODULE_ID}`]: {
            translationBatchId: batchId,
            translationBatchIndex: batchIndex,
            translationQueued: true,
            translationCompleted: false
        }
    });
}

/**
 * Updates translation flags when translation is completed
 * @param {JournalEntryPage} page - The page to update flags on
 * @returns {Promise<void>}
 */
export async function setTranslationCompletedFlags(page) {
    await page.update({
        [`flags.${MODULE_ID}.translationCompleted`]: true,
        [`flags.${MODULE_ID}.translationQueued`]: false
    });
}

/**
 * Gets translation flags from a page
 * @param {JournalEntryPage} page - The page to get flags from
 * @returns {Object} Object containing translation flags
 */
export function getTranslationFlags(page) {
    return {
        batchId: page.getFlag(MODULE_ID, "translationBatchId"),
        batchIndex: page.getFlag(MODULE_ID, "translationBatchIndex"),
        queued: page.getFlag(MODULE_ID, "translationQueued"),
        completed: page.getFlag(MODULE_ID, "translationCompleted")
    };
}

/**
 * Clears all translation flags from a page
 * @param {JournalEntryPage} page - The page to clear flags from
 * @returns {Promise<void>}
 */
export async function clearTranslationFlags(page) {
    await page.unsetFlag(MODULE_ID, "translationBatchId");
    await page.unsetFlag(MODULE_ID, "translationBatchIndex");
    await page.unsetFlag(MODULE_ID, "translationQueued");
    await page.unsetFlag(MODULE_ID, "translationCompleted");
}

/**
 * Finds pages with incomplete translations (queued but not completed)
 * @param {JournalEntry} journal - The journal to check for incomplete translations
 * @returns {Object} Object containing incomplete pages grouped by batch ID
 */
export function findIncompleteTranslations(journal) {
    const incompletePages = {};
    
    journal.pages.forEach(page => {
        const flags = getTranslationFlags(page);
        
        // Check if page is queued but not completed
        if (flags.queued && !flags.completed && flags.batchId) {
            if (!incompletePages[flags.batchId]) {
                incompletePages[flags.batchId] = [];
            }
            incompletePages[flags.batchId].push(page);
        }
    });
    
    return incompletePages;
}

/**
 * Checks if a journal has any incomplete translations
 * @param {JournalEntry} journal - The journal to check
 * @returns {boolean} True if there are incomplete translations
 */
export function hasIncompleteTranslations(journal) {
    const incompletePages = findIncompleteTranslations(journal);
    return Object.keys(incompletePages).length > 0;
}