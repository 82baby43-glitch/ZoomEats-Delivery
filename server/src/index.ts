import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';
import { WebSocketServer } from 'ws';
import healthRouter from './routes/health';
import chatRouter from './routes/chat';
import projectRouter from './routes/project';
import filesRouter from './routes/files';
import filesWriteRouter from './routes/filesWrite';
import gitRouter from './routes/git';
import memoryRouter from './routes/memory';
import authRouter from './routes/auth';
import keysRouter from './routes/keys';
import usageRouter from './routes/usage';
import exportRouter from './routes/export';
import { createTerminalSession } from './services/terminal';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// ── Middleware ──
app.use(express.json({ limit: '2mb' }));

// ── API routes ──
app.use('/api', healthRouter);
app.use('/api', authRouter);         // login/logout — no auth required
app.use('/api', chatRouter);
app.use('/api', projectRouter);
app.use('/api', filesRouter);
app.use('/api', filesWriteRouter);   // auth applied inside router for write ops
app.use('/api', gitRouter);          // auth applied inside router for write ops
app.use('/api', memoryRouter);       // auth applied inside router for write ops
app.use('/api', keysRouter);         // auth applied inside router
app.use('/api', usageRouter);        // auth applied inside router
app.use('/api', exportRouter);

// ── Production: serve built client if the dist directory exists ──
const nodeEnv = process.env['NODE_ENV'];
const clientDist = path.resolve(__dirname, '../../client/dist');

if (nodeEnv === 'production' && fs.existsSync(clientDist)) {
  console.log(`Serving static files from ${clientDist}`);
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── Create HTTP server and attach WebSocket ──
const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade for /api/terminal
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/api/terminal') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      const cwd = url.searchParams.get('cwd') || undefined;
      const cols = parseInt(url.searchParams.get('cols') || '80', 10);
      const rows = parseInt(url.searchParams.get('rows') || '24', 10);

      wss.emit('connection', ws, request);
      createTerminalSession(ws, { cwd, cols, rows });
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  const mode = nodeEnv === 'production' ? 'production' : 'development';
  console.log(`Quantum Agent server running on http://localhost:${PORT} (${mode})`);
});

export default app;
