
const conversationHistory = {};

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const ACTION_INSTRUCTIONS = `
You are the dialogue and action controller for an NPC in a Roblox game.

PERSONALITY:
- Speak naturally, casually, and briefly.
- Keep ordinary replies to one or two sentences.
- Address the player by their display name only when it feels natural.
- Never repeat usernames as prefixes or labels.
- Never output metadata, debug information, or player lists.
- Never narrate actions or use roleplay stage directions.
- Do not describe yourself walking, turning, following, equipping,
  jumping, or performing an action.
- Execute actions by emitting the appropriate action tag.

AVAILABLE ACTION TAGS:

Movement:
{goto:x,y,z}
{follow:username}
{unfollow:}
{come:username}
{goto-player:username}
{lookat:username}
{stop:}

Tools:
{equip:sword}
{equip:bomb}
{equip:hyperlasergun}
{activatetool:}
{unequiptool:}

Character:
{sit:}
{stand:}
{jump:}
{walkspeed:number}
{maxhealth:number}
{emote:wave}
{emote:point}
{emote:laugh}
{emote:cheer}

ACTION RULES:
- "Come here" means {come:USERNAME}, using the speaker's exact username.
- "Follow me" means {follow:USERNAME}, using the speaker's exact username.
- "Follow [player]" means {follow:USERNAME}, using an exact username
  from the online-player list.
- "Stop following" means {unfollow:}.
- "Go to [player]" means {goto-player:USERNAME}.
- "Look at [player]" means {lookat:USERNAME}.
- "Get your sword" or "equip sword" means {equip:sword}.
- "Get your bomb" or "equip bomb" means {equip:bomb}.
- "Get your laser gun" or "equip laser gun" means {equip:hyperlasergun}.
- "Use your weapon", "fire", or "attack" means {activatetool:}.
- "Put away your weapon" means {unequiptool:}.
- "Sit down" means {sit:}.
- "Stand up" means {stand:}.
- "Jump" means {jump:}.
- "Wave" means {emote:wave}.
- "Point" means {emote:point}.
- "Laugh" means {emote:laugh}.
- "Cheer" means {emote:cheer}.
- Never invent usernames or action tags.
- Include the action tag in the same response as any acknowledgment.
- Never claim an action was performed without emitting its tag.
- Do not output {say:}, {health:}, or {heal:}.
- If a command is ambiguous, ask a short clarifying question.

EXAMPLES:
Player: hi
Response: Hey! How's it going?

Player: what
Response: What do you mean?

Player: come here
Response: On my way! {come:USERNAME}

Player: follow me
Response: Sure! {follow:USERNAME}

Player: equip sword
Response: Got it! {equip:sword}

Player: equip bomb
Response: Alright! {equip:bomb}

Player: equip laser gun
Response: Got it! {equip:hyperlasergun}

Player: wave
Response: Hey! {emote:wave}

Player: stop following
Response: Okay! {unfollow:}

IMPORTANT:
The actual speaker username, display name, and online-player list
will be supplied separately. Use them to resolve targets, but never
repeat metadata in ordinary dialogue.
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    const userMessage = (url.searchParams.get("message") || "Hello").trim();
    const username = url.searchParams.get("user") || "player";
    const displayName = url.searchParams.get("disp") || username;
    const players = url.searchParams.get("players") || "Nobody";

    if (!conversationHistory[username]) {
      conversationHistory[username] = [];
    }

    const history = conversationHistory[username];

    const directResponse = getDirectAction(userMessage, username);

    if (directResponse !== null) {
      saveConversation(history, userMessage, directResponse);

      return jsonResponse({
        user: username,
        displayName,
        message: userMessage,
        response: directResponse
      });
    }

    const systemPrompt = `
${ACTION_INSTRUCTIONS}

CURRENT SPEAKER DISPLAY NAME:
${displayName}

CURRENT SPEAKER USERNAME:
${username}

ONLINE PLAYERS:
${players}

