import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseToolResult } from './parseToolResult.js';

const JIRA_MCP_ARGS = ['-y', '--registry', 'http://nexus3.betha.com.br/repository/npm-all/', '@betha/jira-mcp'];

export interface JiraCredentials {
  username: string;
  password: string;
}

let clientPromise: Promise<Client> | null = null;
let clientCredentialsKey: string | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não definida. Configure o arquivo .env (veja .env.example).`);
  }
  return value;
}

function buildSpawnEnv(credentials: JiraCredentials): Record<string, string> {
  const inherited = Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return {
    ...Object.fromEntries(inherited),
    JIRA_BASE_URL: requireEnv('JIRA_BASE_URL'),
    JIRA_USERNAME: credentials.username,
    JIRA_PASSWORD: credentials.password,
  };
}

async function createClient(credentials: JiraCredentials): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: JIRA_MCP_ARGS,
    env: buildSpawnEnv(credentials),
  });

  const client = new Client({ name: 'painel-sprints-jira', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

// Reconecta automaticamente quando o usuário troca o usuário/senha na tela de Configurações,
// em vez de ficar preso às credenciais usadas na primeira chamada.
function getClient(credentials: JiraCredentials): Promise<Client> {
  const key = `${credentials.username}::${credentials.password}`;
  if (!clientPromise || clientCredentialsKey !== key) {
    clientCredentialsKey = key;
    clientPromise = createClient(credentials).catch((err: unknown) => {
      clientPromise = null;
      clientCredentialsKey = null;
      throw err;
    });
  }
  return clientPromise;
}

/** Chama uma tool do MCP jira-desenv (@betha/jira-mcp) e retorna o JSON já parseado. */
export async function callJiraTool<T = unknown>(
  name: string,
  args: Record<string, unknown>,
  credentials: JiraCredentials,
): Promise<T> {
  const client = await getClient(credentials);
  const result = await client.callTool({ name, arguments: args });
  return parseToolResult<T>(result);
}
