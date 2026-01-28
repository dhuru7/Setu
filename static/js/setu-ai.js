/**
 * Setu AI Module
 * Powered by Internal Python Proxy (Bypasses CORS/Browser Restrictions)
 */

export async function generateResponse(prompt) {
    const url = "/ask-ai";

    console.log(`[Setu AI] Sending query to ${url}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: prompt })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error(`[Setu AI] Proxy Error:`, data);
            throw new Error(data.error || "Server proxy failed.");
        }

        if (data.response) {
            console.log(`[Setu AI] Success via Proxy!`);
            return data.response;
        }

        throw new Error("Empty response from server.");

    } catch (error) {
        console.error("[Setu AI] Connection failed:", error);
        throw new Error("Unable to reach Setu AI server. Ensure 'app.py' is running.");
    }
}

export function clearKey() {
    // No-op
}
