export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const userMessage = url.searchParams.get("message") || "Hello";
    const username = url.searchParams.get("user") || "player";
    const displayName = url.searchParams.get("disp") || username;

    const response = await env.AI.run("@cf/meta/llama-3.2-1b-instruct", {
      messages: [
        {
          role: "system",
          content: `You are a short, friendly NPC in a Roblox game. The game just consists of a baseplate, and a spawnpoint. Keep replies under 2 sentences. The player you're talking to is named "${displayName}" (username: ${username}). You can address them by their display name.`
        },
        { role: "user", content: userMessage }
      ]
    });

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
