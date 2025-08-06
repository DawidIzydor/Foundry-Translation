/**
 * Journal Translator Module
 *
 * This module adds a "Translate" option to the context menu of journal entries.
 * When selected, it sends the journal's content to the OpenAI API for translation
 * based on a user-provided prompt and API key, then creates a new journal entry
 * with the translated content. Alternatively, it can prepend the translation
 * to the original journal entry or replace the original content.
 */

const MODULE_ID = "foundry-translation";

/**
 * Initialization hook to register module settings.
 */
Hooks.on('init', () => {
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


/**
 * Sends multiple journal contents to the OpenAI Batch API for translation.
 * This involves uploading a file, creating a batch job, polling for its completion,
 * and then downloading and processing the results.
 * @param {string[]} textsToTranslate - Array of HTML contents of journal pages.
 * @return {Promise<string[]>} - An array of translated text strings in their original order.
 */
async function callOpenAIBatch(textsToTranslate) {
    const apiKey = game.settings.get(MODULE_ID, "apiKey");
    if (!apiKey || apiKey.trim() === "") {
        ui.notifications.error("OpenAI API Key is missing. Please enter your API key in the module settings.");
        return [];
    }

    try {
        const batchFile = PrepareBatch();

        const fileUploadResponse = await UploadBatchFile(batchFile);
        const { id: fileId } = await fileUploadResponse.json();
        console.log("Journal Translator | Batch file uploaded. File ID:", fileId);

        const batchJob = await CreateBatchJob(fileId);
        const completedBatch = await WaitForBatchCompletion(batchJob);
        const resultsResponse = await RetrieveBatchResponse(completedBatch);

        const translationsMap = await ProcessResults(resultsResponse);
        const finalTranslations = AssembleFinalResults(translationsMap);
        
        ui.notifications.info("All translations completed successfully!");
        return finalTranslations;

    } catch (error) {
        console.error("Journal Translator | A critical error occurred during batch translation:", error);
        ui.notifications.error(`Batch translation failed: ${error.message}`);
        return []; // Return an empty array on failure to prevent downstream errors.
    }

    function PrepareBatch() {
        const customPrompt = game.settings.get(MODULE_ID, "customPrompt");
        const batchRequests = textsToTranslate.map((text, index) => ({
            custom_id: `request-${index}`, // A unique ID to map requests to results.
            method: "POST",
            url: "/v1/chat/completions",
            body: {
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that translates text found inside journal entries for a tabletop roleplaying game. You should preserve the original HTML formatting (headings, paragraphs, lists, bold, italics, classes etc.) in your translation as well as any tags starting with @ such as @Check."
                    },
                    {
                        role: "user",
                        content: `${customPrompt}\n\n---\n\n${text}`
                    }
                ]
            }
        }));

        // Convert each request object into a JSON string and join them with newlines.
        const batchFileContent = batchRequests.map(JSON.stringify).join("\n");
        const batchFile = new File([batchFileContent], "batch.jsonl", { type: "application/jsonlines" });
        return batchFile;
    }

    async function UploadBatchFile(batchFile) {
        ui.notifications.info("Uploading translation batch file...");
        const formData = new FormData();
        formData.append("purpose", "batch");
        formData.append("file", batchFile);

        const fileUploadResponse = await fetch("https://api.openai.com/v1/files", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}` },
            body: formData
        });

        if (!fileUploadResponse.ok) {
            const errorData = await fileUploadResponse.json();
            throw new Error(`File Upload Failed: ${errorData.error.message}`);
        }
        return fileUploadResponse;
    }

    async function CreateBatchJob(fileId) {
        ui.notifications.info("Creating translation batch job...");
        const createBatchResponse = await fetch("https://api.openai.com/v1/batches", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                input_file_id: fileId,
                endpoint: "/v1/chat/completions",
                completion_window: "24h" // We must set it to 24h because of OpenAI limitations. The script doesn't wait for more than 1 hour though.
            })
        });

        if (!createBatchResponse.ok) {
            const errorData = await createBatchResponse.json();
            throw new Error(`Batch Creation Failed: ${errorData.error.message}`);
        }
        const batchJob = await createBatchResponse.json();
        console.log("Journal Translator | Batch job created. Batch ID:", batchJob.id);
        return batchJob;
    }

    async function WaitForBatchCompletion(batchJob) {
        ui.notifications.info("Processing translations... This may take a few minutes up to an hour.");
        const completedBatch = await pollBatchStatus(batchJob.id, apiKey);

        if (completedBatch.status !== 'completed') {
            ui.notifications.error(`Batch job failed with status: ${completedBatch.status}`);
        } else {
            ui.notifications.info(`Batch job completed successfully!`);
        }
        return completedBatch;
    }

    async function RetrieveBatchResponse(completedBatch) {
        ui.notifications.info("Downloading translated content...");
        const resultsFileId = completedBatch.output_file_id;
        const resultsResponse = await fetch(`https://api.openai.com/v1/files/${resultsFileId}/content`, {
            headers: { "Authorization": `Bearer ${apiKey}` }
        });

        if (!resultsResponse.ok) {
            const errorData = await resultsResponse.json();
            throw new Error(`Failed to download results: ${errorData.error.message}`);
        }
        return resultsResponse;
    }

    async function ProcessResults(resultsResponse) {
        const resultsContent = await resultsResponse.text();
        const resultsLines = resultsContent.trim().split("\n");
        const translationsMap = new Map();

        for (const line of resultsLines) {
            const result = JSON.parse(line);
            const customId = result.custom_id;
            // Check for errors in the individual request within the batch.
            if (result.response.body.error) {
                console.error(`Journal Translator | Error in request ${customId}:`, result.response.body.error.message);
                continue; // Skip this failed result.
            }
            const translatedText = result.response.body.choices[0].message.content;
            translationsMap.set(customId, translatedText);
        }
        return translationsMap;
    }

    function AssembleFinalResults(translationsMap) {
        const finalTranslations = [];
        for (let i = 0; i < textsToTranslate.length; i++) {
            const customId = `request-${i}`;
            if (translationsMap.has(customId)) {
                finalTranslations.push(translationsMap.get(customId));
            } else {
                // If a specific translation failed, push an empty string to maintain order.
                finalTranslations.push("");
                console.warn(`Journal Translator | No result found for ${customId}.`);
            }
        }
        return finalTranslations;
    }
}

