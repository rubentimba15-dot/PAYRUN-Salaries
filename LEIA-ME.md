# PAYRUN — Autenticação real via Cloudflare Pages

## O que muda em relação ao GitHub Pages

Deixas de publicar em `user.github.io` e passas a publicar em `algumacoisa.pages.dev`
(grátis, atribuído automaticamente pela Cloudflare). Não precisas de comprar
domínio nenhum — o `.pages.dev` já corre na rede da Cloudflare, por isso o
middleware de autenticação funciona de imediato.

A password e a chave de sessão **nunca estão no HTML**. Vivem só como variáveis
de ambiente no painel da Cloudflare, e o cookie de sessão é `HttpOnly` (o
JavaScript do browser não consegue lê-lo nem alguém pode copiá-lo a ver o
código-fonte da página).

## Estrutura de ficheiros (a enviar para o teu repositório GitHub)

```
/index.html              ← a app PAYRUN (igual à que já tinhas, com a nova paleta)
/functions/_middleware.js ← a verificação de login, corre antes de tudo
```

Podes usar o mesmo repositório que já tens — basta adicionar a pasta `functions/`.

## Passos de configuração

1. **Criar o projecto na Cloudflare Pages**
   - Painel Cloudflare → *Workers & Pages* → *Create* → *Pages* → *Connect to Git*
   - Escolhe o repositório do PAYRUN
   - Framework preset: **None**
   - Build command: (deixar vazio)
   - Build output directory: `/`
   - *Save and Deploy*

2. **Configurar as variáveis secretas**
   - No projecto → *Settings* → *Environment variables*
   - Adicionar (marcar como **Secret**, não "Plaintext"), para Production e Preview:
     - `PAYRUN_USER` → o utilizador que quiseres (ex: `Payrun`)
     - `PAYRUN_PASS` → **uma password nova e forte** (não reutilizar a `1309` que
       tinhas pensado — essa já apareceu nesta conversa, considera-a queimada)
     - `SESSION_SECRET` → uma string aleatória longa (32+ caracteres). Podes gerar uma com:
       ```
       openssl rand -hex 32
       ```
     - `ANTHROPIC_API_KEY` → a tua chave da API da Anthropic (começa por `sk-ant-`),
       para o assistente "A La Ruben" funcionar. Sem esta variável o botão
       continua a aparecer mas devolve um erro claro em vez de falhar em silêncio.
   - Depois de adicionar as variáveis, faz um novo *Deploy* (ou "Retry deployment")
     para elas ficarem activas.

3. **Testar**
   - Abre o URL `*.pages.dev` do projecto → deve aparecer o formulário de login
   - Entra com o utilizador/password que definiste
   - `/logout` termina a sessão

4. **(Opcional) Domínio próprio**
   - Se mais tarde quiseres `payrun.oteudominio.co.mz` em vez de `.pages.dev`,
     basta adicionares o domínio em *Custom domains* dentro do mesmo projecto —
     não precisas de nenhuma alteração ao código.

## O que NÃO resolve (para seres honesto contigo sobre limites)

- **Sessão de 8 horas por cookie** — depois disso, pede login outra vez. Ajustável
  em `SESSION_DURATION_MS` no `_middleware.js`.
- **Um único par utilizador/password para todos** — não há utilizadores
  individuais nem registo de quem entrou. Se precisares disso (ex: cada RH
  com o seu login, ou auditoria de acessos), é um passo seguinte razoável
  mas maior (precisa de uma base de dados de utilizadores — a Cloudflare tem
  o D1, que é gratuito até um certo volume).
- **Os dados dos funcionários continuam só no browser** (localStorage/memória
  do separador). A autenticação impede que alguém sem password abra a app —
  mas não substitui teres os dados num sítio persistente e partilhado entre
  computadores. Se quiseres isso a sério, é outro projecto (ex: Cloudflare D1
  ou KV para guardar os dados do lado do servidor).
- **O botão "A La Ruben"** já foi corrigido — deixou de chamar `api.anthropic.com`
  directamente do browser (o que nunca deveria ter funcionado, por falta de
  chave e por CORS) e passa agora por `/functions/api/ai.js`, protegido pelo
  mesmo login e com a chave da Anthropic guardada só no servidor.
