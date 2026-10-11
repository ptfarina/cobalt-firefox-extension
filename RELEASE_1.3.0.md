# Compatibilidade + Notas da versão 1.3.0 (AMO)

## Compatibilidade (campo Version Compatibility)

- **Firefox para desktop: 142.0 ou superior** (`strict_min_version: 142.0`,
  exigido pelo campo `data_collection_permissions`)
- **Firefox para Android: 142.0 ou superior** — núcleo completo (popup,
  download com progresso, picker, opções). Ressalvas no Android: itens de menu
  de contexto dependem do suporte do SO e o recurso de **instância local via
  Docker não se aplica** (sem `nativeMessaging` no Android — a extensão informa
  isso e segue funcionando com instâncias remotas).
- **Manifest V2** (suportado pelo Firefox, sem remoção anunciada).
- Sem dependência de SO além do Firefox (o Docker/host nativo é opcional e
  só para a instância local no desktop Linux; testado no Linux).

## Notas da versão 1.3.0 (campo Release Notes) — primeira versão pública

Versão inicial pública da extensão.

- Downloads de vídeos e áudios pela API atual do Cobalt (`imputnet/cobalt`):
  respostas `tunnel`/`redirect` com **progresso real**, `picker` com lista de
  escolha e mensagens de erro traduzidas.
- Funciona com **qualquer instância**: própria, comunitária ou local via Docker
  (sobe ao abrir o Firefox e para ao fechar; requer instalador à parte).
- **Autenticação** para instâncias protegidas via Api-Key ou token JWT manual,
  com leitura de validade e botão de teste da instância (versão + serviços).
- **Privacidade**: com a instância em branco (padrão), nenhuma transmissão de
  rede é feita; política de privacidade inclusa na listagem.
- Pacote 100% autocontido (sem código remoto, sem compilação) — validação
  automatizada da Mozilla: 0 erros, 0 alertas, 0 notícias.
