/**
 * Utility functions for the Journal Translator module.
 */

import { getTranslationFlags, findIncompleteTranslations } from './translation-flags.js';
import { isBatchInQueue } from './batch-queue.js';

/**
 * Shows a dialog for selecting which pages to translate from a journal entry.
 * 
 * @param {JournalEntry} journal - The journal entry containing pages to select from
 * @returns {Promise<Array>} Promise resolving to an array of selected page objects
 */
export function showPageSelectionDialog(journal) {
    return new Promise((resolve) => {
        // Filter pages that have content and are not already translated/completed
        const pagesToTranslate = journal.pages.filter(page => {
            if (!page.text || !page.text.content) return false;
            
            const flags = getTranslationFlags(page);
            return !flags.completed; // Only include pages that haven't been completed
        });
        
        if (pagesToTranslate.length === 0) {
            ui.notifications.warn(`No untranslated pages with content found in "${journal.name}".`);
            resolve([]);
            return;
        }

        // Create checkbox HTML for each page with translation status
        const pageCheckboxes = pagesToTranslate.map((page, index) => {
            const flags = getTranslationFlags(page);
            let statusIcon = '';
            let statusText = '';
            let isDisabled = false;
            
            if (flags.queued && !flags.completed) {
                statusIcon = '<i class="fas fa-clock" style="color: orange; margin-left: 8px;"></i>';
                statusText = ` (In Progress - Batch: ${flags.batchId})`;
                isDisabled = true;
            }
            
            const checkboxAttributes = isDisabled 
                ? `disabled style="margin-right: 8px; opacity: 0.5;"` 
                : `checked data-page-index="${index}" style="margin-right: 8px;"`;
            
            const labelStyle = isDisabled 
                ? `display: flex; align-items: center; cursor: not-allowed; opacity: 0.7;` 
                : `display: flex; align-items: center; cursor: pointer;`;
            
            return `
                <div style="margin-bottom: 8px;">
                    <label style="${labelStyle}">
                        <input type="checkbox" ${checkboxAttributes}>
                        <strong>${page.name || `Page ${index + 1}`}</strong>
                        <span style="margin-left: 8px; color: #666; font-size: 12px;">
                            (${Math.min(page.text.content.length, 100)} chars${page.text.content.length > 100 ? '...' : ''})${statusText}
                        </span>
                        ${statusIcon}
                    </label>
                </div>
            `;
        }).join('');

        const totalPages = journal.pages.filter(page => page.text && page.text.content).length;
        const alreadyTranslated = totalPages - pagesToTranslate.length;
        
        let infoText = `<p>Select which pages you want to translate:</p>`;
        if (alreadyTranslated > 0) {
            infoText += `<p style="color: #666; font-size: 12px; margin-bottom: 8px;">
                <i class="fas fa-info-circle"></i> 
                ${alreadyTranslated} page${alreadyTranslated > 1 ? 's' : ''} already translated (hidden from selection)
            </p>`;
        }

        const content = `
            ${infoText}
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ccc; padding: 8px; margin: 8px 0;">
                ${pageCheckboxes}
            </div>
            <div style="margin-top: 12px;">
                <button type="button" id="select-all-pages" style="margin-right: 8px;">Select All</button>
                <button type="button" id="deselect-all-pages">Deselect All</button>
            </div>
        `;

        new Dialog({
            title: `Select Pages to Translate - ${journal.name}`,
            content: content,
            buttons: {
                translate: {
                    icon: '<i class="fas fa-language"></i>',
                    label: "Translate Selected",
                    callback: (html) => {
                        const selectedIndexes = [];
                        html.find('input[type="checkbox"]:checked:not(:disabled)').each((i, checkbox) => {
                            if (checkbox.dataset.pageIndex !== undefined) {
                                selectedIndexes.push(parseInt(checkbox.dataset.pageIndex));
                            }
                        });
                        
                        const selectedPages = selectedIndexes.map(index => pagesToTranslate[index]);
                        resolve(selectedPages);
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: () => resolve([])
                }
            },
            default: "translate",
            render: (html) => {
                // Add event listeners for select/deselect all buttons
                html.find('#select-all-pages').on('click', () => {
                    html.find('input[type="checkbox"]:not(:disabled)').prop('checked', true);
                });
                
                html.find('#deselect-all-pages').on('click', () => {
                    html.find('input[type="checkbox"]:not(:disabled)').prop('checked', false);
                });
            }
        }).render(true);
    });
}

/**
 * Creates an array of page update objects for batch updating journal pages with translated content.
 * 
 * @param {Array} pagesToTranslate - Array of page objects to be translated
 * @param {Array} translatedContents - Array of translated content strings corresponding to pages
 * @param {Function} contentTransformer - Function that takes (originalContent, translatedContent) and returns the final content
 * @returns {Array} Array of update objects with _id and 'text.content' properties for database updates
 * 
 * @example
 * const updates = createPageUpdates(pages, translations, (original, translated) => translated);
 * 
 * @description
 * Uses batch indices stored in page flags to properly map translations to pages, ensuring correct
 * reassembly even if pages were deleted during batch processing. Validates that translations are not empty,
 * transforms the content using the provided transformer function, and creates update objects suitable
 * for batch database operations. Skips pages with empty translations and shows warnings.
 */
export function createPageUpdates(pagesToTranslate, translatedContents, contentTransformer) {
    const pageUpdates = [];
    
    for (const page of pagesToTranslate) {
        const flags = getTranslationFlags(page);
        const batchIndex = flags.batchIndex;
        
        if (batchIndex === undefined || batchIndex === null) {
            console.warn(`Journal Translator | Page "${page.name}" has no batch index stored in flags. Skipping this page.`);
            continue;
        }
        
        const translatedContent = translatedContents[batchIndex];

        if (!translatedContent || translatedContent.trim() === "") {
            ui.notifications.warn(`Translation returned empty for page "${page.name}" (batch index ${batchIndex}). Skipping this page.`);
            continue;
        }

        const originalContent = page.text.content || "";
        const newContent = contentTransformer(originalContent, translatedContent);
        
        pageUpdates.push({
            _id: page.id,
            'text.content': newContent
        });
    }
    
    return pageUpdates;
}

/**
 * Creates translated page data objects from original pages and their translated content.
 * 
 * @param {Array} pagesToTranslate - Array of original page objects to be translated
 * @param {Array} translatedContents - Array of translated content strings corresponding to each page
 * @returns {Array} Array of translated page data objects with updated names and content
 * 
 * @description Uses batch indices stored in page flags to properly map translations to pages, ensuring correct
 * reassembly even if pages were deleted during batch processing. Creates new page objects with translated content.
 * Pages with empty or invalid translations are skipped and a warning is displayed. The returned objects maintain
 * the original page structure but with translated content and modified names (appending "(Translated)").
 */
export function createTranslatedPagesData(pagesToTranslate, translatedContents) {
    const translatedPagesData = [];
    
    for (const page of pagesToTranslate) {
        const flags = getTranslationFlags(page);
        const batchIndex = flags.batchIndex;
        
        if (batchIndex === undefined || batchIndex === null) {
            console.warn(`Journal Translator | Page "${page.name}" has no batch index stored in flags. Skipping this page.`);
            continue;
        }
        
        const translatedContent = translatedContents[batchIndex];

        if (!translatedContent || translatedContent.trim() === "") {
            ui.notifications.warn(`Translation returned empty for page "${page.name}" (batch index ${batchIndex}). Skipping this page.`);
            continue;
        }

        translatedPagesData.push({
            name: `${page.name} (Translated)`,
            type: page.type,
            text: {
                content: translatedContent,
                format: page.text.format
            },
            sort: page.sort,
            ownership: page.ownership
        });
    }
    
    return translatedPagesData;
}

/**
 * Shows a dialog asking user whether to restore an old batch or start a new translation
 * @param {JournalEntry} journal - The journal with incomplete translations
 * @param {Object} incompletePages - Object mapping batch IDs to arrays of incomplete pages
 * @returns {Promise<{action: string, batchId?: string}>} User's choice and selected batch ID
 */
export function showBatchRestorationDialog(journal, incompletePages) {
    return new Promise((resolve) => {
        const batchIds = Object.keys(incompletePages);
        
        // Create HTML for each incomplete batch
        const batchInfo = batchIds.map(batchId => {
            const pages = incompletePages[batchId];
            const isActive = isBatchInQueue(batchId);
            const statusText = isActive ? 
                '<span style="color: green;">● Currently being monitored</span>' : 
                '<span style="color: orange;">○ Not currently monitored</span>';
            
            return `
                <div style="margin-bottom: 12px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                    <div style="font-weight: bold;">Batch ID: ${batchId}</div>
                    <div style="font-size: 12px; color: #666; margin: 4px 0;">
                        ${statusText}
                    </div>
                    <div style="font-size: 12px;">
                        Pages waiting: ${pages.map(p => p.name || 'Unnamed').join(', ')}
                    </div>
                    <label style="margin-top: 8px; display: block;">
                        <input type="radio" name="selected-batch" value="${batchId}" ${batchIds.indexOf(batchId) === 0 ? 'checked' : ''}>
                        Restore this batch
                    </label>
                </div>
            `;
        }).join('');

        const content = `
            <p><strong>Incomplete translation detected!</strong></p>
            <p>Found ${batchIds.length} incomplete translation batch${batchIds.length > 1 ? 'es' : ''} in "${journal.name}":</p>
            
            <div style="max-height: 200px; overflow-y: auto; margin: 12px 0;">
                ${batchInfo}
            </div>
            
            <p style="margin-top: 12px; font-size: 13px; color: #666;">
                Choose whether to attempt to restore an existing batch or start a completely new translation.
            </p>
        `;

        new Dialog({
            title: "Incomplete Translation Found",
            content: content,
            buttons: {
                restore: {
                    icon: '<i class="fas fa-undo"></i>',
                    label: "Restore Selected Batch",
                    callback: (html) => {
                        const selectedBatch = html.find('input[name="selected-batch"]:checked').val();
                        resolve({ action: 'restore', batchId: selectedBatch });
                    }
                },
                new: {
                    icon: '<i class="fas fa-plus"></i>',
                    label: "Start New Translation",
                    callback: () => resolve({ action: 'new' })
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: () => resolve({ action: 'cancel' })
                }
            },
            default: "restore"
        }).render(true);
    });
}
