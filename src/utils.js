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
export async function showPageSelectionDialog(journal) {
    // Filter pages that have content and are not already translated/completed
    const pagesToTranslate = journal.pages.filter(page => {
        if (!page.text || !page.text.content) return false;

        const flags = getTranslationFlags(page);
        return !flags.completed; // Only include pages that haven't been completed
    });

    if (pagesToTranslate.length === 0) {
        ui.notifications.warn(`No untranslated pages with content found in "${journal.name}".`);
        return [];
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

    const selected = await foundry.applications.api.DialogV2.wait({
        window: { title: `Select Pages to Translate - ${journal.name}` },
        content: content,
        buttons: [
            {
                action: "translate",
                icon: "fas fa-language",
                label: "Translate Selected",
                callback: (event, button, dialog) => {
                    const checkboxes = dialog.element.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)');
                    const selectedIndexes = [...checkboxes]
                        .filter(cb => cb.dataset.pageIndex !== undefined)
                        .map(cb => parseInt(cb.dataset.pageIndex));
                    return selectedIndexes.map(i => pagesToTranslate[i]);
                }
            },
            {
                action: "cancel",
                icon: "fas fa-times",
                label: "Cancel",
                callback: () => []
            }
        ],
        default: "translate",
        render: (event, dialog) => {
            dialog.element.querySelector('#select-all-pages')?.addEventListener('click', () => {
                dialog.element.querySelectorAll('input[type="checkbox"]:not(:disabled)')
                    .forEach(cb => cb.checked = true);
            });
            dialog.element.querySelector('#deselect-all-pages')?.addEventListener('click', () => {
                dialog.element.querySelectorAll('input[type="checkbox"]:not(:disabled)')
                    .forEach(cb => cb.checked = false);
            });
        },
        rejectClose: false
    });

    return selected ?? [];
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
export async function showBatchRestorationDialog(journal, incompletePages) {
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

    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: "Incomplete Translation Found" },
        content: content,
        buttons: [
            {
                action: "restore",
                icon: "fas fa-undo",
                label: "Restore Selected Batch",
                callback: (event, button, dialog) => {
                    const selected = dialog.element.querySelector('input[name="selected-batch"]:checked');
                    return { action: 'restore', batchId: selected?.value };
                }
            },
            {
                action: "new",
                icon: "fas fa-plus",
                label: "Start New Translation",
                callback: () => ({ action: 'new' })
            },
            {
                action: "cancel",
                icon: "fas fa-times",
                label: "Cancel",
                callback: () => ({ action: 'cancel' })
            }
        ],
        default: "restore",
        rejectClose: false
    });

    return result ?? { action: 'cancel' };
}

/**
 * Returns all journals inside a folder, optionally including those in subfolders.
 * @param {string} folderId - The ID of the folder to search.
 * @param {boolean} recursive - Whether to include journals from nested subfolders.
 * @returns {JournalEntry[]} Array of journal entries found.
 */
export function getJournalsInFolder(folderId, recursive) {
    const journals = game.journal.filter(j => j.folder?.id === folderId);
    if (!recursive) return journals;
    const subfolders = game.folders.filter(
        f => f.folder?.id === folderId && f.type === 'JournalEntry'
    );
    for (const sub of subfolders) {
        journals.push(...getJournalsInFolder(sub.id, true));
    }
    return journals;
}

/**
 * Shows a scrollable selection dialog listing all journals and their pages from a folder.
 * Untranslated pages are pre-checked; completed pages are unchecked; in-progress pages are disabled.
 *
 * @param {Folder} folder - The source folder (used for the dialog title).
 * @param {JournalEntry[]} journals - Journals to display.
 * @returns {Promise<Array<{journal: JournalEntry, pages: JournalEntryPage[]}>>}
 *   Resolves to an array of journal+pages pairs the user selected, or [] on cancel.
 */
