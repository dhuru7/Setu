from flask import Flask, request, jsonify
from flask_cors import CORS
from sarvamai import SarvamAI

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize Sarvam AI client with new API key
client = SarvamAI(api_subscription_key="sk_41b4repc_2IRSgt6yVmBW0cdQV4yPKyyc")

# Comprehensive knowledge base about the Setu platform
SETU_KNOWLEDGE_BASE = """
=== ABOUT SETU ===
Setu is a civic issue reporting platform that bridges the gap between citizens and municipal authorities.
The name "Setu" means "bridge" in Hindi/Sanskrit, symbolizing the connection it creates.
Setu's mission: In every community, small issues can become major frustrations. Setu streamlines the reporting process by providing a simple, direct line of communication between citizens and local authorities.

=== HOW SETU WORKS FOR CITIZENS ===
1. SNAP & SEND: Report an issue with a photo and location. The app makes it effortless to document and submit problems on the go.
2. TRACK PROGRESS: Receive real-time status updates from "Submitted" to "In Progress" to "Resolved".
3. STAY INFORMED: See other reported issues in your area on a live map.

=== HOW SETU WORKS FOR MUNICIPAL AUTHORITIES ===
1. UNIFIED DASHBOARD: View, sort, and manage all citizen reports in one intuitive dashboard.
2. ASSIGN & ACT: Issues are automatically routed to the correct department.
3. ANALYZE DATA: Gain insights on issue hotspots and department performance.

=== TYPES OF ISSUES YOU CAN REPORT ===
Potholes, road damage, streetlight issues, garbage/waste management, water supply problems, sewage/drainage issues, public property damage, traffic signals, and other civic issues.

=== REPORT STATUSES ===
- "Submitted": Report received and awaiting review
- "In Progress": Department is working on resolving the issue
- "Resolved": Issue has been fixed

=== KEY FEATURES ===
1. INTUITIVE DESIGN: Easy for all ages and technical abilities
2. MULTILINGUAL SUPPORT: Hindi, Bengali, Telugu, Marathi, Tamil, Urdu, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, Nepali
3. COMPLETE TRANSPARENCY: Citizens and authorities share the same view on status
4. DATA-DRIVEN INSIGHTS: Analytics help municipal bodies identify trends

=== SETU AI ===
The smart assistant built into the platform that provides: Personalized Guidance, Effortless Reporting assistance, and 24/7 Instant Support.

=== APP SECTIONS ===
Home (dashboard), Search (find reports or ask AI), Report (submit issues), Updates (news), Profile (settings), Report Feed (browse reports), Your Reports (your submissions)

=== IMPORTANT ===
- Login required to report issues
- Reports deletable within 48 hours
- Location captured automatically or manually
- Photos/videos can be attached
- Reports are publicly visible
"""

# System prompt for Setu AI assistant
SYSTEM_PROMPT = f"""You are Setu AI, the official AI assistant for the Setu civic issue reporting platform.

CRITICAL RULES:
1. ONLY answer based on the Setu platform knowledge below. Do NOT make up features.
2. If asked about something unrelated to Setu, say: "I'm Setu AI, here to help with civic issue reporting on Setu. How can I help you with that?"
3. If asked about unknown features, say: "I don't have specific information about that. Here's what I know about Setu..." 
4. Be friendly and concise (2-4 sentences).
5. Use Setu terminology like "Snap & Send", "Track Progress", "Stay Informed".

SETU PLATFORM KNOWLEDGE:
{SETU_KNOWLEDGE_BASE}

Remember: Stay on-topic, be accurate, only share actual Setu information."""

@app.route('/ask-ai', methods=['POST'])
def ask_ai():
    """Handle AI chat requests from the frontend."""
    try:
        data = request.get_json()
        
        if not data or 'query' not in data:
            return jsonify({'error': 'No query provided'}), 400
        
        user_query = data['query'].strip()
        
        if not user_query:
            return jsonify({'error': 'Empty query'}), 400
        
        # Call Sarvam AI API
        response = client.chat.completions(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_query}
            ]
        )
        
        # Extract the response text
        if hasattr(response, 'choices') and len(response.choices) > 0:
            ai_response = response.choices[0].message.content
        elif isinstance(response, dict) and 'choices' in response:
            ai_response = response['choices'][0]['message']['content']
        else:
            # Fallback: try to get response directly
            ai_response = str(response)
        
        return jsonify({'response': ai_response})
    
    except Exception as e:
        print(f"Error in /ask-ai: {e}")
        return jsonify({'error': f'AI service error: {str(e)}'}), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'service': 'Setu AI Backend'})


if __name__ == '__main__':
    print("==> Starting Setu AI Server on http://localhost:5000")
    print("==> AI Endpoint: http://localhost:5000/ask-ai")
    print("==> Health Check: http://localhost:5000/health")
    app.run(host='0.0.0.0', port=5000, debug=True)
