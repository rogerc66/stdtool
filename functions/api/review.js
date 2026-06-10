// functions/api/review.js — LLM per-clause content review
// Called from Review.jsx after structural check (phase 0) passes.
//
// POST /api/review
//   body: { standard: "gbt11"|"isoiec", clauses: [{clause_id, title, body, section_type}], structural: {...} }
// Response: { model, reviews: [{clause_id, title, issues: [{rule, problem, severity, suggestion}]}] }
//
// Model cascade (first available wins):
//   @cf/qwen/qwen2.5-coder-32b-instruct  ← primary (lean, no <think>)
//   @cf/qwen/qwq-32b                      ← fallback (reasoning quality)
//   @cf/deepseek-ai/deepseek-r1-distill-qwen-32b

const MODEL_PRIORITY = [
  "@cf/qwen/qwen2.5-coder-32b-instruct",           // primary: lean, no <think> overhead
  "@cf/qwen/qwq-32b",                               // fallback: reasoning quality
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",  // last fallback
];

// Strip reasoning-model think blocks and find the first balanced JSON object.
// Greedy regex (\{[\s\S]*\}) fails when models emit trailing `}}` — use brace counter instead.
function extractJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr) {
      if (ch === '{') depth++;
      else if (ch === '}') { if (--depth === 0) { try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; } } }
    }
  }
  return null;
}

function getResponseText(result) {
  if (typeof result?.response === 'string') return result.response;
  // Some CF models (e.g. qwen2.5-coder) return result.response as a parsed object when
  // the model outputs valid JSON. Re-serialise so extractJson can handle it uniformly.
  if (result?.response && typeof result.response === 'object') return JSON.stringify(result.response);
  if (typeof result?.generated_text === 'string') return result.generated_text;
  if (typeof result?.result?.response === 'string') return result.result.response;
  if (Array.isArray(result)) {
    return result.map(r => r.generated_text || r.response || '').join('');
  }
  return '';
}

// Classify a Workers AI error into one of three categories:
//   quota_exceeded — daily Neuron cap (CF code 3036, "used up your daily free allocation of 10,000 neurons");
//                    resets 00:00 UTC
//   rate_limited   — transient capacity shortage (CF code 3040, "No more data centers") OR per-minute 429;
//                    retry shortly, no UTC-midnight reset. NOTE: code 3040/"capacity" is NOT a daily quota.
//   ai_error       — generic (model unavailable, network, etc.)
function classifyAiError(err) {
  const msg = (err?.message || String(err)).toLowerCase()
  const status = Number(err?.status || err?.statusCode || 0)
  // CF Workers AI may surface the vendor error code on err.code or err.cause.code
  const cfCode = Number(err?.code || err?.cause?.code || 0)

  // quota_exceeded: CF error 3036 — daily Neuron cap
  // Signature: "used up your daily free allocation of 10,000 neurons"
  // Excluded: "capacity"/"no more data centers" (code 3040) — that is transient, not a daily cap
  if (cfCode === 3036
      || /free allocation|10[,\s]?000.{0,8}neuron|billing/.test(msg)
      || (/daily/.test(msg) && !/no more data center|capacity/.test(msg))) {
    return 'quota_exceeded'
  }
  // rate_limited: CF error 3040 "No more data centers to forward the request to" = transient capacity;
  // also generic per-minute 429 / rate-limit responses
  if (cfCode === 3040
      || /no more data center|capacity/.test(msg)
      || status === 429
      || /rate.?limit|too many request/.test(msg)) {
    return 'rate_limited'
  }
  return 'ai_error'
}

// Next 00:00 UTC as ISO string — the point at which the daily Neuron quota resets
function nextUtcMidnightIso() {
  const d = new Date(Date.now())
  d.setUTCHours(0, 0, 0, 0)
  return new Date(d.getTime() + 86400000).toISOString()
}

