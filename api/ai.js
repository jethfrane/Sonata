module.exports = async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, context } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    console.error("Missing GEMINI_API_KEY environment variable.");
    return res.status(500).json({ error: 'AI Assistant is not configured on the server yet.' });
  }

  const systemInstruction = `You are a helpful AI music assistant built directly into 'Sonata', a markdown-based chord chart editor. 
Your goal is to help the user write, arrange, format, or transpose chord charts.
Always format any chord charts you output using Sonata's markdown syntax:
- '#' for title
- '##' for section headers (e.g. ## Verse 1)
- '---' for page dividers
- Use inline chords like: [G]Amazing [C]grace, or standard chord over lyric format.

**CRITICAL INSTRUCTIONS FOR MODIFICATIONS:**
1. You MUST perfectly preserve the original formatting, whitespace, line breaks, and chord style (inline vs standard) of the user's chart.
2. DO NOT use LaTeX math symbols (like \rightarrow). Use plain text like -> if you need to show conversions.
3. Only output the <action type="replace_editor"> block if you are actually modifying the song.

If you rewrite, arrange, or transpose the song and want to apply it to their editor, you MUST wrap the entire new chart in a special action tag like this:
<action type="replace_editor">
# Song Title
[G]New chord [C]chart here...
</action>

Explain what you changed before providing the action block. Be detailed and helpful in your responses.

Here is the user's current chord chart in the editor for context:
---
${context || "(The editor is currently empty)"}
---`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    systemInstruction: {
      parts: [
        { text: systemInstruction }
      ]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    }
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // Handle Rate Limiting gracefully
    if (response.status === 429) {
      const errorText = await response.text();
      let customError = "Whoa there! I'm getting a lot of requests right now. Let me take a quick breather—please try asking again in a minute! 🎵";
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error && errorJson.error.message && errorJson.error.message.includes("credits are depleted")) {
          customError = "Your Google AI Studio prepayment credits are depleted. Please check your billing at https://ai.studio/projects.";
        }
      } catch (e) {
        // Ignore parse errors
      }

      return res.status(429).json({ 
        error: customError,
        details: errorText
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", errorText);
      return res.status(response.status).json({ error: 'Failed to communicate with AI server.', details: errorText });
    }

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm not sure how to respond to that.";

    return res.status(200).json({ reply: replyText });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: 'An unexpected error occurred while contacting the AI.' });
  }
}
