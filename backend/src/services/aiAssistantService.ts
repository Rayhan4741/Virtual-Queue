import { Organization } from '../models/Organization.js';
import { Service } from '../models/Service.js';
import { Token } from '../models/Token.js';
import { getServiceEta } from './etaService.js';
import { env } from '../config/env.js';

export interface AssistantReply {
  reply: string;
  provider: 'rule-based-mock' | 'llm';
  disclaimer: string;
}

/**
 * Customer AI Assistant with strict guardrails:
 * - Never generates fake tokens, modifies queue order, or reveals other customers' data.
 * - Uses authoritative backend DB data for organization/service/user-token context.
 */
export async function handleAssistantQuery(userId: string | undefined, message: string): Promise<AssistantReply> {
  const q = message.toLowerCase().trim();

  // Fetch authoritative context for the current user's active tokens
  let activeTokenContext = 'You have no active tokens right now.';
  if (userId) {
    const activeTokens = await Token.find({
      userId,
      status: { $in: ['WAITING', 'CHECKED_IN', 'CALLED', 'SERVING'] },
    })
      .populate('organizationId', 'name')
      .populate('serviceId', 'name')
      .lean();

    if (activeTokens.length > 0) {
      const first = activeTokens[0];
      const eta = await getServiceEta(first.serviceId._id.toString(), first.queueOrderScore);
      const orgName = (first.organizationId as unknown as { name?: string })?.name || 'Organization';
      const svcName = (first.serviceId as unknown as { name?: string })?.name || 'Service';
      activeTokenContext = `Your active token is ${first.tokenNumber} at ${orgName} (${svcName}). Status: ${first.status}. People ahead: ${eta.peopleAhead}. Approximate wait: ~${eta.estimatedWaitMinutes} min.`;
    }
  }

  // If LLM provider is configured, call it with strict system prompt; otherwise use deterministic rule-based assistant
  if (env.AI_PROVIDER === 'openai' && env.AI_API_KEY) {
    try {
      const orgCount = await Organization.countDocuments({ status: 'ACTIVE' });
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 220,
          messages: [
            {
              role: 'system',
              content: `You are Virtual Queue's helpful assistant. Active organizations: ${orgCount}. User's current token info: ${activeTokenContext}. Rules: Never invent queue numbers, never promise exact wait times, never claim to book/cancel tokens directly—guide the user to use the app buttons.`,
            },
            { role: 'user', content: message.slice(0, 500) },
          ],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          return {
            reply: content,
            provider: 'llm',
            disclaimer: 'AI guidance is informational only; live queue status is authoritative.',
          };
        }
      }
    } catch {
      // Fallback to rule-based mock
    }
  } else if (env.AI_PROVIDER === 'gemini' && env.AI_API_KEY) {
    try {
      const orgCount = await Organization.countDocuments({ status: 'ACTIVE' });
      const systemPrompt = `You are Virtual Queue's helpful assistant. Active organizations: ${orgCount}. User's current token info: ${activeTokenContext}. Rules: Never invent queue numbers, never promise exact wait times, never claim to book/cancel tokens directly—guide the user to use the app buttons.`;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(env.AI_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: message.slice(0, 500) }] }],
            generationConfig: { maxOutputTokens: 250 },
          }),
          signal: AbortSignal.timeout(8000),
        }
      );
      if (res.ok) {
        const json = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          return {
            reply: content,
            provider: 'llm',
            disclaimer: 'Gemini AI guidance is informational only; live queue status is authoritative.',
          };
        }
      }
    } catch {
      // Fallback to rule-based mock
    }
  }

  // Rule-based mock assistant (clearly identified)
  let reply = '';
  if (q.includes('status') || q.includes('token') || q.includes('wait') || q.includes('position')) {
    reply = activeTokenContext;
  } else if (q.includes('late pass') || q.includes('no show') || q.includes('missed')) {
    reply =
      'If your token is marked NO_SHOW, you can use one Late Pass from your Active Token page to rejoin the queue 5 places back. Each token allows only one Late Pass.';
  } else if (q.includes('snooze') || q.includes('delay')) {
    reply =
      'You can snooze an active WAITING or CHECKED_IN token from your Active Token page to defer your turn by a few minutes (subject to the service maximum snooze limit).';
  } else if (q.includes('qr') || q.includes('check in') || q.includes('check-in')) {
    reply =
      'When you arrive at the venue, open your Active Token and tap "Scan Entrance QR" to verify your arrival and transition your token to CHECKED_IN.';
  } else if (q.includes('organization') || q.includes('service') || q.includes('book')) {
    const orgs = await Organization.find({ status: 'ACTIVE' }).limit(5).select('name type').lean();
    const svcCount = await Service.countDocuments({ isAvailable: true });
    const names = orgs.map((o) => `${o.name} (${o.type})`).join(', ');
    reply = `There are ${svcCount} available services across active organizations${names ? ` including: ${names}` : ''}. Go to Explore Organizations to book a remote token.`;
  } else {
    reply = `Hello! I can help with your active token status, QR check-in, Snooze, Late Pass rules, and finding organizations. ${activeTokenContext}`;
  }

  return {
    reply,
    provider: 'rule-based-mock',
    disclaimer: 'Rule-based assistant mode (no external LLM API key configured).',
  };
}
