// ============================================================================
// PAYRUN — Middleware de autenticação (Cloudflare Pages Functions)
// ============================================================================
// Corre ANTES de qualquer pedido ao site. Só deixa passar para o index.html
// (ou qualquer outro ficheiro) quem tiver um cookie de sessão válido, assinado
// com uma chave secreta que só existe no lado do servidor (variável de
// ambiente da Cloudflare — nunca no HTML, nunca no browser).
//
// Configuração necessária no painel da Cloudflare Pages
// (Settings → Environment variables → adicionar como "Secret"):
//   PAYRUN_USER      -> ex: Payrun
//   PAYRUN_PASS      -> a password real (escolhe uma nova e forte)
//   SESSION_SECRET   -> uma string aleatória longa (32+ caracteres),
//                       só serve para assinar os cookies de sessão
// ============================================================================

const COOKIE_NAME = 'payrun_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Pedido de logout
  if (url.pathname === '/logout') {
    const headers = new Headers({ 'Location': '/' });
    headers.append('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
    return new Response(null, { status: 302, headers });
  }

  // Submissão do formulário de login
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

  // Qualquer outro pedido — verificar sessão
  const cookieHeader = request.headers.get('Cookie') || '';
  const token = readCookie(cookieHeader, COOKIE_NAME);
  const valid = await isValidSession(token, env.SESSION_SECRET);

  if (valid) {
    return next();
  }

  return htmlResponse(loginPage(false), 200);
}

// ---------------------------------------------------------------------------
// Utilitários de sessão (HMAC-SHA256 com Web Crypto — nativo no Workers runtime)
// ---------------------------------------------------------------------------

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
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  });
}

// ---------------------------------------------------------------------------
// Página de login (paleta igual à da app — teal profissional)
// ---------------------------------------------------------------------------

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
