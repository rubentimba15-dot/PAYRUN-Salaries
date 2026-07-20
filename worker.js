// ============================================================================
// PAYRUN — Worker principal (autenticação + proxy IA + ficheiros estáticos)
// ============================================================================
const COOKIE_NAME = 'payrun_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/logout') {
      const headers = new Headers({ 'Location': '/' });
      headers.append('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
      return new Response(null, { status: 302, headers });
    }

    if (request.method === 'POST' && url.pathname === '/login') {
      let username = '', password = '';
      try {
        const form = await request.formData();
        username = (form.get('username') || '').toString();
        password = (form.get('password') || '').toString();
      } catch (e) {
        return htmlResponse(loginPage(true), 400);
      }

      const userOk = timingSafeEqualStr(username, env.PAYRUN_USER || '');
      const passOk = timingSafeEqualStr(password, env.PAYRUN_PASS || '');

      if (userOk && passOk && env.PAYRUN_USER && env.PAYRUN_PASS) {
        const token = await createSessionToken(env.SESSION_SECRET);
        const headers = new Headers({ 'Location': '/' });
        headers.append(
          'Set-Cookie',
          `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}`
        );
        return new Response(null, { status: 302, headers });
      }
      return htmlResponse(loginPage(true), 401);
    }

    const cookieHeader = request.headers.get('Cookie') || '';
    const token = readCookie(cookieHeader, COOKIE_NAME);
    const valid = await isValidSession(token, env.SESSION_SECRET);

    if (!valid) {
      return htmlResponse(loginPage(false), 200);
    }

    if (request.method === 'POST' && url.pathname === '/api/ai') {
      return handleAI(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleAI(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Pedido inválido.' }, 400);
  }

  const texto = (body.texto || '').toString().trim().slice(0, 4000);
  if (!texto) return jsonResponse({ error: 'Mensagem vazia.' }, 400);

  const numFuncionarios = Number(body.numFuncionarios) || 0;
  const empresa = (body.empresa || '—').toString().slice(0, 200);
  const salMin = Number(body.salMin) || 0;

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'A chave da API não está configurada no servidor (ANTHROPIC_API_KEY em falta).' }, 500);
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
      return jsonResponse({ error: `A API da Anthropic devolveu um erro (${resp.status}).`, detail: errText.slice(0, 300) }, 502);
    }

    const data = await resp.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    return jsonResponse({ resposta: textBlock ? textBlock.text : 'Sem resposta de texto.' });
  } catch (e) {
    return jsonResponse({ error: 'Falha ao contactar a API da Anthropic.' }, 500);
  }
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function createSessionToken(secret) {
  const exp = Date.now() + SESSION_DURATION_MS;
  const sig = await hmacHex(secret || '', String(exp));
  return `${exp}.${sig}`;
}

async function isValidSession(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = Number(expStr);
  if (!exp || Number.isNaN(exp) || exp < Date.now()) return false;
  const expected = await hmacHex(secret, expStr);
  return timingSafeEqualStr(expected, sig);
}

function readCookie(cookieHeader, name) {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function htmlResponse(body, status) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

function loginPage(erro) {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PAYRUN — Entrar</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:linear-gradient(160deg,#0F2B2B 0%,#123333 100%);min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{background:#173D3D;border:1px solid #2E6363;border-radius:10px;padding:2.2rem 2.4rem;width:320px;box-shadow:0 10px 40px rgba(0,0,0,.35)}
.logo{font-family:'IBM Plex Mono',monospace;font-size:1.3rem;font-weight:700;letter-spacing:.06em;text-align:center;color:#fff}
.logo span{color:#009999}
.sub{font-size:.68rem;color:#7FADA5;text-align:center;margin-top:.3rem}
label{font-size:.67rem;font-weight:600;color:#8A9BBC;letter-spacing:.03em;display:block;margin:1rem 0 .3rem}
input{background:#173D3D;border:1px solid #2E6363;border-radius:4px;padding:.55rem .78rem;color:#fff;font-size:.85rem;width:100%;font-family:'Inter',sans-serif}
input:focus{outline:none;border-color:#009999}
button{width:100%;margin-top:1.1rem;padding:.62rem;border:none;border-radius:4px;background:#006666;color:#fff;font-size:.82rem;font-weight:600;cursor:pointer}
button:hover{background:#009999}
.err{font-size:.72rem;color:#EF4444;text-align:center;margin-top:.7rem}
</style>
</head>
<body>
  <form class="box" method="POST" action="/login">
    <div class="logo">PAY<span>RUN</span></div>
    <div class="sub">Gestão Salarial e RH · Moçambique</div>
    <label for="username">Utilizador</label>
    <input id="username" name="username" type="text" autocomplete="username" required autofocus>
    <label for="password">Palavra-passe</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    ${erro ? '<div class="err">Utilizador ou palavra-passe incorrectos.</div>' : ''}
    <button type="submit">Entrar</button>
  </form>
</body>
</html>`;
}
