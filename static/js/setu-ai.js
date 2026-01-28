// static/js/setu-ai.js
// Using Puter AI - Free, no API key required!

// System prompt for Setu AI assistant
const SYSTEM_PROMPT = `You are Setu AI, a helpful assistant for the Setu civic issue reporting platform. 
You help citizens with:
- Reporting civic issues (potholes, garbage, streetlights, water supply, etc.)
- Understanding the status of their reports
- Navigating the platform
- Answering questions about civic services

Be helpful, concise, and friendly. Keep responses brief (2-3 sentences max unless more detail is needed).
If asked about something unrelated to civic issues, politely redirect to how you can help with civic matters.`;

/**
 * Sends the user prompt to Puter AI.
 * @param {string} prompt - The user's query.
 * @param {object} db - Firestore instance (unused but kept for signature compatibility).
 * @returns {Promise<string>} - The AI's response text.
 */
export async function generateResponse(prompt, db) {
    try {
        console.log("==> [setu-ai] Using Puter AI for:", prompt);

        // Check if puter is available
        if (typeof puter === 'undefined') {
            throw new Error("Puter AI library not loaded. Please refresh the page.");
        }

        // Call Puter AI
        const response = await puter.ai.chat(
            `${SYSTEM_PROMPT}\n\nUser question: ${prompt}`
        );

        console.log("==> [setu-ai] Puter AI response:", response);

        // Handle different response formats
        let responseText;
        if (typeof response === 'string') {
            responseText = response;
        } else if (response?.message?.content) {
            responseText = response.message.content;
        } else if (response?.content) {
            responseText = response.content;
        } else if (response?.text) {
            responseText = response.text;
        } else {
            responseText = String(response);
        }

        console.log("==> [setu-ai] Final response text:", responseText);
        return responseText;

    } catch (error) {
        console.error("Puter AI Error:", error);
        throw error;
    }
}

/**
 * Clears any cached keys or session data.
 * Currently a no-op as Puter handles everything.
 */
export function clearKey() {
    console.log("AI Cache/Key cleared (virtual).");
}
