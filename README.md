# Cobalt Media Downloader (Firefox)

Extensão para Firefox que usa a **API atual do Cobalt** ([imputnet/cobalt](https://github.com/imputnet/cobalt), docs em `docs/api.md`):

- `POST {instância}/` com `Accept: application/json` + `Content-Type: application/json`
- Respostas `tunnel` / `redirect` → baixa via `downloads.download`
- `picker` → lista de itens para escolha (popup + `picker.html`)
- `local-processing` → lista de túneis
- `error` (incl. `api.auth.*`) → mensagem amigável
- `GET {instância}/` → teste de instância (versão + serviços)
- Suporte a `Authorization: Api-Key …` / `Bearer …` (instâncias protegidas)

## Por que uma nova extensão?

| Extensão existente | Situação (out/2026) |
|---|---|
| `dimdenGD/cobalt-extension` (AMO `cobalt-downloader` v1.0.7, nov/2024) | Usa endpoints antigos `GET /api/serverInfo` e `POST /api/json` (v7, desligado em 11/11/2024) + `api.cobalt.tools` com bot-protection. Parada desde 22/11/2024. **Quebrada.** |
| `kivirnz/cobalt-extension-fixed` (fork) | Mesmo código antigo, só troca default p/ `cobalt.meowing.de`; `getApiVersion(/api/serverInfo)` falha na API nova → cai no fallback de abrir `?u=` na web. Manifest MV3 com `service_worker` (incompatível com Firefox) e `host_permissions` fixo. Commits de 2025 só no README. **Não mantida funcionalmente.** |
| `Solyphonous/CobaltExtension` (AMO `cobaltextension` v1.12.0) | O próprio README avisa que a API principal caiu em 14/10/2024. Último commit 28/10/2024. **Abandonada.** |
| `quick cobalt`, `Cobalt Downloader for Rutube…`, `for YouTube` | Só abrem `cobalt.tools` com a URL — **não usam a API**. |

Ou seja: nenhuma extensão do Firefox usa corretamente a API atual (`POST /`, `status: tunnel|redirect|picker|error`, auth Api-Key/Bearer). Daí esta extensão.

## Instalação temporária (teste)

1. Abra `about:debugging#/runtime/this-firefox`
2. **Carregar extensão temporária** → selecione `manifest.json` desta pasta.
3. Abra as **Opções** e configure:
   - URL da instância (sua própria via [run-an-instance.md](https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md), ou uma comunitária de https://instances.cobalt.best com permissão do dono).
   - Api-Key, se a instância exigir.
4. Use o botão da barra, o menu de contexto (página/link/vídeo) ou o popup.

> A instância oficial `api.cobalt.tools` **não** é liberada para terceiros (bot-protection, exige permissão). Não a use como default.

## Instância local (recomendado — sobe com o Firefox, para ao fechar)

Arquitetura: extensão → host nativo (`native-host/cobalt_host.py`, via `nativeMessaging`)
→ container docker `cobalt-local` (imagem `ghcr.io/imputnet/cobalt:11`, só API na 9000,
bind em `127.0.0.1`, sem auth — localhost é confiável).

Ciclo de vida (zero custo com o Firefox fechado):
- abrir o Firefox → `ensure-up` (sobe e espera a API responder, até ~60s na 1ª vez);
- a cada download com URL local → garante de pé antes do `POST /`;
- heartbeat a cada 2 min enquanto aberto (só se a instância local foi usada na sessão);
- **fechar o Firefox → `stop` imediato** (`runtime.onSuspend`) + supervisor do host
  que para o container após ~6 min sem heartbeat (cobre crash, kill e suspensão).

Instalação (uma vez):
```bash
sudo systemctl start docker        # daemon precisa estar rodando (consome quase nada parado)
cd cobalt-firefox-extension/native-host && ./install-host.sh
```
O script registra o host nativo em `~/.mozilla/native-messaging-hosts/`,
baixa a imagem e cria o container (com `--restart no`: nunca sobe no boot, só via Firefox).
Depois, nas Opções da extensão: **Usar instância local** (preenche `http://localhost:9000`).

Atualizar a imagem: `docker pull ghcr.io/imputnet/cobalt:11` (com o container parado).
Logs: `docker logs cobalt-local`. A porta só escuta em `127.0.0.1` (não expõe na rede).

## Anti-bot e logins (o que foi feito e o limite de cada um)

A instância local agora sobe em stack: `cobalt-local` (API) + `cobalt-yt-session`
(gerador de poToken do YouTube, `YOUTUBE_SESSION_SERVER` já apontado). Custo parado:
~95 MB somados, 0% CPU — e tudo para junto com o Firefox.

| Serviço | Mecanismo | Estado aqui |
|---|---|---|
| YouTube | poToken automático | ❌ gerador bloqueado neste IP (BotGuard estoura timeout — mesmo bloqueio que esvazia os streams); saída: cookies (abaixo) |
| YouTube | `cookies.json` (sua sessão) | ⏳ configurado (`COOKIE_PATH` montado, `cookies loaded successfully!`), **falta você preencher** |
| Instagram / Reddit / Twitter-X / Vimeo | `cookies.json` | ⏳ mesmo esquema (ver `~/cobalt-local/cookies.example.json`) |
| TikTok | — | fora de escopo (botão direito já resolve p/ você) |
| VK / OK / Snapchat / Bilibili | — | sem mecanismo no Cobalt; seguem bloqueados |

Como preencher (5 min, só com suas contas): instale **Get cookies.txt LOCALLY** no
Firefox, exporte logado no serviço, e monte `~/cobalt-local/cookies.json` no formato
do `cookies.example.json` (só os cookies indicados por serviço; ex. YouTube: valores
de `cookie` e `b`). Permissão `600`. Depois: Opções → **Reiniciar instância**.
O status (gerador + serviços com cookies) aparece em Opções → Anti-bot. Privacidade:
cookies são sessão da sua conta — nunca saem da sua máquina (bind `127.0.0.1`).

## Compatibilidade por serviço (testado em 11/10/2026, instância local 11.7.1)

Matriz real de `POST /` (mesma chamada que a extensão faz) + UI do picker validada
com resposta verdadeira do Instagram (10 itens):

| Serviço | Resultado | Detalhe |
|---|---|---|
| YouTube | ⚠️ parcial | `tunnel` OK (metadados), mas o stream veio vazio deste IP — típico de bloqueio anti-bot; resolve com `cookies.json` na instância (ver abaixo) |
| Twitter/X | ✅ | `redirect` direto p/ `video.twimg.com` |
| TikTok | ❌ | `fetch.fail` ×3 (bloqueio anti-bot do TikTok) |
| Vimeo | ❌ | `fetch.fail` ×3, inclusive URL fresca (bloqueio) |
| Reddit | ❌ | `fetch.fail` (bloqueio/conteúdo removido) |
| SoundCloud | ✅ | `tunnel` MP3 válido (3,8 MB, com ID3) |
| Dailymotion | ✅ | `tunnel` 1080p |
| Facebook | ✅ | `redirect` p/ `fbcdn.net` (sem login!) |
| Instagram | ✅ | `picker` com 10 itens (carrossel) |
| Bluesky | ✅ | `tunnel` mp4 |
| Tumblr | ✅ | `redirect` p/ `va.media.tumblr.com` |
| Pinterest | ✅ | `redirect` p/ `pinimg` |
| Twitch (clips) | ✅ | `redirect` 1080p |
| Rutube | ✅ | `tunnel` 1080p |
| Loom | ✅ | `redirect` p/ `cdn.loom.com` (2ª URL; a 1ª estava morta) |
| Bilibili | ❌ | `fetch.empty` (página dá 403 daqui — geo/bloqueio) |
| VK / OK | ❌ | `fetch.critical` (exigem login/token) |
| Snapchat | ❌ | `fetch.fail` (login exigido) |
| Streamable | ❌ | IDs de teste deletados (`empty`) |
| Newgrounds | ❌ | `critical`/`empty` (login ou removido) |

Todos os serviços são reconhecidos (nenhum `service.unsupported`); os erros vêm
com código limpo que o popup traduz (v1.1.2+). Limite da instância: 40 req/60s —
rajadas paralelas dão `rate_exceeded`; a extensão usa 1 req por clique.

**YouTube pedindo cookies?** Crie `~/cobalt-local/cookies.json` no formato de
[examples/cookies.example.json](https://github.com/imputnet/cobalt/blob/main/docs/examples/cookies.example.json),
recreie o container com `-v ~/cobalt-local/cookies.json:/cookies.json -e COOKIE_PATH=/cookies.json`
e pronto (cookies da sua conta Google, exportados pelo navegador).

## Se o download travar no "iniciando"

Desde a v1.1.1 a extensão acompanha o download de verdade:
- **Popup**: mostra progresso (MB baixados/total), "Concluído" ou o motivo da falha
  (`NETWORK_FAILED`, `FILE_ACCESS_DENIED`…) com botões **Abrir link direto**,
  **Copiar link** e **Tentar de novo**. Confira também `about:downloads`.
- **Menu de contexto**: notifica conclusão; se falhar, a notificação abre o link direto.
- Nota: respostas `redirect` (ex.: Twitter → `video.twimg.com`) são links diretos do
  serviço — se o gerenciador travar, o link direto em nova aba quase sempre resolve.

## Qual URL de API usar?

- O **site** `https://cobalt.meowing.de` é só o frontend web (retorna HTML — causa erro de JSON).
- A **API** é `https://cobalt-api.meowing.de` (verificado: Cobalt 11.7.1, 22 serviços).
  Ela exige autenticação, e os caminhos que funcionam em extensões são **Api-Key**
  (pedido ao dono) ou **JWT manual** colado nas Opções (a extensão lê a validade do
  próprio token). O desafio Turnstile não roda dentro da extensão: a política da AMO
  proíbe código remoto e o Cloudflare só aceita o domínio do próprio site.
- Alternativas: sua própria instância ([guia](https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md))
  ou APIs comunitárias de https://instances.cobalt.best (com permissão do dono).

## Privacidade

A extensão envia a URL da mídia **somente** para a instância Cobalt que você configurar
(por isso o `manifest.json` declara `data_collection_permissions: ["websiteActivity"]`).
Api-Key e token de sessão ficam em `storage.sync` (sincronizado com sua conta Firefox
em texto — comportamento padrão de extensões; use perfil protegido por senha).
Nenhum dado é enviado a terceiros pelos autores da extensão. Deixe a instância em branco
para não transmitir nada.

Segurança (auditado): sem `eval`/`innerHTML` com dados externos (só `textContent`),
sem scripts inline (CSP estrita), URLs da API validadas para `http(s)` antes de
baixar/abrir (bloqueia `javascript:`/`data:` de instância maliciosa), host nativo
restrito a comandos docker fixos, sem `shell=True`.

## Empacotar p/ AMO

```bash
zip -r cobalt-media-downloader-1.0.0.zip manifest.json background.js popup.html popup.js popup.css options.html options.js picker.html icons/
```

Depois submeta em https://addons.mozilla.org/developers/ (canal listado).

## Estrutura

- `manifest.json` (MV2, `browser_specific_settings.gecko`)
- `background.js` — menus de contexto + `cobaltRequest()` + downloads + mensagens
- `popup.html/js/css` — UI rápida (URL, modo, qualidade, picker)
- `options.html/js` — instância, Api-Key, padrões
- `picker.html` — fallback p/ resultados `picker` vindos do menu de contexto