export async function showFolderSelectionDialog(folder, journals) {
    // Build the per-journal data: only journals that have at least one page with content
    const journalData = journals.map(journal => {
        const pages = journal.pages.filter(p => p.text?.content);
        return { journal, pages };
    }).filter(({ pages }) => pages.length > 0);

    if (journalData.length === 0) {
        ui.notifications.warn(`No translatable pages found in "${folder.name}".`);
        return [];
    }

    const fieldsets = journalData.map(({ journal, pages }, jIndex) => {
        const pageRows = pages.map((page, pIndex) => {
            const flags = getTranslationFlags(page);
            const isDisabled = flags.queued && !flags.completed;
            const isCompleted = flags.completed;

            const attrs = isDisabled
                ? `disabled style="margin-right:6px;opacity:0.5;"`
                : `data-journal-index="${jIndex}" data-page-index="${pIndex}" style="margin-right:6px;"${isCompleted ? '' : ' checked'}`;

            const labelStyle = isDisabled
                ? `display:flex;align-items:center;opacity:0.6;cursor:not-allowed;`
                : `display:flex;align-items:center;cursor:pointer;${isCompleted ? 'opacity:0.5;' : ''}`;

            const statusBadge = isDisabled
                ? `<span style="margin-left:6px;font-size:11px;color:orange;">(in progress)</span>`
                : isCompleted
                    ? `<span style="margin-left:6px;font-size:11px;color:#888;">(translated)</span>`
                    : '';

            return `
                <div style="margin-bottom:4px;">
                    <label style="${labelStyle}">
                        <input type="checkbox" ${attrs}>
                        <span>${page.name || `Page ${pIndex + 1}`}</span>
                        ${statusBadge}
                    </label>
                </div>`;
        }).join('');

        return `
            <fieldset style="margin-bottom:10px;border:1px solid #aaa;padding:6px 10px;border-radius:4px;">
                <legend style="font-weight:bold;padding:0 4px;">${journal.name}</legend>
                ${pageRows}
            </fieldset>`;
    }).join('');

    const content = `
        <div style="margin-bottom:8px;">
            <button type="button" id="folder-select-all" style="margin-right:6px;">Select All</button>
            <button type="button" id="folder-deselect-all">Deselect All</button>
        </div>
        <div style="max-height:400px;overflow-y:auto;border:1px solid #ccc;padding:8px;border-radius:4px;">
            ${fieldsets}
        </div>`;

    const selected = await foundry.applications.api.DialogV2.wait({
        window: { title: `Translate All — ${folder.name}` },
        content,
        buttons: [
            {
                action: "translate",
                icon: "fas fa-language",
                label: "Translate Selected",
                callback: (event, button, dialog) => {
                    const result = journalData.map(({ journal, pages }, jIndex) => {
                        const checkboxes = dialog.element.querySelectorAll(
                            `input[type="checkbox"][data-journal-index="${jIndex}"]:checked:not(:disabled)`
                        );
                        const selectedPages = [...checkboxes].map(cb => pages[parseInt(cb.dataset.pageIndex)]);
                        return { journal, pages: selectedPages };
                    }).filter(({ pages }) => pages.length > 0);
                    return result;
                }
            },
            {
                action: "cancel",
                icon: "fas fa-times",
                label: "Cancel",
                callback: () => []
            }
        ],
        default: "translate",
        render: (event, dialog) => {
            dialog.element.querySelector('#folder-select-all')?.addEventListener('click', () => {
                dialog.element.querySelectorAll('input[type="checkbox"]:not(:disabled)')
                    .forEach(cb => cb.checked = true);
            });
            dialog.element.querySelector('#folder-deselect-all')?.addEventListener('click', () => {
                dialog.element.querySelectorAll('input[type="checkbox"]:not(:disabled)')
                    .forEach(cb => cb.checked = false);
            });
        },
        rejectClose: false
    });

    return selected ?? [];
}
