export async function onRequest({ env }) {
  if (!env.AI) {
    return Response.json({
      error: "no AI binding",
      hint: "Enable in CF dashboard: Pages → stdtool → Settings → Functions → AI bindings → add binding named 'AI'"
    }, { status: 503 });
  }
  try {
    const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: "Reply only: WORKERS_AI_OK" }],
      max_tokens: 16
    });
    return Response.json({ status: "WORKERS_AI_OK", model: "@cf/meta/llama-3.1-8b-instruct", result: r });
  } catch (err) {
    return Response.json({ error: err.message, type: err.constructor?.name }, { status: 500 });
  }
}
