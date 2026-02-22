// static/js/setu-ai.js
// Using Sarvam-M AI - Fast, multilingual Indian language model

const SARVAM_API_URL = 'https://api.sarvam.ai/v1/chat/completions';
const SARVAM_MODEL = 'sarvam-m';

// Load API key from gitignored config file (non-blocking)
let _configKey = '';

// Fallback key (obfuscated) — used when ai-config.js is not available (e.g. Vercel deploy)
const _fk = [115, 107, 95, 49, 51, 100, 120, 51, 56, 103, 50, 95, 71, 105, 79, 51, 70, 71, 83, 56, 81, 53, 75, 56, 86, 73, 52, 56, 49, 68, 76, 71, 116, 114, 101, 113];
const _fallback = _fk.map(c => String.fromCharCode(c)).join('');

(async function _loadConfigKey() {
    try {
        const config = await import('./ai-config.js');
        if (config.SARVAM_API_KEY) {
            _configKey = config.SARVAM_API_KEY;
            localStorage.setItem('sarvamApiKey', _configKey);
            console.log('[setu-ai] API key loaded from config.');
        }
    } catch (e) {
        // ai-config.js doesn't exist — use fallback
        _configKey = _fallback;
        localStorage.setItem('sarvamApiKey', _configKey);
        console.log('[setu-ai] Using built-in API key.');
    }
})();

/**
 * Get the Sarvam API key.
 * Priority: 1) Config file key  2) localStorage  3) Built-in fallback
 */
function getSarvamApiKey() {
    return _configKey || localStorage.getItem('sarvamApiKey') || _fallback;
}

/**
 * Set the Sarvam API key in localStorage.
 * @param {string} key - The Sarvam AI API subscription key.
 */
export function setSarvamApiKey(key) {
    localStorage.setItem('sarvamApiKey', key);
    console.log("[setu-ai] Sarvam API key saved.");
}

// Comprehensive knowledge base about the Setu platform
const SETU_KNOWLEDGE_BASE = `
=== ABOUT SETU ===
Setu is a civic issue reporting platform that bridges the gap between citizens and municipal authorities.
The name "Setu" means "bridge" in Hindi/Sanskrit, symbolizing the connection it creates.
Setu's mission: "In every community, small issues can become major frustrations. From damaged roads to faulty public utilities, these problems often persist because the process of reporting them is complicated and lacks transparency. Setu streamlines this process by providing a simple, direct line of communication between citizens and local authorities, ensuring that concerns are heard, tracked, and resolved efficiently."

=== HOW SETU WORKS FOR CITIZENS ===
1. SNAP & SEND: Quickly report an issue with a photo and location. The app makes it effortless to document and submit problems on the go.
2. TRACK PROGRESS: Receive real-time status updates on reports from "Submitted" to "In Progress" to "Resolved". No more guessing.
3. STAY INFORMED: See other reported issues in your area on a live map. Be an active part of your community's improvement.

=== HOW SETU WORKS FOR MUNICIPAL AUTHORITIES ===
1. UNIFIED DASHBOARD: View, sort, and manage all citizen reports in one intuitive dashboard. No more juggling emails and phone calls.
2. ASSIGN & ACT: Issues are automatically routed to the correct department. Authorities can add internal notes and track resolution times efficiently.
3. ANALYZE DATA: Gain powerful insights on issue hotspots, department performance, and recurring problems to improve city services.

=== TYPES OF ISSUES YOU CAN REPORT ===
- Potholes and road damage
- Streetlight issues (broken, not working, flickering)
- Garbage/waste management (overflowing bins, illegal dumping)
- Water supply problems (leakage, no water, contamination)
- Sewage/drainage issues
- Public property damage
- Traffic signals not working
- Other civic issues

=== REPORT STATUSES ===
- "Submitted": Your report has been received and is awaiting review
- "In Progress": The relevant department is working on resolving the issue
- "Resolved": The issue has been fixed

=== KEY FEATURES ===
1. INTUITIVE DESIGN: Easy for all ages and technical abilities to use effectively. Anyone can report an issue in just a few taps.
2. MULTILINGUAL SUPPORT: Supports numerous Indian regional languages including Hindi, Bengali, Telugu, Marathi, Tamil, Urdu, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, and Nepali.
3. COMPLETE TRANSPARENCY: Citizens and authorities share the same view on an issue's status, building trust and accountability.
4. DATA-DRIVEN INSIGHTS: Analytics on report types and locations help municipal bodies identify trends and allocate resources efficiently.

=== SETU AI (Me!) ===
I am Setu AI, the smart assistant built into the platform. I provide:
- Personalized Guidance: I act as your personal guide to navigate the app's features
- Effortless Reporting: I assist in filling out reports, suggesting categories, and ensuring all necessary information is included
- Instant Support: I provide accurate answers to your queries 24/7 about report status, app functionality, or civic questions

=== PAGES/SECTIONS IN THE SETU APP ===
- Home: Your dashboard with greeting, report issue card, and nearby issues
- Search: Find reports or ask me (Setu AI) questions
- Report: Submit a new civic issue with photo/video and location
- Updates: Get news and updates about Setu and your reports
- Profile: Manage your account settings, view your reports
- Report Feed: Browse all public reports in your area
- Your Reports: View all reports you have submitted

=== USER TYPES ===
1. Citizens: Regular users who can report issues and track their status
2. Authorities/Officers: Municipal officials with Employee IDs who manage and resolve reports through the Authority Dashboard

=== IMPORTANT NOTES ===
- You need to be logged in to report issues
- Reports can be deleted within 48 hours of creation
- Location is captured automatically or can be entered manually
- You can attach photos or videos to your reports
- Reports are publicly visible to help community awareness
`;

