# Painel de Sprints (Jira)

Painel de acompanhamento de sprints ativas do Jira, com linha do tempo por
pessoa/atividade e indicadores (KPIs, riscos, herdadas, bugs). Os dados são
buscados via MCP (`@betha/jira-mcp`), do mesmo jeito que o Claude Code já usa,
e a página é atualizada sob demanda com o botão **Atualizar**.

## Como rodar

1. Instale as dependências (na raiz do projeto):

   ```
   npm install
   ```

2. Renomeie o arquivo `.env.example` para `.env`

3. Suba o backend e o frontend juntos:

   ```
   npm run dev
   ```

4. Abra `http://localhost:5173`. Na primeira execução, selecione a **vertical**
   do Jira que o painel deve acompanhar e informe o seu usuário e senha/token
   do Jira (as mesmas credenciais que você já usa no MCP `jira-desenv` do
   Claude Code) — essa configuração fica salva em `config.json` (não
   versionado, com a senha em texto puro só localmente) e pode ser trocada
   depois pelo botão **Configurações**. Ao editar depois, deixar o campo de
   senha em branco mantém a senha já salva.

O painel busca automaticamente todas as sprints ativas (`sprint in
openSprints()`) dos projetos da vertical informada — não é preciso saber IDs
de board ou sprint.

> **Precisa estar na rede/VPN da Betha**: o backend baixa o `@betha/jira-mcp`
> do registro npm interno (`nexus3.betha.com.br`) na primeira execução.

### Problemas conhecidos

- **`npm install` mostra avisos de vulnerabilidade**: são de dependências de
  desenvolvimento (`vite`/`vitest`/`express`→`qs`) sem correção não-destrutiva
  disponível ainda — não afetam o uso local da ferramenta. `npm audit` mostra
  os detalhes se quiser conferir.

## Como funciona

- `server/`: API Express que atua como cliente MCP, conversando com o
  `@betha/jira-mcp` (o mesmo processo que o Claude Code usa) via stdio.
  Resolve as atividades (issues do tipo Story) e bugs vinculados da vertical
  configurada, e calcula prazos/atraso a partir dos Pontos de Função.
- `client/`: aplicação React (Vite) que consome a API e renderiza a linha do
  tempo e os indicadores. O botão **Atualizar** dispara uma nova busca ao
  vivo no Jira.

## Testes

```
npm test
```

Roda os testes do motor de cálculo (dias úteis, feriados, estimativa,
atraso/herdada) e da lógica de agregação de indicadores.
