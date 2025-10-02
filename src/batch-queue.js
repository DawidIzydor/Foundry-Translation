/**
 * Batch queue manager for tracking active OpenAI batch operations.
 */

import { MODULE_ID } from './settings.js';

// Global batch queue to track active batches
const activeBatches = new Set();

/**
 * Adds a batch ID to the active monitoring queue
 * @param {string} batchId - The OpenAI batch ID to monitor
 */
export function addBatchToQueue(batchId) {
    if (batchId) {
        activeBatches.add(batchId);
        console.log(`Journal Translator | Added batch ${batchId} to monitoring queue`);
    }
}

/**
 * Removes a batch ID from the active monitoring queue
 * @param {string} batchId - The OpenAI batch ID to stop monitoring
 */
export function removeBatchFromQueue(batchId) {
    if (batchId && activeBatches.has(batchId)) {
        activeBatches.delete(batchId);
        console.log(`Journal Translator | Removed batch ${batchId} from monitoring queue`);
    }
}

/**
 * Checks if a batch ID is currently being monitored
 * @param {string} batchId - The OpenAI batch ID to check
 * @returns {boolean} True if the batch is in the active queue
 */
export function isBatchInQueue(batchId) {
    return batchId && activeBatches.has(batchId);
}

/**
 * Gets all currently active batch IDs
 * @returns {Array<string>} Array of active batch IDs
 */
export function getActiveBatches() {
    return Array.from(activeBatches);
}

/**
 * Clears all batches from the queue (useful for cleanup)
 */
export function clearBatchQueue() {
    activeBatches.clear();
    console.log(`Journal Translator | Cleared all batches from monitoring queue`);
}