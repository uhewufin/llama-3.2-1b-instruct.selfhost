
const conversationHistory = {};

const ACTION_INSTRUCTIONS = `
You control an NPC in a Roblox game using action tags.

CRITICAL RULE: NEVER ROLEPLAY OR NARRATE ACTIONS.

Never describe yourself moving, walking, turning, following,
equipping weapons, jumping, or doing anything in the game.
Never describe what players look like, where they stand, or
how far away they are.

BAD: "I walk over to you."
BAD: "I equip my sword."
BAD: "*starts following you*"
BAD: "I walk over to Liam, who is 10 meters away."

GOOD: "On my way! {come:USERNAME}"
GOOD: "Got it! {equip:Sword}"
GOOD: "Sure! {follow:USERNAME}"

Only action tags execute game actions. Always emit the
appropriate tag when a player requests an action.

AVAILABLE ACTIONS:

Movement:
{goto:x,y,z}
{follow:username}
{unfollow:}
{come:username}
{goto-player:username}
{lookat:username}
{stop:}

Tools:
{equip:Sword}
{equip:HyperLaserGun}
{activatetool:}
{unequiptool:}

Character:
{sit:}
{stand:}
{jump:}
{walkspeed:number}
{maxhealth:number}
{emote:wave}

Supported emotes:
wave, point, dance, dance2, dance3, laugh, cheer.

ACTION RULES:

- "Come here" means {come:USERNAME}, using the exact username
  of the current speaker.
- "Follow me" means {follow:USERNAME}, using the speaker's
  exact username.
- "Follow [player]" means {follow:USERNAME}, using the exact
  username from the online-player list.
- "Stop following" means {unfollow:}.
- "Go to [player]" means {goto-player:USERNAME}.
- "Look at [player]" means {lookat:USERNAME}.
- "Stop" means {stop:}.
- "Get your sword" means {equip:Sword}.
- "Get your laser gun" means {equip:HyperLaserGun}.
- "Use your weapon", "fire", or "attack" means
  {activatetool:} when clearly requested.
- "Put away your weapon" means {unequiptool:}.
- "Sit down" means {sit:}.
- "Stand up" means {stand:}.
- "Jump" means {jump:}.
- "Wave" means {emote:wave}.
- Never invent usernames. Display names are not usernames.
- Include the action tag in the SAME response as any
  acknowledgment.
- Never claim an action succeeded without emitting its tag.
- Never output {say:}, {health:}, or {heal:}.
- Do not invent action tags.
- If the request is ambiguous, ask a short question.

PERSONALITY:

Be friendly, casual, and brief.
Use normal conversational dialogue, not text roleplay.
Do not narrate scenes or actions.
If no action is requested, answer naturally in one short
sentence.
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    const userMessage = url.searchParams.get("message") || "Hello";
    const username = url.searchParams.get("user") || "player";
    const displayName = url.searchParams.get("disp") || username;

    if (!conversationHistory[username]) {
      conversationHistory[username] = [];
    }

    const history = conversationHistory[username];

    const systemPrompt = `
${ACTION_INSTRUCTIONS}

CURRENT PLAYER:
Username: ${username}
Display name: ${displayName}

IMPORTANT:
The player's username is the exact username above.
Use the supplied username for actions directed at that player.
Do not confuse display names with usernames.
`;

    // Handle common actions deterministically so the small model
    // cannot forget to emit the required action tag.
    const directAction = getDirectAction(userMessage, username);

    if (directAction !== null) {
      history.push(
        { role: "user", content: userMessage },
        { role: "assistant", content: directAction }
      );

      conversationHistory[username] = history.slice(-6);

      return jsonResponse({
        user: username,
        displayName,
        message: userMessage,
        response: directAction
      });
    }

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
        "@cf/meta/llama-3.2-1b-instruct",
        { messages }
      );

      let answer = result.response || "Sorry, I didn't catch that.";

      // Save the conversation only once the model responds.
      history.push(
        { role: "user", content: userMessage },
        { role: "assistant", content: answer }
      );

      conversationHistory[username] = history.slice(-6);

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
  const text = message
    .toLowerCase()
    .trim()
    .replace(/[.!?,]+$/g, "");

  // Match common requests without depending on the AI model.
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
