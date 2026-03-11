// Aetheris\aetheris-backend\src\index.ts

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';

import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { userRouter } from './routes/user';
import { agentRouter } from './routes/agent';
import { transactionRouter } from './routes/transactions';
import { profitRouter } from './routes/profits';
import { statsRouter } from './routes/stats';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
}));

// ── Rate Limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ── General Middleware ───────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/user', userRouter);
app.use('/api/v1/agents', agentRouter);
app.use('/api/v1/transactions', transactionRouter);
app.use('/api/v1/profits', profitRouter);
app.use('/api/v1/stats', statsRouter);

// ── Error Handler (must be last) ─────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`🚀 Aetheris API running on port ${PORT} [${process.env.NODE_ENV}]`);
});

export default app;