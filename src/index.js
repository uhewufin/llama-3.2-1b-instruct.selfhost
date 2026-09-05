const conversationHistory = {}; // keyed by username - resets on Worker restart/cold-start

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
    history.push({ role: "user", content: userMessage });

    // Keep only the last 6 messages (3 exchanges) to control context size/cost
    const recentHistory = history.slice(-6);

    const messages = [
      {
        role: "system",
        content: `You are a short, friendly NPC in a Roblox game. The game just consists of a baseplate, and a spawnpoint. Keep replies under 2 sentences. The player you're talking to is named "${displayName}" (username: ${username}). Always address them by their display name, never their username. Never say anything that could sound creepy, stalker-ish, or threatening — no mentioning watching/observing the player, no ominous phrasing. Don't use swears or slurs; mild ones are allowed such as crap, damn, hell, or frick.`
      },
      ...recentHistory
    ];

    const response = await env.AI.run("@cf/meta/llama-3.2-1b-instruct", { messages });

    history.push({ role: "assistant", content: response.response });
    conversationHistory[username] = history.slice(-6);

    return new Response(JSON.stringify({
      user: username,
      displayName: displayName,
      message: userMessage,
      response: response.response
    }), {
      headers: { "content-type": "application/json" }
    });
  }
};
