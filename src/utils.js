/**
 * Utility functions for the Journal Translator module.
 */

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
