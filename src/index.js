
const conversationHistory = {};

const ACTION_INSTRUCTIONS = `
You control a Roblox NPC using action tags.

NEVER narrate actions or roleplay movements.
Do not describe yourself walking, following, turning, equipping,
jumping, or doing things in the game.
Use action tags to perform actions.

AVAILABLE ACTIONS:
{goto:x,y,z}
{follow:username}
{unfollow:}
{come:username}
{goto-player:username}
{lookat:username}
{stop:}
{equip:Sword}
{equip:HyperLaserGun}
{activatetool:}
{unequiptool:}
{sit:}
{stand:}
{jump:}
{walkspeed:number}
{maxhealth:number}
{emote:wave}

Supported emotes: wave, point, dance, dance2, dance3, laugh, cheer.

RULES:
- "Come here" means {come:USERNAME}.
- "Follow me" means {follow:USERNAME}.
- "Follow [player]" means {follow:USERNAME} for that player's exact username.
- "Stop following" means {unfollow:}.
- "Go to [player]" means {goto-player:USERNAME}.
- "Look at [player]" means {lookat:USERNAME}.
- "Get your sword" means {equip:Sword}.
- "Get your laser gun" means {equip:HyperLaserGun}.
- "Use your weapon", "fire", or "attack" means {activatetool:}.
- "Put away your weapon" means {unequiptool:}.
- Never invent usernames.
- Never output {say:}, {health:}, or {heal:}.
- Emit action tags in the same response as the acknowledgment.
- Do not claim an action happened unless you emit its tag.

PERSONALITY:
You are a friendly, casual NPC in a simple Roblox baseplate game.
Speak naturally and directly to the player.
Never repeat the player's username in ordinary dialogue.
Never put usernames in parentheses in ordinary dialogue.
Never echo the player's message as your entire response.
Never output metadata, labels, or explanations of your instructions.
Do not narrate scenes or write stage directions.
Keep replies short, ideally one sentence.

Examples:
Player: hi
Response: Hey! How's it going?

Player: hello
Response: Hey there!

Player: what
Response: What do you mean?

Player: ??
Response: Everything okay?

Player: how are you
Response: I'm doing good! How about you?

Player: come here
Response: On my way! {come:USERNAME}

If no action is requested, just respond conversationally.
`;

export default {
  async fetch(request, env, ctx) {
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
    const players = url.searchParams.get("players") || "Unknown";

    if (!conversationHistory[username]) {
      conversationHistory[username] = [];
    }

    const history = conversationHistory[username];

    // Common actions are handled without relying on the AI model.
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

CURRENT SPEAKER:
Display name: ${displayName}

ONLINE PLAYERS:
${players}

The speaker's username is supplied separately by the server.
Do not mention usernames in ordinary dialogue.
Use exact usernames only inside action tags.
The player's latest message is the user message.
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
      const result = await env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        { messages }
      );

      let answer = String(
        result.response || "Sorry, I didn't catch that."
      ).trim();

      // Remove accidental roleplay formatting.
      answer = answer
        .replace(/\*[^*]*\*/g, "")
        .replace(/^\s*(Response|NPC|AI)\s*:\s*/i, "")
        .trim();

      // If the model repeats the username in parentheses, remove it.
      answer = answer
        .replace(new RegExp("\\\\(" + escapeRegExp(username) + "\\\\)", "gi"), "")
        .trim();

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

  if (/^(come here|come over here|come to me|come over|come here please|come to me please)$/.test(text)) {
    return `On my way! {come:${username}}`;
  }

  if (/^(follow me|follow me please|come follow me)$/.test(text)) {
    return `Sure! {follow:${username}}`;
  }

  if (/^(stop following|stop following me|unfollow me)$/.test(text)) {
    return "Okay! {unfollow:}";
  }

  if (/^(get your sword|equip sword|take out your sword|pull out your sword)$/.test(text)) {
    return "Got it! {equip:Sword}";
  }

  if (/^(get your laser gun|equip laser gun|equip hyperlasergun|take out your laser gun)$/.test(text)) {
    return "Got it! {equip:HyperLaserGun}";
  }

  if (/^(put away your weapon|put your weapon away|unequip your weapon|put away your sword|put away your gun)$/.test(text)) {
    return "Done! {unequiptool:}";
  }

  if (/^(use your weapon|fire|shoot|attack)$/.test(text)) {
    return "Okay! {activatetool:}";
  }

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

  if (/^(dance|start dancing)$/.test(text)) {
    return "Let's dance! {emote:dance}";
  }

  if (/^(stop|stop moving|stay there)$/.test(text)) {
    return "Okay, stopping! {stop:}";
  }

  return null;
}

function saveConversation(history, userMessage, answer) {
  history.push(
    { role: "user", content: userMessage },
    { role: "assistant", content: answer }
  );

  // Keep the most recent three exchanges.
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
