import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseToolResult } from './parseToolResult.js';

const JIRA_MCP_ARGS = ['-y', '--registry', 'http://nexus3.betha.com.br/repository/npm-all/', '@betha/jira-mcp'];

let clientPromise: Promise<Client> | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não definida. Configure o arquivo .env (veja .env.example).`);
  }
  return value;
}

function buildSpawnEnv(): Record<string, string> {
  const inherited = Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return {
    ...Object.fromEntries(inherited),
    JIRA_BASE_URL: requireEnv('JIRA_BASE_URL'),
    JIRA_USERNAME: requireEnv('JIRA_USERNAME'),
    JIRA_PASSWORD: requireEnv('JIRA_PASSWORD'),
  };
}

async function createClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: JIRA_MCP_ARGS,
    env: buildSpawnEnv(),
  });

  const client = new Client({ name: 'painel-sprints-jira', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = createClient().catch((err: unknown) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

/** Chama uma tool do MCP jira-desenv (@betha/jira-mcp) e retorna o JSON já parseado. */
export async function callJiraTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args });
  return parseToolResult<T>(result);
}
