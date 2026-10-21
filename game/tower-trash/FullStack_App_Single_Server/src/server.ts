import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { GameEngine } from './gameEngine';
import { setupSocketHandlers } from './socketHandler';

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());

const engine = new GameEngine();

// REST Authentication Endpoint matching target
app.post('/api/auth', (req: Request, res: Response) => {
  const { operator, auth_token, currency, game_mode } = req.body;
  const userId = `user_${Date.now()}`;
  const nickname = 'Magenta Puzzled Stork';
  const balance = engine.getBalance(userId).toString();

  res.status(201).json({
    success: true,
    result: {
      userId,
      nickname,
      balance,
      currency: currency || 'USD',
      operator: operator || 'default',
      operatorId: operator || 'default',
      gameMode: game_mode || 'tower-dash',
      sessionToken: 'sess_' + Math.random().toString(36).substring(2, 9),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400
    },
    data: {
      userId,
      nickname,
      balance,
      currency: currency || 'USD',
      operator: operator || 'default',
      operatorId: operator || 'default',
      gameMode: game_mode || 'tower-dash'
    },
    gameConfig: null,
    bonuses: [],
    isLobbyEnabled: false,
    isPromoCodeEnabled: false,
    isSoundEnabled: false,
    isMusicEnabled: false
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', game: 'tower-dash', timestamp: Date.now() });
});

app.get('/api/profit-engine', (_req: Request, res: Response) => {
  res.json({ success: true, data: engine.getProfitEngineStats() });
});

// Configure Socket.IO matching Engine.IO path '/io/'
const io = new Server(server, {
  path: '/io/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

setupSocketHandlers(io, engine);

// Serve frontend static files if available (single-server deployment)
const publicPaths = [
  path.resolve(__dirname, '../public'),
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(process.cwd(), 'public'),
  path.resolve(process.cwd(), '../client/dist')
];

const clientDistPath = publicPaths.find(p => fs.existsSync(path.join(p, 'index.html')));

if (clientDistPath) {
  console.log(`[TowerDash Server] Serving frontend from: ${clientDistPath}`);
  app.use(express.static(clientDistPath));
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/io')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[TowerDash Server] Listening on port ${PORT}`);
  console.log(`[TowerDash Server] WebSocket gateway ready at /io/`);
});