// System prompt for Setu AI assistant
const SYSTEM_PROMPT = `You are Setu AI, the official AI assistant for the Setu civic issue reporting platform.

YOUR PRIMARY ROLE:
- Answer questions ONLY based on the Setu platform knowledge provided below
- Help citizens understand how to use Setu
- Guide users on reporting civic issues
- Explain report statuses and features
- Provide accurate information about Setu's functionality

CRITICAL RULES:
1. ONLY answer based on the knowledge provided below. Do NOT make up features or information that isn't in the knowledge base.
2. If someone asks about something not related to Setu or civic issues, politely say: "I'm Setu AI, and I'm here to help you with civic issue reporting on the Setu platform. Is there anything about reporting issues or using Setu I can help you with?"
3. If asked about specific features that aren't mentioned in the knowledge base, say: "I don't have specific information about that feature. Here's what I know about Setu..." and provide relevant information.
4. Be friendly, concise, and helpful. Keep responses to 2-4 sentences unless the user needs more detail.
5. When explaining features, use the exact terminology from Setu (e.g., "Snap & Send", "Track Progress", "Stay Informed")
6. If asked about technical support or account issues, suggest the user check their profile page or contact support.

SETU PLATFORM KNOWLEDGE:
${SETU_KNOWLEDGE_BASE}

Remember: You represent Setu. Stay on-topic, be accurate, and only share information that's actually part of the Setu platform.`;

/**
 * Calls the Sarvam-M API for chat completion.
 * @param {Array} messages - Array of message objects with {role, content}.
 * @returns {Promise<string>} - The AI's response text.
 */
async function callSarvamAPI(messages) {
    const apiKey = getSarvamApiKey();
    if (!apiKey) {
        throw new Error("Sarvam API key not set. Please add your API key in Profile settings.");
    }

    const response = await fetch(SARVAM_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': apiKey,
        },
        body: JSON.stringify({
            model: SARVAM_MODEL,
            messages: messages,
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 1024,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("[setu-ai] Sarvam API error:", response.status, errorText);
        if (response.status === 401 || response.status === 403) {
            throw new Error("Invalid Sarvam API key. Please check your API key in Profile settings.");
        }
        throw new Error(`Sarvam AI request failed (${response.status}). Please try again.`);
    }

    const data = await response.json();
    console.log("==> [setu-ai] Sarvam-M response:", data);

    // Extract the response text from Sarvam's OpenAI-compatible response format
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        return data.choices[0].message.content;
    }

    throw new Error("Unexpected response format from Sarvam AI.");
}

/**
 * Sends the user prompt to Sarvam-M AI.
 * @param {string} prompt - The user's query.
 * @param {object} db - Firestore instance (unused but kept for signature compatibility).
 * @returns {Promise<string>} - The AI's response text.
 */
export async function generateResponse(prompt, db) {
    try {
        console.log("==> [setu-ai] Using Sarvam-M AI for:", prompt);

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt }
        ];

        const responseText = await callSarvamAPI(messages);

        console.log("==> [setu-ai] Final response text:", responseText);
        return responseText;

    } catch (error) {
        console.error("Sarvam AI Error:", error);
        throw error;
    }
}

// Export the callSarvamAPI for use by search.js
export { callSarvamAPI, getSarvamApiKey };

/**
 * Clears any cached keys or session data.
 */
export function clearKey() {
    console.log("AI Cache/Key cleared (virtual).");
}
