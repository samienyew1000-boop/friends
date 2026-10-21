"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const cors_1 = __importDefault(require("cors"));
const gameEngine_1 = require("./gameEngine");
const socketHandler_1 = require("./socketHandler");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));
app.use(express_1.default.json());
const engine = new gameEngine_1.GameEngine();
// REST Authentication Endpoint matching target
app.post('/api/auth', (req, res) => {
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
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', game: 'tower-dash', timestamp: Date.now() });
});
app.get('/api/profit-engine', (_req, res) => {
    res.json({ success: true, data: engine.getProfitEngineStats() });
});
// Configure Socket.IO matching Engine.IO path '/io/'
const io = new socket_io_1.Server(server, {
    path: '/io/',
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
});
(0, socketHandler_1.setupSocketHandlers)(io, engine);
// Serve frontend static files if available (single-server deployment)
const publicPaths = [
    path_1.default.resolve(__dirname, '../public'),
    path_1.default.resolve(__dirname, '../../client/dist'),
    path_1.default.resolve(process.cwd(), 'public'),
    path_1.default.resolve(process.cwd(), '../client/dist')
];
const clientDistPath = publicPaths.find(p => fs_1.default.existsSync(path_1.default.join(p, 'index.html')));
if (clientDistPath) {
    console.log(`[TowerDash Server] Serving frontend from: ${clientDistPath}`);
    app.use(express_1.default.static(clientDistPath));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/io')) {
            return next();
        }
        res.sendFile(path_1.default.join(clientDistPath, 'index.html'));
    });
}
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`[TowerDash Server] Listening on port ${PORT}`);
    console.log(`[TowerDash Server] WebSocket gateway ready at /io/`);
});
