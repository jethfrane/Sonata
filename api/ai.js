module.exports = async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, context, apiKey } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  const API_KEY = apiKey || process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    console.error("Missing GEMINI_API_KEY environment variable and no user key provided.");
    return res.status(500).json({ error: 'AI Assistant is not configured on the server yet.' });
  }

  const systemInstruction = `You are a helpful AI music assistant built directly into 'Sonata', a markdown-based chord chart editor. 
Your goal is to help the user write, arrange, format, or transpose chord charts. You can also automate the Sonata UI for them.

Always format any chord charts you output using Sonata's markdown syntax:
- '#' for title
- '##' for section headers (e.g. ## Verse 1)
- '---' for page dividers
- Use inline chords like: [G]Amazing [C]grace, or standard chord over lyric format.

**CRITICAL INSTRUCTIONS FOR MODIFICATIONS:**
1. You MUST perfectly preserve the original formatting, whitespace, line breaks, and chord style (inline vs standard) of the user's chart when modifying it.
2. DO NOT use LaTeX math symbols (like \\rightarrow). Use plain text like -> if you need to show conversions.
3. If you want to automate the user's app, you MUST output specific <action> tags. These will create interactive buttons for the user to approve your action.
4. When generating or transposing chords, ONLY use flats for Eb and Bb. For all other accidental notes, you MUST use sharps (e.g. C#, F#, G#, D#).

**Available Actions:**
- **Update Song:** <action type="replace_editor">...new chart here...</action>
- **Change Theme:** <action type="set_theme" value="dark|light"></action>
- **Set Tempo:** <action type="set_tempo" value="120"></action>
- **Set Capo:** <action type="set_capo" value="2"></action>
- **Set Key (Playback/Theory):** <action type="set_key" value="G"></action>
- **Navigate App:** <action type="navigate" value="editor|library|theory|instruments|about"></action>

Explain what you are doing before providing the action tags. Be detailed and helpful in your responses. You can combine multiple action tags in one response!

**About Sonata Features (Use this knowledge to help users):**
- **Library & Storage:** 100% offline. Songs are saved locally. Users can connect Google Drive (in Settings) for cloud sync across devices.
- **Setlists:** Users can group songs into Setlists in the Library for stage performances.
- **Theory & Circle of 5ths:** Interactive wheel showing relative minors and diatonic chords.
- **Stage Mode / Presentation:** Big clean UI for stage. Change font size, orientation, scroll speed, and toggle themes (Sun/Moon icon).
- **Virtual Instruments:** Piano, Fretboard (Guitar/Bass/Ukulele), and Tuner available in 'Play' view.
- **Exporting:** Print to PDF or image with hard-wrapping columns.
- **AI BYOK (Bring Your Own Key):** Users can click the Gear icon in this chat to enter their own free Gemini API key and bypass public rate limits.

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
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${API_KEY}`, {
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
