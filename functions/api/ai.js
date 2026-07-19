// ============================================================================
// PAYRUN — Proxy do assistente "A La Ruben" (Cloudflare Pages Function)
// ============================================================================
// Esta rota fica automaticamente protegida pelo _middleware.js (só responde
// a quem já tiver sessão válida). A chave da API da Anthropic vive só aqui,
// como variável secreta — nunca chega ao browser.
//
// Configuração necessária no painel da Cloudflare Pages
// (Settings → Environment variables → adicionar como "Secret"):
//   ANTHROPIC_API_KEY -> a tua chave da API (começa por "sk-ant-")
// ============================================================================

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Pedido inválido.' }, 400);
  }

  const texto = (body.texto || '').toString().trim().slice(0, 4000);
  if (!texto) return json({ error: 'Mensagem vazia.' }, 400);

  const numFuncionarios = Number(body.numFuncionarios) || 0;
  const empresa = (body.empresa || '—').toString().slice(0, 200);
  const salMin = Number(body.salMin) || 0;

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'A chave da API não está configurada no servidor (ANTHROPIC_API_KEY em falta).' }, 500);
  }

  const systemPrompt = `Você é "A La Ruben", assistente especializado em RH e payroll para Moçambique.
Responde sempre em Português de Portugal (não Brasil).
Especialidades: IRPS (Lei 11/2025), INSS (Lei 7/2023), Lei do Trabalho 13/2023, processamento salarial, rescisões, férias, faltas.
Contexto actual do sistema PAYRUN:
- Funcionários registados: ${numFuncionarios}
- Empresa: ${empresa}
- Salário mínimo do sector: MZN ${salMin}
Responde de forma concisa, prática e orientada para Moçambique.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: texto }]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: `A API da Anthropic devolveu um erro (${resp.status}).`, detail: errText.slice(0, 300) }, 502);
    }

    const data = await resp.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    return json({ resposta: textBlock ? textBlock.text : 'Sem resposta de texto.' });
  } catch (e) {
    return json({ error: 'Falha ao contactar a API da Anthropic.' }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
