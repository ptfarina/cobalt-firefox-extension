# Política de Privacidade — Cobalt Media Downloader

> Cole este texto no campo **Privacy Policy** da listagem na AMO
> (a Mozilla hospeda na própria página da extensão; não precisa de site próprio).
> Versão PT-BR abaixo; versão em inglês após o separador.

---

## (PT-BR) Política de Privacidade

**O que é transmitido:** somente a URL da mídia que **você escolhe baixar**
(ao clicar em Baixar, no menu de contexto ou na ação da barra de ferramentas),
enviada **exclusivamente para a instância Cobalt configurada por você**
(própria, local via Docker, ou comunitária de sua escolha).

**O que NÃO acontece:**
- Nenhum dado é enviado aos autores da extensão ou a terceiros;
- Nada é transmitido sem sua ação — com a instância em branco (padrão),
  a extensão não faz nenhuma transmissão de rede;
- Sem rastreamento, analytics, anúncios ou identificadores persistentes.

**Dados guardados localmente** (no `storage` do Firefox, sincronizado com sua
conta Firefox se a sincronização estiver ativa): URL da instância, Api-Key/token
JWT (se informados) e preferências de qualidade/formato. Nada disso sai da sua
máquina exceto o necessário para chamar a API configurada.

**Controle:** você pode apagar tudo a qualquer momento limpando os dados da
extensão em `about:addons` ou desinstalando-a. Dúvidas sobre o código:
ele é 100% local e auditável no pacote da extensão.

---

## (EN) Privacy Policy

**What is transmitted:** only the media URL **you choose to download**
(via the Download button, context menu, or toolbar action), sent **exclusively
to the Cobalt instance configured by you** (self-hosted, local via Docker,
or a community instance of your choice).

**What does NOT happen:**
- No data is sent to the extension authors or any third party;
- Nothing is transmitted without your action — with a blank instance (default),
  the extension performs no network transmission at all;
- No tracking, analytics, ads, or persistent identifiers.

**Locally stored data** (Firefox `storage`, synced with your Firefox account
if sync is enabled): instance URL, Api-Key/JWT token (if provided), and
quality/format preferences. None of it leaves your machine except what is
needed to call your configured API.

**Control:** you can erase everything at any time by clearing the extension's
data in `about:addons` or uninstalling it.
