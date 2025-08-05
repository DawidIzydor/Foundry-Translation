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
            "replace": "Replace Original Journal"
        },
        default: "new"
    });
});


/**
 * Adds the "Translate" option to the journal entry context menu.
 * This hook is triggered when the context menu for a journal entry is about to be displayed.
 */
Hooks.on('getJournalEntryContextOptions', (document, options) => {
    // Add the "Translate" option to the context menu.
    options.push({
        name: "Translate",
        icon: '<i class="fas fa-language"></i>',
        callback: () => {
            Dialog.confirm({
                title: "Translate Journal Entry",
                content: "<p>This translation may take several minutes depending on the journal size and OpenAI API speed. Do you want to continue?</p>",
                yes: async () => {
                    if (document) {
                        let journal = game.journal.get($(document)[0].options.collection._source[0]._id);
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
 * Translates the content of a single journal page.
    * @param {JournalEntryPage} page - The journal page to translate.
    * @return {Promise<string>} - The translated content of the page.
 */

async function translateJournalPage(page){

    let originalContent = page.text && page.text.content ? page.text.content : "";

    if (!originalContent) {
        ui.notifications.warn(`Journal Page "${page.name}" is empty and cannot be translated.`);
        return "";
    }

    return callOpenAI(originalContent);
}

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
    const customPrompt = game.settings.get(MODULE_ID, "customPrompt");

    // 1. Prepare the content for the batch file.
    // Each line in the file must be a JSON object representing a single API request.
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
    try {
        // 2. Upload the batch file to OpenAI.
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
        const { id: fileId } = await fileUploadResponse.json();
        console.log("Journal Translator | Batch file uploaded. File ID:", fileId);

        // 3. Create the batch job using the uploaded file's ID.
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
                completion_window: "1h" // The job must complete within 1 hour.
            })
        });

        if (!createBatchResponse.ok) {
            const errorData = await createBatchResponse.json();
            throw new Error(`Batch Creation Failed: ${errorData.error.message}`);
        }
        const batchJob = await createBatchResponse.json();
        console.log("Journal Translator | Batch job created. Batch ID:", batchJob.id);

        // 4. Poll for the batch job's completion.
        ui.notifications.info("Processing translations... This may take a few minutes up to an hour.");
        const completedBatch = await pollBatchStatus(batchJob.id, apiKey);

        if (completedBatch.status !== 'completed') {
            ui.notifications.error(`Batch job failed with status: ${completedBatch.status}`);
        }else{
            ui.notifications.info(`Batch job completed successfully!`);
        }

        // 5. Retrieve the results file content.
        ui.notifications.info("Downloading translated content...");
        const resultsFileId = completedBatch.output_file_id;
        const resultsResponse = await fetch(`https://api.openai.com/v1/files/${resultsFileId}/content`, {
            headers: { "Authorization": `Bearer ${apiKey}` }
        });

        if (!resultsResponse.ok) {
            const errorData = await resultsResponse.json();
            throw new Error(`Failed to download results: ${errorData.error.message}`);
        }

        // 6. Process the results.
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

        // 7. Assemble the final results in their original order using the custom_id.
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
        
        ui.notifications.info("All translations completed successfully!");
        return finalTranslations;

    } catch (error) {
        console.error("Journal Translator | A critical error occurred during batch translation:", error);
        ui.notifications.error(`Batch translation failed: ${error.message}`);
        return []; // Return an empty array on failure to prevent downstream errors.
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
    const isPrepend = translationMode === 'prepend';
    const isNew = translationMode === 'new';
    const isReplace = translationMode === 'replace';

    // Collect all page contents
    const pagesToTranslate = journal.pages.filter(page => page.text && page.text.content);
    const pageContents = pagesToTranslate.map(page => page.text.content);

    if (pageContents.length === 0) {
        ui.notifications.warn(`No pages with content found in "${journal.name}".`);
        return;
    }

    ui.notifications.info(`Translating ${pageContents.length} pages in batch...`);
    const translatedContents = await callOpenAIBatch(pageContents);

    const pageUpdates = [];
    const translatedPagesData = [];

    for (let i = 0; i < pagesToTranslate.length; i++) {
        const page = pagesToTranslate[i];
        const translatedContent = translatedContents[i];

        if (!translatedContent || translatedContent.trim() === "") {
            ui.notifications.warn(`Translation returned empty for page "${page.name}". Skipping this page.`);
            continue;
        }

        if (isPrepend) {
            const originalContent = page.text.content || "";
            const newContent = translatedContent + '<hr style="margin: 1em 0;">' + originalContent;
            pageUpdates.push({
                _id: page.id,
                'text.content': newContent
            });
        } else if (isReplace) {
            const newContent = translatedContent;
            pageUpdates.push({
                _id: page.id,
                'text.content': newContent
            });
        } else if (isNew) {
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
    }

    if (isPrepend) {
        if (pageUpdates.length > 0) {
            await journal.updateEmbeddedDocuments("JournalEntryPage", pageUpdates);
            ui.notifications.info(`Successfully prepended translations to "${journal.name}".`);
        } else {
            ui.notifications.warn(`No pages were updated for "${journal.name}".`);
        }
    } else if (isReplace) {
        if (pageUpdates.length > 0) {
            await journal.updateEmbeddedDocuments("JournalEntryPage", pageUpdates);
            ui.notifications.info(`Successfully replaced original with translations in "${journal.name}".`);
        } else {
            ui.notifications.warn(`No pages were updated for "${journal.name}".`);
        }
    } else if (isNew) {
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
}

