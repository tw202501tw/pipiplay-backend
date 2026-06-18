/**
 * Pipiplay 2.0 核心後端主程式 - server.js
 * 整合項目：Express、MongoDB、JWT、Socket.io、綠界金流系統（ECPay）
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

// <comment-tag id="1" text="Structure: For better maintainability, move Mongoose models to a dedicated 'models/' directory and import them here. This keeps server.js focused on initialization and orchestration." type="suggestion">
// 引入即時桌遊遊戲引擎
const { initGameEngine } = require('./game_manager');
</comment-tag id="1" text="Structure: For better maintainability, move Mongoose models to a dedicated 'models/' directory and import them here. This keeps server.js focused on initialization and orchestration." type="suggestion">

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// <comment-tag id="2" text="Environment Management: Ensure all sensitive keys like ECPAY_HASH_KEY, ECPAY_HASH_IV, and ECPAY_MERCHANT_ID are strictly loaded from .env. Never fallback to hardcoded strings in production." type="suggestion">
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'PIPIPLAY_SUPER_SECRET_KEY_V2';
</comment-tag id="2" text="Environment Management: Ensure all sensitive keys like ECPAY_HASH_KEY, ECPAY_HASH_IV, and ECPAY_MERCHANT_ID are strictly loaded from .env. Never fallback to hardcoded strings in production." type="suggestion">

// ... [Schemas] ...

// <comment-tag id="3" text="Centralized Error Handling: Instead of repeated res.status(500).json({ error: '...' }), implement a global error handling middleware at the bottom of the stack (e.g., app.use((err, req, res, next) => { ... }))." type="suggestion">
const authenticateJWT = (req, res, next) => {
// ...
</comment-tag id="3" text="Centralized Error Handling: Instead of repeated res.status(500).json({ error: '...' }), implement a global error handling middleware at the bottom of the stack (e.g., app.use((err, req, res, next) => { ... }))." type="suggestion">

// ... [API Endpoints] ...

// <comment-tag id="4" text="Logging: Replace console.log with a professional logging library like 'winston' or 'pino'. This enables better log formatting, levels, and persistence." type="suggestion">
// 綠界 Callback 時，綠界會發送 application/x-www-form-urlencoded 格式
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
</comment-tag id="4" text="Logging: Replace console.log with a professional logging library like 'winston' or 'pino'. This enables better log formatting, levels, and persistence." type="suggestion">

// ... [Socket.io implementation] ...

// <comment-tag id="5" text="Modularization: Break these routes into separate files (e.g., 'routes/auth.js', 'routes/billing.js', 'routes/games.js') and mount them using app.use('/api/auth', authRoutes). This prevents server.js from becoming unreadable as you add features." type="suggestion">
// --- 4.4 桌遊對戰房 API ---
app.post('/api/games/create', authenticateJWT, async (req, res) => {
// ...
});
</comment-tag id="5" text="Modularization: Break these routes into separate files (e.g., 'routes/auth.js', 'routes/billing.js', 'routes/games.js') and mount them using app.use('/api/auth', authRoutes). This prevents server.js from becoming unreadable as you add features." type="suggestion">
