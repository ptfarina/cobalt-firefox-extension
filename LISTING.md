# Descrição da listagem (AMO) — Cobalt Media Downloader

> Colar no campo **Description** da página do produto. Os primeiros 250
> caracteres concentram o essencial (a AMO recomenda).

---

Baixe vídeos e áudios de YouTube, TikTok, Instagram, Twitter/X, Reddit, Vimeo e mais usando a API do Cobalt (imputnet/cobalt). A URL da mídia é enviada somente para a instância configurada por você, apenas quando você clica para baixar — sem rastreamento.

## Recursos

- **Download em 1 clique**: botão na barra de ferramentas, menu de contexto (página, link, vídeo/áudio) e popup com pré-visualização da aba ativa.
- **Opções de formato**: modo vídeo/áudio/mudo, qualidade (144p–4K/max), áudio (mp3, opus, ogg, wav), estilo do nome do arquivo.
- **Múltiplos itens**: carrosséis e galerias (ex.: Instagram) abrem uma lista para escolher o que baixar.
- **Acompanhamento real**: progresso em MB, aviso de conclusão e, se falhar, o motivo + botões de link direto, copiar link e tentar de novo.
- **Qualquer instância**: use sua própria instância, uma comunitária ou a local via Docker.
- **Autenticação**: Api-Key ou token JWT manual para instâncias protegidas.
- **Teste de instância**: verifica versão e serviços suportados antes de baixar.

## Instância local (opcional, via Docker)

A extensão pode subir sua própria API (`http://localhost:9000`) quando o Firefox abre e **pará-la ao fechar** — zero custo com o navegador fechado. Requer o daemon Docker e o instalador `native-host/install-host.sh` (incluso no repositório). Inclui gerador de sessão do YouTube e suporte a `cookies.json` para serviços que exigem login. Sem a parte local, a extensão funciona normalmente com qualquer instância remota.

## Serviços suportados

YouTube, Twitter/X, TikTok, Instagram, Facebook, Reddit, Vimeo, Dailymotion, SoundCloud, Bluesky, Tumblr, Pinterest, Twitch (clipes), Rutube, Loom, Bilibili, VK, OK, Snapchat, Streamable, Newgrounds — conforme a instância (a local cobre 21 serviços; testados: tutorial no repositório).

## Privacidade

Somente a URL que você escolhe baixar é enviada, e apenas para a sua instância. Com a instância em branco (padrão), nada é transmitido. Sem analytics, anúncios ou identificadores. Detalhes na Política de Privacidade. Código 100% local e auditável.

## Problemas comuns

- *"URL do frontend, não da API"*: configure a URL base da **API** (ex.: `https://cobalt-api.exemplo`), não a do site.
- *Erro de JSON/auth*: confira Api-Key/JWT ou use instância aberta/local.
- *Serviço com login* (ex.: YouTube bloqueando streams): exporte seus cookies para `cookies.json` — guia no repositório.
