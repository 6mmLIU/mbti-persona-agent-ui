/* LLM layer: real provider calls + deterministic demo fallback.
   Supported providers:
   - OpenAI / OpenAI-compatible chat completions
   - Anthropic Messages API
   - Gemini generateContent
   - OpenRouter and DeepSeek through OpenAI-compatible requests */

window.LLM = (function () {
  const hasBridge = !!(window.claude && typeof window.claude.complete === 'function');
  let proxyProbe = null;

  const PROVIDERS = [
    {
      id: 'openai',
      name: 'OpenAI',
      kind: 'openai',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      hint: 'Chat Completions / OpenAI 官方',
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      kind: 'anthropic',
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-sonnet-4-20250514',
      apiVersion: '2023-06-01',
      hint: 'Messages API / Claude',
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      kind: 'gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
      model: 'gemini-3.5-flash',
      hint: 'generateContent / Google AI',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      kind: 'openai',
      endpoint: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-v4-pro',
      hint: 'DeepSeek-V4-Pro / 最强推理',
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      kind: 'openai',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'openai/gpt-4o-mini',
      hint: 'OpenAI-compatible / 多模型路由',
    },
    {
      id: 'custom',
      name: '自定义兼容接口',
      kind: 'openai',
      endpoint: '',
      model: '',
      hint: '适合通义、Kimi、硅基流动、Ollama 代理等 OpenAI 兼容地址',
    },
  ];

  function providerOf(config) {
    return PROVIDERS.find(p => p.id === (config && config.provider)) || PROVIDERS[0];
  }

  function effectiveConfig(config) {
    const p = providerOf(config);
    const model = ((config && config.model) || p.model || '').trim();
    const oldDeepSeekModels = new Set([
      'deepseek-chat',
      'deepseek-v4-flash',
      'deepseek-v4-flash-chat',
      'deepseek-v4-flash-reasoner',
    ]);
    return {
      enabled: !!(config && config.enabled),
      provider: p.id,
      kind: p.kind,
      apiKey: ((config && config.apiKey) || '').trim(),
      endpoint: ((config && config.endpoint) || p.endpoint || '').trim(),
      model: p.id === 'deepseek' && oldDeepSeekModels.has(model) ? 'deepseek-v4-pro' : model,
      apiVersion: ((config && config.apiVersion) || p.apiVersion || '2023-06-01').trim(),
      temperature: Number((config && config.temperature) || 0.7),
      maxTokens: Number((config && config.maxTokens) || 1100),
      jsonMode: !config || config.jsonMode !== false,
    };
  }

  function isConfigured(config) {
    const c = effectiveConfig(config);
    if (!c.enabled) return false;
    if (!c.model) return false;
    if (c.kind !== 'gemini' && !c.endpoint) return false;
    return !!c.apiKey;
  }

  function describeConfig(config) {
    const c = effectiveConfig(config);
    if (!isConfigured(config)) return hasBridge ? 'Claude 桥接' : '离线示例';
    return `${providerOf(c).name} · ${c.model}`;
  }

  function presetBlock(preset) {
    if (!preset) return '';
    const lines = [];
    if (preset.bg)     lines.push(`【提问者背景】${preset.bg}`);
    if (preset.domain) lines.push(`【场景/领域】${preset.domain}`);
    if (preset.style)  lines.push(`【期望产出风格】${preset.style}`);
    return lines.length ? '提问者补充设定：\n' + lines.join('\n') + '\n\n' : '';
  }

  function personaProfileBlock(persona) {
    const rows = [
      ['说话语气', persona.voice],
      ['决策偏好', persona.decision],
      ['常见盲点', persona.blindSpot],
      ['反对什么', persona.against],
      ['输出风格示例', persona.styleExample],
    ].filter(row => row[1]);
    if (!rows.length) return '';
    return '这个人格的独立表达设定：\n' + rows.map(row => `- ${row[0]}：${row[1]}`).join('\n') + '\n\n';
  }

  function summaryText(summary) {
    if (!summary) return '';
    if (typeof summary === 'string') return summary;
    return [summary.headline, summary.overview].filter(Boolean).join(' ');
  }

  function conversationBlock(rounds, persona) {
    if (!Array.isArray(rounds) || !rounds.length) return '';
    const visible = rounds.slice(-3);
    const parts = visible.map((round, idx) => {
      const own = round.results && round.results[persona.code] ? round.results[persona.code] : null;
      const ownText = own ? (own.conclusion || own.thinking || '').slice(0, 180) : '';
      const sum = summaryText(round.summary).slice(0, 220);
      return [
        `第 ${round.index || idx + 1} 轮问题：${round.question}`,
        sum ? `该轮总结：${sum}` : '',
        ownText ? `你上一轮的观点：${ownText}` : '',
      ].filter(Boolean).join('\n');
    });
    return `此前对话上下文（本轮必须延续前文，避免重复上一轮已经说过的内容）：\n${parts.join('\n\n')}\n\n`;
  }

  function researchDigest(research, maxItems = 8) {
    const items = research && Array.isArray(research.items) ? research.items : [];
    if (!items.length) return '';
    return items.slice(0, maxItems).map((item, i) => {
      const meta = [
        item.subreddit ? `r/${item.subreddit}` : '',
        item.author ? `u/${item.author}` : '',
        item.score != null ? `${item.score} 分` : '',
        item.comments != null ? `${item.comments} 评论` : '',
      ].filter(Boolean).join(' · ');
      return [
        `${i + 1}. ${item.title}`,
        meta ? `来源：${meta}` : '',
        item.excerpt ? `摘录：${String(item.excerpt).slice(0, 280)}` : '',
        item.url ? `链接：${item.url}` : '',
      ].filter(Boolean).join('\n');
    }).join('\n\n');
  }

  function researchBlock(research) {
    const digest = researchDigest(research, 8);
    if (!digest) return '';
    const source = research.source ? `（${research.source}）` : '';
    return `真实 Reddit 调研素材${source}：
检索词：${research.query || '未记录'}
覆盖社区：${Array.isArray(research.subreddits) ? research.subreddits.map(s => `r/${s}`).join(' / ') : 'Reddit'}

${digest}

使用要求：
- 你必须把这些 Reddit 帖子当作真实用户需求和真实点子的证据来源，而不是装饰。
- 可以引用帖子标题或社区，但不要捏造帖子里没有的信息。
- 结论必须说明：你从这些真实数据里看到了什么需求/痛点/机会，以及你会怎样进一步取舍。
- 点子要尽量从 Reddit 真实帖子里的问题、请求、实验和反馈中提炼。

`;
  }

  function buildPrompt(persona, question, preset, rounds, research) {
    return `你是 MBTI 人格「${persona.code} · ${persona.name}」。你的思维特征：${persona.lens}
请严格代入这种人格的思维方式来回应，不要中立、不要面面俱到，要有鲜明的角度与个性。

${personaProfileBlock(persona)}${presetBlock(preset)}${conversationBlock(rounds, persona)}${researchBlock(research)}用户的问题 / 议题：
「${question}」

请只输出一个 JSON 对象，不要任何额外文字、不要 Markdown 代码块，键如下：
{
  "signature": "一句话的口头禅/思维口号（≤16字，第一人称，体现该人格语气）",
  "thinking": "你切入这个问题的思维方式与角度（1-2句，≤60字）",
  "conclusion": "你的最终结论（120-220字，第一人称，像真实的人在说话；必须说明为什么这样判断、如何取舍、下一步先做什么；语气要明显符合该人格，不要复述点子）",
  "ideas": ["具体点子或建议1（≤40字）", "点子2", "点子3"],
  "tags": ["关注点标签1", "标签2", "标签3"]
}
这是一个严格的 json 输出任务：最终回答必须能被 JSON.parse 直接解析。
conclusion 是最重要的部分，要让人感觉 16 个人格都在用自己的性格认真发言，而不是同一个模型换标签。
ideas 给 2-3 条，必须具体可执行、带有该人格鲜明视角。tags 为 2-4 个简短关键词。全部用中文。`;
  }

  function buildMessages(persona, question, preset, rounds, research) {
    return [{ role: 'user', content: buildPrompt(persona, question, preset, rounds, research) }];
  }

  function extractJSON(text) {
    if (!text) return null;
    let t = String(text).trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    let raw = t.slice(s, e + 1);
    const parse = v => {
      const obj = JSON.parse(v);
      return typeof obj === 'string' && obj.trim().startsWith('{')
        ? JSON.parse(obj)
        : obj;
    };
    try { return parse(raw); }
    catch (_) {
      try { return parse(raw.replace(/,\s*([}\]])/g, '$1')); }
      catch (__) {
        try {
          const repaired = raw
            .replace(/,\s*([}\]])/g, '$1')
            .replace(/[\r\n]+(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '');
          return parse(repaired);
        } catch (___) { return null; }
      }
    }
  }

  function textFallbackObject(text, persona, question) {
    const cleaned = String(text || '')
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/,'')
      .replace(/^\s*(结论|回答|最终结论)\s*[:：]/, '')
      .trim();
    if (!cleaned) return null;
    const canned = cannedAnswer(persona, question);
    return {
      signature: persona.sig,
      thinking: persona.essence,
      conclusion: cleaned.slice(0, 520),
      ideas: canned.ideas,
      tags: persona.tags,
    };
  }

  function normalize(obj, persona) {
    const arr = v => Array.isArray(v) ? v.filter(Boolean).map(String) : (v ? [String(v)] : []);
    return {
      signature: (obj && obj.signature ? String(obj.signature) : persona.sig).slice(0, 40),
      thinking:  obj && obj.thinking ? String(obj.thinking) : persona.essence,
      conclusion: obj && obj.conclusion ? String(obj.conclusion) : fallbackConclusion(persona),
      ideas:     (obj && obj.ideas ? arr(obj.ideas) : []).slice(0, 4),
      tags:      (obj && obj.tags && arr(obj.tags).length ? arr(obj.tags) : persona.tags).slice(0, 4),
    };
  }

  async function parseResponse(resp) {
    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!resp.ok) {
      const msg = data && data.error
        ? (data.error.message || data.error.type || JSON.stringify(data.error))
        : (text || `${resp.status} ${resp.statusText}`);
      const err = new Error(msg);
      err.status = resp.status;
      throw err;
    }
    return data;
  }

  function shouldRetryError(err) {
    const status = err && Number(err.status);
    return !status || status === 408 || status === 429 || status >= 500;
  }

  function shouldRetryWithoutJsonMode(err) {
    const status = err && Number(err.status);
    const msg = String((err && err.message) || '').toLowerCase();
    return (status === 400 || status === 422) &&
      (msg.includes('response_format') || msg.includes('json') || msg.includes('schema'));
  }

  async function hasLocalProxy() {
    if (window.location.protocol === 'file:') return false;
    if (!/^https?:$/.test(window.location.protocol)) return false;
    if (!proxyProbe) {
      proxyProbe = fetch('/api/llm-proxy/health', { cache: 'no-store' })
        .then(resp => resp.ok && resp.headers.get('x-mbti-proxy') === '1')
        .catch(() => false);
    }
    return proxyProbe;
  }

  async function modelFetch(url, init) {
    if (await hasLocalProxy()) {
      return fetch('/api/llm-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method: init && init.method ? init.method : 'POST',
          headers: init && init.headers ? init.headers : {},
          body: init && init.body ? init.body : null,
        }),
      });
    }
    return fetch(url, init);
  }

  function chatEndpoint(endpoint) {
    const e = String(endpoint || '').replace(/\/+$/, '');
    if (!e) return e;
    if (/\/chat\/completions$/i.test(e)) return e;
    if (/\/v1$/i.test(e) || /\/api\/v1$/i.test(e)) return e + '/chat/completions';
    return e + '/chat/completions';
  }

  async function requestOpenAICompatible(persona, question, preset, cfg, rounds, research, withJsonMode = true) {
    const body = {
      model: cfg.model,
      messages: buildMessages(persona, question, preset, rounds, research),
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      stream: false,
    };
    if (withJsonMode && cfg.jsonMode) body.response_format = { type: 'json_object' };
    if (cfg.provider === 'deepseek') {
      body.thinking = { type: 'disabled' };
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    };
    if (cfg.provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'MBTI Persona Matrix';
    }

    try {
      const data = await parseResponse(await modelFetch(chatEndpoint(cfg.endpoint), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }));
      return data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '';
    } catch (err) {
      if (withJsonMode && cfg.jsonMode && shouldRetryWithoutJsonMode(err)) {
        return requestOpenAICompatible(persona, question, preset, cfg, rounds, research, false);
      }
      throw err;
    }
  }

  async function requestAnthropic(persona, question, preset, cfg, rounds, research) {
    const data = await parseResponse(await modelFetch(cfg.endpoint || 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': cfg.apiVersion || '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
        messages: buildMessages(persona, question, preset, rounds, research),
      }),
    }));
    return data && Array.isArray(data.content)
      ? data.content.map(part => part && part.text ? part.text : '').join('')
      : '';
  }

  async function requestGemini(persona, question, preset, cfg, rounds, research, withJsonMode = true) {
    const url = (cfg.endpoint || 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent')
      .replace('{model}', encodeURIComponent(cfg.model));
    const body = {
      contents: [{ role: 'user', parts: [{ text: buildPrompt(persona, question, preset, rounds, research) }] }],
      generationConfig: {
        temperature: cfg.temperature,
        maxOutputTokens: cfg.maxTokens,
      },
    };
    if (withJsonMode && cfg.jsonMode) body.generationConfig.responseMimeType = 'application/json';

    try {
      const data = await parseResponse(await modelFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cfg.apiKey,
        },
        body: JSON.stringify(body),
      }));
      const parts = data && data.candidates && data.candidates[0] &&
        data.candidates[0].content && data.candidates[0].content.parts;
      return Array.isArray(parts) ? parts.map(part => part.text || '').join('') : '';
    } catch (err) {
      if (withJsonMode && cfg.jsonMode && shouldRetryWithoutJsonMode(err)) {
        return requestGemini(persona, question, preset, cfg, rounds, research, false);
      }
      throw err;
    }
  }

  async function requestPromptText(prompt, cfg, withJsonMode = true) {
    if (cfg.kind === 'anthropic') {
      const data = await parseResponse(await modelFetch(cfg.endpoint || 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': cfg.apiVersion || '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: cfg.maxTokens,
          temperature: cfg.temperature,
          messages: [{ role: 'user', content: prompt }],
        }),
      }));
      return data && Array.isArray(data.content)
        ? data.content.map(part => part && part.text ? part.text : '').join('')
        : '';
    }

    if (cfg.kind === 'gemini') {
      const url = (cfg.endpoint || 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent')
        .replace('{model}', encodeURIComponent(cfg.model));
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: cfg.temperature,
          maxOutputTokens: cfg.maxTokens,
        },
      };
      if (withJsonMode && cfg.jsonMode) body.generationConfig.responseMimeType = 'application/json';
      try {
        const data = await parseResponse(await modelFetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cfg.apiKey,
          },
          body: JSON.stringify(body),
        }));
        const parts = data && data.candidates && data.candidates[0] &&
          data.candidates[0].content && data.candidates[0].content.parts;
        return Array.isArray(parts) ? parts.map(part => part.text || '').join('') : '';
      } catch (err) {
        if (withJsonMode && cfg.jsonMode && shouldRetryWithoutJsonMode(err)) {
          return requestPromptText(prompt, cfg, false);
        }
        throw err;
      }
    }

    const body = {
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      stream: false,
    };
    if (withJsonMode && cfg.jsonMode) body.response_format = { type: 'json_object' };
    if (cfg.provider === 'deepseek') body.thinking = { type: 'disabled' };
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    };
    if (cfg.provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'MBTI Persona Matrix';
    }
    try {
      const data = await parseResponse(await modelFetch(chatEndpoint(cfg.endpoint), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }));
      return data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '';
    } catch (err) {
      if (withJsonMode && cfg.jsonMode && shouldRetryWithoutJsonMode(err)) {
        return requestPromptText(prompt, cfg, false);
      }
      throw err;
    }
  }

  async function requestProvider(persona, question, preset, config, rounds, research) {
    const cfg = effectiveConfig(config);
    const text = cfg.kind === 'anthropic'
      ? await requestAnthropic(persona, question, preset, cfg, rounds, research)
      : cfg.kind === 'gemini'
        ? await requestGemini(persona, question, preset, cfg, rounds, research)
        : await requestOpenAICompatible(persona, question, preset, cfg, rounds, research);
    const parsed = extractJSON(text);
    const fallback = parsed || textFallbackObject(text, persona, question);
    if (!fallback) throw new Error('模型返回了空内容，请重试或调高最大输出长度');
    return normalize(fallback, persona);
  }

  async function requestBridge(persona, question, preset, rounds, research) {
    const text = await window.claude.complete({ messages: buildMessages(persona, question, preset, rounds, research) });
    const parsed = extractJSON(text);
    if (!parsed) throw new Error('Claude 桥接没有返回可解析的 JSON');
    return normalize(parsed, persona);
  }

  async function askPersona(persona, question, preset, modelConfig, rounds, research) {
    if (isConfigured(modelConfig)) {
      let lastErr = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { return await requestProvider(persona, question, preset, modelConfig, rounds, research); }
        catch (err) {
          lastErr = err;
          if (!shouldRetryError(err)) break;
          await new Promise(r => setTimeout(r, 350));
        }
      }
      throw lastErr || new Error('模型请求失败');
    }

    if (hasBridge) {
      try { return await requestBridge(persona, question, preset, rounds, research); }
      catch (_) {}
    }

    return cannedAnswer(persona, question, research);
  }

  async function askAll(personas, question, preset, modelConfig, onUpdate, concurrency = 6, rounds = [], research = null) {
    if (typeof modelConfig === 'function') {
      onUpdate = modelConfig;
      modelConfig = null;
    }
    let i = 0;
    async function worker() {
      while (i < personas.length) {
        const idx = i++;
        const p = personas[idx];
        try {
          const res = await askPersona(p, question, preset, modelConfig, rounds, research);
          onUpdate(p.code, { status: 'done', ...res });
        } catch (e) {
          onUpdate(p.code, { status: 'error', _error: e && e.message ? e.message : '请求失败', ...cannedAnswer(p, question, research) });
        }
      }
    }
    const pool = Array.from({ length: Math.min(concurrency, personas.length) }, worker);
    await Promise.all(pool);
  }

  function roundDigest(round) {
    const results = round && round.results ? round.results : {};
    return (window.PERSONAS || []).map(persona => {
      const r = results[persona.code] || {};
      const ideas = Array.isArray(r.ideas) ? r.ideas : [];
      return [
        `${persona.code} ${persona.name}`,
        `结论：${(r.conclusion || r.thinking || '').slice(0, 360)}`,
        ideas.length ? `点子：${ideas.slice(0, 3).join('；')}` : '',
      ].filter(Boolean).join('\n');
    }).join('\n\n');
  }

  function roundResearchDigest(round) {
    const research = round && round.research;
    const digest = researchDigest(research, 10);
    if (!digest) return '本轮没有启用外部调研数据。';
    return [
      `检索词：${research.query || round.question}`,
      `来源：${research.source || 'Reddit'}`,
      Array.isArray(research.subreddits) ? `社区：${research.subreddits.map(s => `r/${s}`).join(' / ')}` : '',
      digest,
    ].filter(Boolean).join('\n');
  }

  function buildSummaryPrompt(round, previousRounds) {
    const prev = Array.isArray(previousRounds) && previousRounds.length
      ? previousRounds.slice(-3).map((r, i) => {
        const sum = summaryText(r.summary);
        return `第 ${r.index || i + 1} 轮：${r.question}${sum ? `\n总结：${sum}` : ''}`;
      }).join('\n\n')
      : '无';
    return `你是一个严谨的主持人，正在整理一场 16 种 MBTI 人格的圆桌讨论。
请总结本轮 16 个人格各自的想法、经验、共识和冲突，并保留可继续追问的上下文。

此前对话：
${prev}

本轮问题：
「${round.question}」

本轮真实调研数据：
${roundResearchDigest(round)}

本轮 16 个人格输出：
${roundDigest(round)}

请只输出一个 JSON 对象，不要 Markdown，不要额外解释：
{
  "headline": "一句话总判断（≤32字）",
  "overview": "本轮综合总结（180-280字，说明主要共识、关键分歧和最值得保留的经验）",
  "agreements": ["主要共识1", "主要共识2", "主要共识3"],
  "tensions": ["关键分歧/张力1", "张力2"],
  "nextSteps": ["下一步建议1", "下一步建议2", "下一步建议3"],
  "personaNotes": [{"code":"INTJ","takeaway":"该人格的完整观点摘要（80-140字，必须是完整句子，不要截断）"}, {"code":"INTP","takeaway":"..."}]
}
personaNotes 必须覆盖 16 个代码，每个 takeaway 都要完整收句，不能以半句话结尾；全部用中文。`;
  }

  function normalizeSummary(obj, round) {
    const canned = cannedSummary(round);
    const arr = v => Array.isArray(v) ? v.filter(Boolean).map(String) : [];
    const parsedNotes = Array.isArray(obj && obj.personaNotes)
      ? obj.personaNotes.map(n => ({
        code: String(n && n.code ? n.code : '').toUpperCase(),
        takeaway: String(n && n.takeaway ? n.takeaway : '').trim(),
      })).filter(n => n.code && n.takeaway).slice(0, 16)
      : [];
    const noteMap = new Map(canned.personaNotes.map(n => [n.code, n.takeaway]));
    parsedNotes.forEach(n => noteMap.set(n.code, n.takeaway));
    const notes = (window.PERSONAS || []).map(p => ({
      code: p.code,
      takeaway: noteMap.get(p.code) || p.essence,
    }));
    return {
      headline: obj && obj.headline ? String(obj.headline) : canned.headline,
      overview: obj && obj.overview ? String(obj.overview) : canned.overview,
      agreements: arr(obj && obj.agreements).slice(0, 4).length ? arr(obj.agreements).slice(0, 4) : canned.agreements,
      tensions: arr(obj && obj.tensions).slice(0, 4).length ? arr(obj.tensions).slice(0, 4) : canned.tensions,
      nextSteps: arr(obj && obj.nextSteps).slice(0, 4).length ? arr(obj.nextSteps).slice(0, 4) : canned.nextSteps,
      personaNotes: notes,
    };
  }

  function textFallbackSummary(text, round) {
    const cleaned = String(text || '')
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/,'')
      .trim();
    if (!cleaned) return null;
    const canned = cannedSummary(round);
    if (cleaned.startsWith('{')) return canned;
    return { ...canned, overview: cleaned.slice(0, 700) };
  }

  async function summarizeRound(round, previousRounds, modelConfig) {
    if (isConfigured(modelConfig)) {
      const cfg = effectiveConfig(modelConfig);
      const summaryCfg = { ...cfg, maxTokens: Math.max(Number(cfg.maxTokens) || 0, 3200) };
      const text = await requestPromptText(buildSummaryPrompt(round, previousRounds), summaryCfg);
      const parsed = extractJSON(text);
      const fallback = parsed || textFallbackSummary(text, round);
      if (!fallback) throw new Error('模型没有返回可总结的内容');
      return normalizeSummary(fallback, round);
    }
    return cannedSummary(round);
  }

  async function testConfig(config) {
    const persona = window.PERSONAS && window.PERSONAS[0];
    if (!persona) throw new Error('缺少人格数据');
    return askPersona(persona, '确认 API 已连接，并用完整 JSON 给一个简短结论和测试点子。', null, { ...config, enabled: true });
  }

  function researchSignal(research) {
    const items = research && Array.isArray(research.items) ? research.items : [];
    if (!items.length) return '';
    const names = items.slice(0, 3).map(item => `「${item.title}」`).join('、');
    return `我会把 Reddit 里这些真实帖子 ${names} 当成需求证据，先从里面提炼重复出现的痛点，再决定哪些点子值得继续验证。`;
  }

  function fallbackConclusion(persona, question, research) {
    const q = (question || '这个议题').replace(/[「」]/g, '').trim();
    const data = researchSignal(research);
    const byCode = {
      INTJ: `我的结论是，「${q}」不能只展示热闹的 16 种回答，而要形成一套可反复扩展的思维系统。我会先定义核心使用路径：提问、对比、归纳、保存，再把每个人格的差异做成可观察的结构。先验证一个高价值场景，确认用户真的需要多视角决策，再继续扩展。`,
      INTP: `我会先把「${q}」的概念边界厘清：它到底是在做人格娱乐、创意发散，还是辅助决策？我的结论是，价值来自可比较的思维差异，而不是 16 段相似文本。下一步要设计可检验的输出结构，让每个人格都暴露自己的假设、推理链和盲点。`,
      ENTJ: `我的结论很直接，「${q}」要先服务一个明确目标，否则会变成好看的玩具。我会把目标定为帮用户更快得到可执行方案，然后让 16 个人格分别承担角色：战略、用户、执行、风险、传播。先做一个能产出行动清单的版本，再用真实问题压测效率。`,
      ENTP: `我的结论是，别把它做成普通问答页，普通问答太无聊了。我要让「${q}」像一场 16 人圆桌，每个人都能互相补刀、反驳、补充。下一步可以先做观点冲突和反向提案，让用户看到不同性格之间的张力，这才是这个产品最有意思的地方。`,
      INFJ: `我的结论是，「${q}」真正打动人的地方，不是 MBTI 标签，而是用户感觉自己的问题被 16 种不同内在声音认真理解。我会先把每个人格的动机、担忧和价值判断写清楚，再让结论指向更好的选择。下一步先做一组能产生共鸣的真实案例。`,
      INFP: `我的结论是，这个网站要避免把人格变成刻板模板。对我来说，「${q}」应该让用户看见不同价值观如何温柔地影响判断。下一步我会给每个人格加入更真诚的表达方式，让他们不只是给建议，而是在说自己为什么在乎、为什么会这样选择。`,
      ENFJ: `我的结论是，「${q}」最适合做成一个帮助人对齐共识的工具。16 个人格不只是分别发言，还应该帮助用户理解团队里不同人的顾虑和动力。我会先强化语气、角色关系和总结层，把分散的建议汇成能推动大家行动的共同方向。`,
      ENFP: `我的结论是，这个想法很有生命力，但要让它更像一群鲜活的人在冒火花。围绕「${q}」，我会加入更强的故事感、意外联想和情绪能量，让用户读完觉得灵感被点燃。下一步先做几个有趣场景，把 16 种声音的差异演出来。`,
      ISTJ: `我的结论是，「${q}」要先把基础流程做稳。用户输入什么、设定如何保存、模型如何调用、结果如何复用，都要清清楚楚。我会先建立可靠的输入模板和输出标准，保证每次生成都有结论、点子和可追踪记录。稳定之后，再谈更复杂的互动。`,
      ISFJ: `我的结论是，这个网站要让用户用起来安心。围绕「${q}」，我会先考虑用户是否知道 API Key 保存在哪里、失败时有没有提示、生成结果是否容易理解。下一步要把每个人格的语气做得更温和具体，让用户感觉是在被 16 位不同朋友认真陪着想。`,
      ESTJ: `我的结论很明确，「${q}」需要一套可执行的产品框架。先确定页面入口、API 设置、设定管理、生成结果、历史保存这五个模块，再给每个模块设交付标准。下一步我会优先补齐模型配置迁移和结果结构，确保用户测试时能稳定得到完整输出。`,
      ESFJ: `我的结论是，这个网站要照顾到不同用户的真实需求。有人想要点子，有人想要结论，有人想保存自己的设定。围绕「${q}」，我会让界面反馈更清楚、语言更亲切，并让 16 个人格都像在认真回应用户，而不是冷冰冰地生成条目。`,
      ISTP: `我的结论是，先别讨论太多抽象定位，围绕「${q}」做一个能马上试的闭环。输入问题、调用模型、渲染 16 张卡、保存有用点子，这条链路必须顺手。下一步我会优先修最影响体验的地方，比如模型名、结论字段和失败兜底。跑通了再打磨。`,
      ISFP: `我的结论是，这个网站的价值需要通过体验被感受到。围绕「${q}」，我会让每个人格的结论有不同的节奏、语气和质感，让用户愿意慢慢读。下一步先把卡片层次、结论区和微动效打磨好，让它不只是能用，也有让人停留的气质。`,
      ESTP: `我的结论是，别等完美，先让用户测起来。围绕「${q}」，我会把最强模型接上，把 16 个结论跑出来，看用户到底收藏什么、停在哪些卡片、觉得哪些人格最有用。下一步就是用真实问题快速试错，用反馈决定继续做对话、对比还是报告。`,
      ESFP: `我的结论是，这个网站要有现场感。围绕「${q}」，16 个人格应该像一桌人在热烈发言，有人冷静、有人温柔、有人直接、有人会玩。下一步我会强化结论区的表达和节奏，让用户一眼看到差异，也愿意把有趣的回答分享出去。`,
    };
    const byGroup = {
      NT: `我的结论是，先把「${q}」背后的关键假设拆出来验证，再决定是否扩大投入。`,
      NF: `我的结论是，「${q}」必须让人感到被理解，点子才会真正成立。`,
      SJ: `我的结论很清楚，「${q}」要先变成稳定可靠的流程。`,
      SP: `我的结论是，先把「${q}」做成一个能马上体验的小版本。`,
    };
    const base = byCode[persona.code] || byGroup[persona.group] || `我的结论是，围绕这个人格最看重的角度先做取舍，再把想法压缩成一个能马上验证的小行动。`;
    return data ? `${base} ${data}` : base;
  }

  function researchIdeas(research) {
    const items = research && Array.isArray(research.items) ? research.items : [];
    return items.slice(0, 3).map(item => {
      const title = String(item.title || '').replace(/\s+/g, ' ').trim();
      return title ? `围绕 Reddit 帖「${title.slice(0, 28)}」提炼一个可验证实验` : '';
    }).filter(Boolean);
  }

  function cannedAnswer(persona, question, research) {
    const q = (question || '这个议题').replace(/[「」]/g, '').trim();
    const seeds = {
      NT: [`为「${q}」建立一个可验证的核心假设，再设计最小实验`, `找出影响最大的那一个变量，集中资源攻它`, `画出未来三步的演化路径，倒推现在该做什么`],
      NF: [`先问「${q}」对人意味着什么，从动机出发`, `找到能打动人的那个真实故事`, `让方案忠于一个清晰的价值主张`],
      SJ: [`把「${q}」拆成清晰的步骤清单与责任人`, `先复用已被验证的成熟做法，降低风险`, `定义可交付物与时间表，确保稳妥落地`],
      SP: [`关于「${q}」，先做一个能马上试的小版本`, `抓住眼前最现成的机会快速上手`, `把体验中的关键一刻做到足够爽`],
    };
    const groundedIdeas = researchIdeas(research);
    return { signature: persona.sig, thinking: persona.essence,
             conclusion: fallbackConclusion(persona, question, research),
             ideas: groundedIdeas.length ? groundedIdeas : (seeds[persona.group] || []), tags: persona.tags };
  }

  function cannedSummary(round) {
    const results = round && round.results ? round.results : {};
    const done = Object.keys(results).filter(code => results[code] && results[code].status !== 'loading').length;
    const personaNotes = (window.PERSONAS || []).map(persona => {
      const r = results[persona.code] || {};
      return {
        code: persona.code,
        takeaway: (r.conclusion || r.thinking || persona.essence),
      };
    });
    return {
      headline: '多视角已经形成',
      overview: `本轮围绕「${round && round.question ? round.question : '这个议题'}」收集了 ${done || 16} 个人格视角。整体上，分析家偏向系统和假设验证，外交家强调意义与人的动机，守护者关注流程、责任和稳定落地，探险家更重视马上体验和快速反馈。下一轮可以追问：哪些观点最值得优先做，哪些风险需要先排除。`,
      agreements: ['先把问题转成可验证的小行动', '保留不同人格的取舍依据', '让结果能够被保存和继续追问'],
      tensions: ['长期系统设计与快速试错之间的取舍', '人的感受与执行效率之间的平衡'],
      nextSteps: ['挑出 2-3 个高价值观点做优先级排序', '继续追问具体执行路径', '把冲突观点转成风险清单'],
      personaNotes,
    };
  }

  return {
    providers: PROVIDERS,
    hasBridge,
    hasModel: hasBridge,
    isConfigured,
    describeConfig,
    effectiveConfig,
    testConfig,
    summarizeRound,
    askPersona,
    askAll,
    cannedAnswer,
  };
})();
window.LLM_PROVIDER_TEMPLATES = window.LLM.providers;
