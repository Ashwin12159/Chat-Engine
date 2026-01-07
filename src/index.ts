import express, { Request, Response} from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import path from 'path';
import sdkRouter from './routes/sdk/index';
import './config/database';
import logger from './config/logger';
import { extractTenant, requireTenant } from './middleware/tenant.middleware';
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());

app.use((req: Request, res: Response, next) => {
  logger.info(`${req.method} ${req.url} | Body: ${JSON.stringify(req.body)}`);
  next();
});

// Serve frontend for any non-API routes
app.get('/frontend', (req: Request, res: Response) => {
  if (!req.path.startsWith('/auth') && !req.path.startsWith('/conversations') && !req.path.startsWith('/health')) {
    res.sendFile(path.join(__dirname, '../public/register.html'));
  }
});

app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
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


app.get('/chat-engine.sdk.js', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, '../public/chat-engine.sdk.js'));
});


app.get('/widget', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.join(__dirname, '../public/widget.html'));
});

app.use(extractTenant);

// RESTful SDK routes
app.use('/api/sdk', sdkRouter);

app.get('/health', (req: Request, res: Response) => {
  res.send('OK');
});

const server = http.createServer(app);



const port = process.env.PORT || 3000;
server.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
});

export {app};