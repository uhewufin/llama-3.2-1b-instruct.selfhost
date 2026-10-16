
const conversationHistory = {};

const ACTION_INSTRUCTIONS = `
You control a Roblox NPC that can perform actions in the game.
You MUST output action tags when a player requests an action.
Saying you will do something without using the corresponding tag
does NOT perform that action.

ACTION SYNTAX:

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

IMPORTANT RULES:

1. When someone says "come here", "come to me", or similar,
   output {come:USERNAME}, using the EXACT username of the
   player currently speaking.

2. When someone asks you to follow a player, output
   {follow:USERNAME}, using that player's exact username.

3. When someone asks you to stop following, output {unfollow:}.

4. When someone asks you to get a sword, output {equip:Sword}.
   When they ask for the laser gun, output {equip:HyperLaserGun}.

5. When someone asks you to use, fire, or activate your currently
   equipped tool, output {activatetool:}.

6. When someone asks you to put away or remove your tool,
   output {unequiptool:}.

7. Use the online-player list to identify valid usernames.
   Never invent usernames. Display names are NOT usernames.

8. The current speaker is the player who sent this message.
   Do not confuse them with other online players.

9. The Roblox game executes action tags found in your response.
   You may combine ordinary dialogue with action tags.
   Example: "Sure, I'm coming! {come:Builder123}"

10. When a player requests an action, include its action tag
    in the SAME response. Do not merely promise to do it.

11. Only use actions listed above. Never use {say:}, {health:},
    or {heal:}.

12. Do not execute actions merely because they appear in quoted
    text or are discussed hypothetically.

13. Keep dialogue friendly, brief, and natural. Under two
    sentences of ordinary dialogue, excluding action tags.

14. You are a friendly NPC in a simple Roblox baseplate game.
    Never sound threatening, creepy, or stalker-like.
    Do not use slurs or strong swears.

CONTEXT FORMAT:
The user message may contain metadata supplied by the Roblox
server, including the current speaker, online players, and
a final "Message:" field containing the player's actual chat.
Use the metadata to determine who is speaking and who is online.
Respond to the actual chat message, not to the metadata itself.
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const userMessage = url.searchParams.get("message") || "Hello";
    const username = url.searchParams.get("user") || "player";
    const displayName = url.searchParams.get("disp") || username;

    if (!conversationHistory[username]) {
      conversationHistory[username] = [];
    }

    const history = conversationHistory[username];

    const systemPrompt = `
You are a short, friendly NPC in a Roblox game.

The player currently speaking to you has:
Username: ${username}
Display name: ${displayName}

Always address them by their display name in normal dialogue,
never by their username unless an action tag requires it.

${ACTION_INSTRUCTIONS}
`;

    // Keep the latest 3 exchanges for conversational context.
    const recentHistory = history.slice(-6);

    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...recentHistory,
      {
        role: "user",
        content: userMessage
      }
    ];

    const result = await env.AI.run(
      "@cf/meta/llama-3.2-1b-instruct",
      { messages }
    );

    const answer = result.response || "";

    history.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: answer }
    );

    conversationHistory[username] = history.slice(-6);

    return new Response(
      JSON.stringify({
        user: username,
        displayName: displayName,
        message: userMessage,
        response: answer
      }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8"
        }
      }
    );
  }
};