// Normalize `standard` field to a canonical label.
// Accepts key (gbt11/isoiec), canonical label, or case-insensitive variants.
// Unknown → default GB/T 1.1-2020 (product's primary standard) + flag in response.
function resolveStandard(raw) {
  if (!raw) return { label: 'GB/T 1.1-2020', key: 'gbt11', defaulted: true };
  const s = String(raw).trim().toLowerCase();
  if (s === 'gbt11' || s.includes('gb/t')) {
    return { label: 'GB/T 1.1-2020', key: 'gbt11', defaulted: false };
  }
  if (s === 'isoiec' || s.includes('iso/iec') || s.includes('iso iec')) {
    return { label: 'ISO/IEC Directives Part 2', key: 'isoiec', defaulted: false };
  }
  return { label: 'GB/T 1.1-2020', key: 'gbt11', defaulted: true, unknown_input: raw };
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) {
    return Response.json({ error: "AI binding not available — enable in CF Pages settings" }, { status: 503 });
  }

  // Handle probe request
  const url = new URL(request.url);
  if (url.searchParams.get('probe') === '1') {
    const results = {};
    for (const model of MODEL_PRIORITY) {
      try {
        const r = await env.AI.run(model, {
          messages: [{ role: "user", content: "Reply only: OK" }],
          max_tokens: 8,
        });
        results[model] = { ok: true, text: getResponseText(r).slice(0, 40) };
        break; // stop at first success
      } catch (err) {
        results[model] = { ok: false, error: err.message };
      }
    }
    return Response.json({ probe: results });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { standard, clauses } = body;
  if (!Array.isArray(clauses) || clauses.length === 0) {
    return Response.json({ error: "clauses must be a non-empty array" }, { status: 400 });
  }

  // Find first working model; classify any failure so quota/rate errors surface correctly
  let activeModel = null;
  let selectionError = null;
  for (const model of MODEL_PRIORITY) {
    try {
      await env.AI.run(model, { messages: [{ role: "user", content: "Reply: OK" }], max_tokens: 8 });
      activeModel = model;
      break;
    } catch (err) {
      const ec = classifyAiError(err);
      if (ec !== 'ai_error') {
        // quota/rate-limit affects every model equally — no point trying the rest
        selectionError = { code: ec, message: err.message };
        break;
      }
      // generic failure — try next model in cascade
    }
  }

  if (!activeModel) {
    const code = selectionError?.code || 'ai_error';
    const errBody = { error: code };
    if (selectionError?.message) errBody.detail = selectionError.message;
    if (code === 'quota_exceeded') errBody.reset_at = nextUtcMidnightIso();
    if (code === 'rate_limited')   errBody.retry_after_seconds = 60;
    return Response.json(errBody, { status: code === 'ai_error' ? 503 : 429 });
  }

  const stdResolved = resolveStandard(standard);
  const stdLabel = stdResolved.label;
  const toReview = clauses.slice(0, 10); // guard against timeout

  const reviews = [];
  for (const clause of toReview) {
    const clauseBody = (clause.body || '').slice(0, 1500);
    if (!clauseBody.trim()) {
      reviews.push({ clause_id: clause.clause_id, title: clause.title, issues: [] });
      continue;
    }

    const systemMsg = `You are a technical editor for ${stdLabel}. Review the clause for drafting rule violations. Respond with ONLY valid JSON — no prose, no markdown fences, no <think> blocks in the final answer.`;

    const modalVerbRule = stdLabel.includes('GB/T')
      ? '应(shall) for requirements, 宜(should) for recommendations, 可(may) for permissions, 能(can) for capability. Flag misuse, omission, or use of ISO modal terms (shall/should/may) in a GB/T clause.'
      : '"shall" for requirements, "should" for recommendations, "may" for permissions, "can" for capability. Flag misuse or missing modals.';

    const userMsg = `Clause ${clause.clause_id}: ${clause.title}

${clauseBody}

Identify violations of ${stdLabel} drafting rules. Check:
1. modal_verb — ${modalVerbRule}
2. ambiguous — vague terms without measurable criteria: English: "appropriate", "suitable", "several", "some", "large", "sufficient"; Chinese: "适当", "足够", "必要时", "良好", "尽量".
3. first_person — avoid "we", "I", "our", "我们".
4. normative — informative content (examples, explanations) embedded in normative clauses without NOTE/EXAMPLE prefix.
5. terminology — defined terms used inconsistently or undefined technical terms.
6. terms_unused — terms defined in the clause but not actually used in the body (defined-but-unused).
7. verification — technical requirements lacking a test method, inspection method, or measurable acceptance criterion.
8. numbering — clause/sub-clause numbering or title inconsistent; obviously skipped sibling numbers.
9. annex — annex type (normative/informative) or cross-reference to annex inconsistent.

Return JSON exactly like this (no other text):
{"issues":[{"rule":"modal_verb","problem":"exact quote: explanation","severity":"高","suggestion":"how to fix"}]}

If no issues: {"issues":[]}`;

    try {
      const result = await env.AI.run(activeModel, {
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: userMsg },
        ],
        max_tokens: 1200,
      });
      const text = getResponseText(result);
      const parsed = extractJson(text);
      const issues = parsed && Array.isArray(parsed.issues) ? parsed.issues : [];
      reviews.push({ clause_id: clause.clause_id, title: clause.title, issues });
    } catch (err) {
      const ec = classifyAiError(err);
      reviews.push({ clause_id: clause.clause_id, title: clause.title, issues: [], error_code: ec });
      if (ec !== 'ai_error') {
        // quota/rate will affect every subsequent clause — return partial results now
        const meta = { model: activeModel, standard: stdLabel, error: ec, partial: true, reviews };
        if (stdResolved.defaulted) meta.standard_normalized = true;
        if (stdResolved.unknown_input) meta.standard_unknown_input = stdResolved.unknown_input;
        if (ec === 'quota_exceeded') meta.reset_at = nextUtcMidnightIso();
        if (ec === 'rate_limited')   meta.retry_after_seconds = 60;
        return Response.json(meta);
      }
    }
  }

  const meta = { model: activeModel, standard: stdLabel };
  if (stdResolved.defaulted) meta.standard_normalized = true;
  if (stdResolved.unknown_input) meta.standard_unknown_input = stdResolved.unknown_input;
  return Response.json({ ...meta, reviews });
}

// Reject non-POST
export async function onRequest({ request }) {
  if (request.method === 'POST') return onRequestPost({ request, env: {} });
  return Response.json({ error: "POST only" }, { status: 405 });
}
