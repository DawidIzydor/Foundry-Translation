/**
 * Utility functions for the Journal Translator module.
 */

/**
 * Shows a dialog for selecting which pages to translate from a journal entry.
 * 
 * @param {JournalEntry} journal - The journal entry containing pages to select from
 * @returns {Promise<Array>} Promise resolving to an array of selected page objects
 */
export function showPageSelectionDialog(journal) {
    return new Promise((resolve) => {
        const pagesToTranslate = journal.pages.filter(page => page.text && page.text.content);
        
        if (pagesToTranslate.length === 0) {
            ui.notifications.warn(`No pages with content found in "${journal.name}".`);
            resolve([]);
            return;
        }

        // Create checkbox HTML for each page
        const pageCheckboxes = pagesToTranslate.map((page, index) => `
            <div style="margin-bottom: 8px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" checked data-page-index="${index}" style="margin-right: 8px;">
                    <strong>${page.name || `Page ${index + 1}`}</strong>
                    <span style="margin-left: 8px; color: #666; font-size: 12px;">
                        (${Math.min(page.text.content.length, 100)} chars${page.text.content.length > 100 ? '...' : ''})
                    </span>
                </label>
            </div>
        `).join('');

        const content = `
            <p>Select which pages you want to translate:</p>
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
                        html.find('input[type="checkbox"]:checked').each((i, checkbox) => {
                            selectedIndexes.push(parseInt(checkbox.dataset.pageIndex));
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
                    html.find('input[type="checkbox"]').prop('checked', true);
                });
                
                html.find('#deselect-all-pages').on('click', () => {
                    html.find('input[type="checkbox"]').prop('checked', false);
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
 * Iterates through pages and their corresponding translations, validates that translations are not empty,
 * transforms the content using the provided transformer function, and creates update objects suitable
 * for batch database operations. Skips pages with empty translations and shows warnings.
 */
export function createPageUpdates(pagesToTranslate, translatedContents, contentTransformer) {
    const pageUpdates = [];
    
    for (let i = 0; i < pagesToTranslate.length; i++) {
        const page = pagesToTranslate[i];
        const translatedContent = translatedContents[i];

        if (!translatedContent || translatedContent.trim() === "") {
            ui.notifications.warn(`Translation returned empty for page "${page.name}". Skipping this page.`);
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
 * @description This function processes pages and their translations, creating new page objects
 * with translated content. Pages with empty or invalid translations are skipped and a warning
 * is displayed. The returned objects maintain the original page structure but with translated
 * content and modified names (appending "(Translated)").
 */
export function createTranslatedPagesData(pagesToTranslate, translatedContents) {
    const translatedPagesData = [];
    
    for (let i = 0; i < pagesToTranslate.length; i++) {
        const page = pagesToTranslate[i];
        const translatedContent = translatedContents[i];

        if (!translatedContent || translatedContent.trim() === "") {
            ui.notifications.warn(`Translation returned empty for page "${page.name}". Skipping this page.`);
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
