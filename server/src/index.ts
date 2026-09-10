import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { configRouter } from './routes/config.js';
import { boardDataRouter } from './routes/boardData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const CONFIG_PATH = resolve(REPO_ROOT, 'config.json');

dotenv.config({ path: resolve(REPO_ROOT, '.env') });

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', configRouter(CONFIG_PATH));
app.use('/api', boardDataRouter(CONFIG_PATH));

const port = Number(process.env.PORT ?? 3001);
const server = app.listen(port, () => {
  console.log(`Servidor do painel de sprints ouvindo em http://localhost:${port}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nA porta ${port} já está em uso — provavelmente o painel já está aberto em outra janela.\n` +
        'Feche a outra janela do painel (ou o programa usando essa porta) e tente novamente.\n',
    );
    process.exit(1);
  }
  throw err;
});
