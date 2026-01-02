import express, { Request, Response} from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import path from 'path';
// import conversationsRouter from './routes/conversations/index';
import authRouter from './routes/auth/index';
import externalRouter from './routes/external/index';
import { authenticateToken } from './middleware/auth.middleware';
import './config/database';
import { initRealtime } from './realtime';
import { TokenCleanupService } from './services/tokenCleanup.service';
import logger from './config/logger';
import { extractTenant, requireTenant } from './middleware/tenant.middleware';
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());

// log all requests
app.use((req: Request, res: Response, next) => {
  // body of the logger
  logger.info(`${req.method} ${req.url} | Body: ${JSON.stringify(req.body)}`);
  next();
});

// Serve frontend for any non-API routes
app.get('/frontend', (req: Request, res: Response) => {
  if (!req.path.startsWith('/auth') && !req.path.startsWith('/conversations') && !req.path.startsWith('/health')) {
    res.sendFile(path.join(__dirname, '../public/register.html'));
  }
});

// handle cors for localhost:3000 frontend allowed origins
app.use((req, res, next) => {
  const allowedOrigins = ['http://localhost:3000', 'https://ashwin.localdev.csiq.io'];
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin || '')) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});


// Serve static files
// app.use(express.static(path.join(__dirname, '../public')));

// Specific route for SDK
app.get('/chat-engine.sdk.js', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, '../public/chat-engine.sdk.js'));
});

// Widget iframe route
app.get('/widget', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.join(__dirname, '../public/widget.html'));
});

// API Routes



app.use(extractTenant);

app.use('/auth', requireTenant, authRouter);
// app.use('/api/conversations', requireTenant, conversationsRouter);
app.use('/api/widget', externalRouter);  // External SDK routes

app.get('/health', (req: Request, res: Response) => {
  res.send('OK');
});

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO and real-time features
initRealtime(server);

// Start token cleanup service
TokenCleanupService.startCleanup();

// Start server
console.log({aa:process.env.PORT})
const port = process.env.PORT || 3000;
server.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
});

export {app};