/**
 * Polls the OpenAI API for the status of a batch job until it's completed or failed.
 * @param {string} batchId - The ID of the batch job to poll.
 * @param {string} apiKey - The OpenAI API key.
 * @returns {Promise<object>} The final batch job object from the API.
 */
async function pollBatchStatus(batchId, apiKey) {
    const delay = 30000; // Poll every 30 seconds.
    const maxAttempts = 120; // Set a timeout of 60 minutes (120 * 30s).

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
        const response = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
            headers: { "Authorization": `Bearer ${apiKey}` }
        });

        if (!response.ok) {
            // This handles errors in the polling request itself.
            const errorData = await response.json();
            ui.notifications.error(`Failed to poll batch status: ${errorData.error.message}`);
            throw new Error(`Polling Error: ${errorData.error.message}`);
        }

        const batchStatus = await response.json();

        // If the job is finished (completed, failed, or cancelled), return the status object.
        if (['completed', 'failed', 'cancelled'].includes(batchStatus.status)) {
            return batchStatus;
        }

        ui.notifications.info(`Batch job is still processing... (${batchStatus.status})`);

        // Wait before the next poll.
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // If the loop finishes without the job completing, throw a timeout error.
    throw new Error("Batch job timed out after 10 minutes.");
}

/**
 * Translates the entire journal entry using batch processing.
 * @param {JournalEntry} journal - The journal entry to translate.
 * @return {Promise<void>} - Resolves when the translation is complete.
 */
async function translateJournal(journal) {
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
        ui.notifications.info(`Successfully prepended translations to "${journal.name}".`);
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
function createPageUpdates(pagesToTranslate, translatedContents, contentTransformer) {
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
function createTranslatedPagesData(pagesToTranslate, translatedContents) {
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

