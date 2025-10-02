/**

 * OpenAI Batch API functionality for the Journal Translator module.
 */

import { MODULE_ID } from './settings.js';

/**
 * Sends multiple journal contents to the OpenAI Batch API for translation.
 * This involves uploading a file, creating a batch job, polling for its completion,
 * and then downloading and processing the results.
 * @param {string[]} textsToTranslate - Array of HTML contents of journal pages.
 * @param {Object} options - Optional configuration object.
 * @param {Function} options.onBatchCreated - Callback function called with batchId when batch is created but before waiting for completion.
 * @return {Promise<{batchId: string, translations: string[]}>} - An object containing the batch ID and translated text strings.
 */
export async function callOpenAIBatch(textsToTranslate, options = {}) {
    const apiKey = game.settings.get(MODULE_ID, "apiKey");
    if (!apiKey || apiKey.trim() === "") {
        ui.notifications.error("OpenAI API Key is missing. Please enter your API key in the module settings.");
        return { batchId: null, translations: [] };
    }

    try {
        const batchFile = prepareBatch(textsToTranslate);

        const fileUploadResponse = await uploadBatchFile(batchFile, apiKey);
        const { id: fileId } = await fileUploadResponse.json();
        console.log("Journal Translator | Batch file uploaded. File ID:", fileId);

        const batchJob = await createBatchJob(fileId, apiKey);
        
        // Call the onBatchCreated callback if provided, after batch is created but before waiting for completion
        if (options.onBatchCreated && typeof options.onBatchCreated === 'function') {
            try {
                await options.onBatchCreated(batchJob.id);
            } catch (callbackError) {
                console.warn("Journal Translator | onBatchCreated callback failed:", callbackError);
                // Continue processing even if callback fails
            }
        }
        
        const completedBatch = await waitForBatchCompletion(batchJob, apiKey);
        const resultsResponse = await retrieveBatchResponse(completedBatch, apiKey);

        const translationsMap = await processResults(resultsResponse);
        const finalTranslations = assembleFinalResults(translationsMap, textsToTranslate.length);
        
        ui.notifications.info("All translations completed successfully!");
        return { batchId: batchJob.id, translations: finalTranslations };

    } catch (error) {
        console.error("Journal Translator | A critical error occurred during batch translation:", error);
        ui.notifications.error(`Batch translation failed: ${error.message}`);
        return { batchId: null, translations: [] }; // Return an empty result on failure to prevent downstream errors.
    }
}

/**
 * Prepares the batch file for OpenAI API.
 * @param {string[]} textsToTranslate - Array of texts to translate.
 * @returns {File} The batch file ready for upload.
 */
function prepareBatch(textsToTranslate) {
    const customPrompt = game.settings.get(MODULE_ID, "customPrompt");
    const modelVersion = game.settings.get(MODULE_ID, "modelVersion");
    const systemPrompt = game.settings.get(MODULE_ID, "systemPrompt");
    
    const batchRequests = textsToTranslate.map((text, index) => ({
        custom_id: `request-${index}`, // A unique ID to map requests to results.
        method: "POST",
        url: "/v1/chat/completions",
        body: {
            model: modelVersion,
            messages: [
                {
                    role: "system",
                    content: systemPrompt
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

/**
 * Uploads the batch file to OpenAI.
 * @param {File} batchFile - The batch file to upload.
 * @param {string} apiKey - The OpenAI API key.
 * @returns {Promise<Response>} The upload response.
 */
async function uploadBatchFile(batchFile, apiKey) {
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

/**
 * Creates a batch job on OpenAI.
 * @param {string} fileId - The uploaded file ID.
 * @param {string} apiKey - The OpenAI API key.
 * @returns {Promise<Object>} The batch job object.
 */
async function createBatchJob(fileId, apiKey) {
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

/**
 * Waits for batch completion.
 * @param {Object} batchJob - The batch job object.
 * @param {string} apiKey - The OpenAI API key.
 * @returns {Promise<Object>} The completed batch object.
 */
async function waitForBatchCompletion(batchJob, apiKey) {
    ui.notifications.info("Processing translations... This may take a few minutes up to an hour.");
    const completedBatch = await pollBatchStatus(batchJob.id, apiKey);

    if (completedBatch.status !== 'completed') {
        ui.notifications.error(`Batch job failed with status: ${completedBatch.status}`);
    } else {
        ui.notifications.info(`Batch job completed successfully!`);
    }
    return completedBatch;
}

/**
 * Retrieves the batch response from OpenAI.
 * @param {Object} completedBatch - The completed batch object.
 * @param {string} apiKey - The OpenAI API key.
 * @returns {Promise<Response>} The results response.
 */
export async function retrieveBatchResponse(completedBatch, apiKey) {
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

/**
 * Processes the results from the batch response.
 * @param {Response} resultsResponse - The results response.
 * @returns {Promise<Map>} A map of translations.
 */
export async function processResults(resultsResponse) {
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

/**
 * Assembles the final results from the translations map.
 * @param {Map} translationsMap - The map of translations.
 * @param {number} originalLength - The original number of texts.
 * @returns {string[]} The final translations array.
 */
export function assembleFinalResults(translationsMap, originalLength) {
    const finalTranslations = [];
    for (let i = 0; i < originalLength; i++) {
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

/**
 * Polls the OpenAI API for the status of a batch job until it's completed or failed.
 * @param {string} batchId - The ID of the batch job to poll.
 * @param {string} apiKey - The OpenAI API key.
 * @returns {Promise<object>} The final batch job object from the API.
 */
export async function pollBatchStatus(batchId, apiKey) {
    const pollingDelay = game.settings.get(MODULE_ID, "pollingDelay") * 1000; // Convert seconds to milliseconds
    const maxAttempts = game.settings.get(MODULE_ID, "maxPollingAttempts");

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

        // Show progress if request counts are available
        let progressMessage = `Batch job is still processing... (${batchStatus.status})`;
        if (batchStatus.request_counts) {
            const { completed = 0, total = 0 } = batchStatus.request_counts;
            if (total > 0) {
                progressMessage = `Batch job is still processing... (${completed}/${total} requests completed)`;
            }
        }
        ui.notifications.info(progressMessage);

        // Wait before the next poll.
        await new Promise(resolve => setTimeout(resolve, pollingDelay));
    }
    
    // If the loop finishes without the job completing, throw a timeout error.
    const timeoutMinutes = Math.round((maxAttempts * pollingDelay) / 60000);
    throw new Error(`Batch job timed out after ${timeoutMinutes} minutes.`);
}