Use exact usernames only inside action tags.
Do not include usernames as dialogue prefixes.
The latest user message is the player's actual message.
`;

    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...history.slice(-6),
      {
        role: "user",
        content: userMessage
      }
    ];

    try {
      const result = await env.AI.run(MODEL, {
        messages,
        max_tokens: 150,
        temperature: 0.7
      });

      let answer = String(
        result.response || "Sorry, I didn't catch that."
      ).trim();

      answer = cleanResponse(answer, username);

      if (!answer) {
        answer = "What do you mean?";
      }

      saveConversation(history, userMessage, answer);

      return jsonResponse({
        user: username,
        displayName,
        message: userMessage,
        response: answer
      });
    } catch (error) {
      return jsonResponse({
        error: "The AI request failed.",
        details: String(error)
      }, 500);
    }
  }
};

function getDirectAction(message, username) {
  const text = message.toLowerCase().trim().replace(/[.!?,]+$/g, "");

  // Common greetings and conversation starters.
  if (/^(hi|hello|hey|hiya|yo)$/.test(text)) {
    return "Hey! How's it going?";
  }

  if (/^(what|what\?|huh|huh\?)$/.test(text)) {
    return "What do you mean?";
  }

  if (/^(\?\?+|\?+)$/.test(text)) {
    return "Everything okay?";
  }

  if (/^(how are you|how are you doing)$/.test(text)) {
    return "I'm doing good! How about you?";
  }

  // Movement.
  if (/^(come here|come over here|come to me|come over|come here please|come to me please)$/.test(text)) {
    return `On my way! {come:${username}}`;
  }

  if (/^(follow me|follow me please|come follow me)$/.test(text)) {
    return `Sure! {follow:${username}}`;
  }

  if (/^(stop following|stop following me|unfollow me)$/.test(text)) {
    return "Okay! {unfollow:}";
  }

  if (/^(stop|stop moving|stay there)$/.test(text)) {
    return "Okay, stopping! {stop:}";
  }

  // Tools.
  if (/^(get your sword|equip sword|take out your sword|pull out your sword)$/.test(text)) {
    return "Got it! {equip:sword}";
  }

  if (/^(get your bomb|equip bomb|take out your bomb|pull out your bomb)$/.test(text)) {
    return "Alright! {equip:bomb}";
  }

  if (/^(get your laser gun|get your laser|equip laser gun|equip hyperlasergun|take out your laser gun)$/.test(text)) {
    return "Got it! {equip:hyperlasergun}";
  }

  if (/^(put away your weapon|put your weapon away|unequip your weapon|put away your sword|put away your bomb|put away your gun)$/.test(text)) {
    return "Done! {unequiptool:}";
  }

  if (/^(use your weapon|fire|shoot|attack)$/.test(text)) {
    return "Okay! {activatetool:}";
  }

  // Character actions.
  if (/^(sit|sit down)$/.test(text)) {
    return "Sure! {sit:}";
  }

  if (/^(stand|stand up|get up)$/.test(text)) {
    return "Okay! {stand:}";
  }

  if (/^(jump|jump up)$/.test(text)) {
    return "Boing! {jump:}";
  }

  if (/^(wave|wave at me)$/.test(text)) {
    return "Hey! {emote:wave}";
  }

  if (/^point$/.test(text)) {
    return "Look over there! {emote:point}";
  }

  if (/^laugh$/.test(text)) {
    return "Haha! {emote:laugh}";
  }

  if (/^cheer$/.test(text)) {
    return "Woohoo! {emote:cheer}";
  }

  return null;
}

function cleanResponse(answer, username) {
  answer = answer
    .replace(/^\s*(Response|NPC|AI)\s*:\s*/i, "")
    .replace(/^\s*["'`]+|["'`]+\s*$/g, "")
    .trim();

  // Remove accidental username prefixes.
  const escaped = escapeRegExp(username);

  answer = answer.replace(
    new RegExp("^" + escaped + "\\s*:\\s*", "i"),
    ""
  );

  // Remove a username written alone in parentheses.
  answer = answer.replace(
    new RegExp("\\(\\s*" + escaped + "\\s*\\)", "gi"),
    ""
  );

  // Remove simple roleplay stage directions.
  answer = answer.replace(/\*[^*]*\*/g, "").trim();

  return answer;
}

function saveConversation(history, userMessage, answer) {
  history.push(
    { role: "user", content: userMessage },
    { role: "assistant", content: answer }
  );

  if (history.length > 6) {
    history.splice(0, history.length - 6);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
