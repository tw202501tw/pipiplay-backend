/**
 * Pipiplay 2.0 核心後端主程式 - server.js
 * 整合項目：Express、MongoDB、JWT、Socket.io、綠界金流系統（ECPay）
 * 支援功能：1-15級 VIP 訂閱體系、VIP 8 專屬小管家客服、多種桌遊、家族每日扣維持費、
 * 高級語音房（自訂背景與房管名額）、私訊黑名單、以及「綠界安全刷卡/超商儲值」！
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

// 引入即時桌遊遊戲引擎
const { initGameEngine } = require('./game_manager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'PIPIPLAY_SUPER_SECRET_KEY_V2';

// 綠界金鑰 (由環境變數讀取，若無則預設載入綠界官方提供的「測試環境金鑰」)
const ECPAY_HASH_KEY = process.env.ECPAY_HASH_KEY || '5294y06JbISpM5x9'; 
const ECPAY_HASH_IV = process.env.ECPAY_HASH_IV || 'v77hoKGq4kWxGbIS';
const ECPAY_MERCHANT_ID = process.env.ECPAY_MERCHANT_ID || '2000132'; // 2000132 為綠界官方測試店號
const ECPAY_API_URL = process.env.ECPAY_API_URL || 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'; // 測試刷卡頁網址

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 1. MONGODB DATABASE SCHEMAS (資料庫模型)
// ==========================================

// --- 使用者模型 ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  gold: { type: Number, default: 100 }, // 註冊完初始金幣為 100
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  
  // VIP 1-15 等級體系
  vipLevel: { type: Number, default: 0, min: 0, max: 15 },
  vipExpiry: { type: Date, default: null },
  
  // VIP 訂閱歷史紀錄 (月付/半年付/年付)
  vipSubscription: {
    planType: { type: String, enum: ['monthly', 'semi-annually', 'yearly', null], default: null },
    startDate: { type: Date, default: null },
    monthsPaidCount: { type: Number, default: 0 }, 
    isFirstTime: { type: Boolean, default: true }  
  },

  // 家族關係
  familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', default: null },
  familyRole: { type: String, enum: ['leader', 'co_leader', 'elder', 'member', null], default: null },
  
  // 帳號狀態與封鎖
  isBlocked: { type: Boolean, default: false },
  blockedReason: { type: String, default: '' },
  reportedBy: { type: String, default: '' }, 
  blockedAt: { type: Date, default: null },

  // 社群與黑名單
  socialProvider: { type: String, enum: ['local', 'google', 'apple'], default: 'local' },
  socialId: { type: String, default: null },
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // 被我封鎖的人
  
  // 禮物牆
  giftWall: [{
    giftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gift' },
    count: { type: Number, default: 0 }
  }]
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// --- 綠界訂單紀錄模型 ---
const OrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  merchantTradeNo: { type: String, required: true, unique: true }, 
  amountTWD: { type: Number, required: true }, 
  itemType: { type: String, enum: ['gold', 'vip'], required: true }, 
  itemKey: { type: String, required: true }, 
  goldGranted: { type: Number, default: 0 }, 
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  tradeNo: { type: String, default: '' } 
}, { timestamps: true });

const Order = mongoose.model('Order', OrderSchema);

// --- 語音房模型 ---
const RoomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  isPremium: { type: Boolean, default: false }, 
  price: { type: Number, default: 0 },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
  isLocked: { type: Boolean, default: false },
  password: { type: String, default: '' }, 
  backgroundUrl: { type: String, default: 'original_bg' }, 
  isPermanent: { type: Boolean, default: false }, 
  seats: [{
    index: { type: Number, required: true }, 
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isMuted: { type: Boolean, default: false }
  }]
}, { timestamps: true });

const Room = mongoose.model('Room', RoomSchema);

// --- 家族模型 ---
const FamilySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  leader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  coLeaders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
  elders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
  level: { type: Number, default: 1 },
  funds: { type: Number, default: 0 }, 
  dailyMaintenanceFee: { type: Number, default: 50 }, 
  shieldActiveUntil: { type: Date, default: null }, 
  voiceRoom: {
    level: { type: Number, default: 7 },
    moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isOpen: { type: Boolean, default: false }
  }
}, { timestamps: true });

const Family = mongoose.model('Family', FamilySchema);

// --- 禮物模型 ---
const GiftSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  iconUrl: { type: String, required: true },
  minVipLevelRequired: { type: Number, default: 0 } 
});

const Gift = mongoose.model('Gift', GiftSchema);

// --- 禮物紀錄與排行榜 ---
const GiftLogSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gift: { type: mongoose.Schema.Types.ObjectId, ref: 'Gift', required: true },
  count: { type: Number, default: 1 },
  totalCost: { type: Number, required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null }
}, { timestamps: true });

const GiftLog = mongoose.model('GiftLog', GiftLogSchema);

// --- 桌遊房間模型 ---
const GameSessionSchema = new mongoose.Schema({
  gameName: { type: String, required: true }, 
  isPaid: { type: Boolean, default: false },  
  mode: { type: String, enum: ['individual', 'team'], required: true }, 
  cost: { type: Number, default: 0 },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['lobby', 'playing', 'ended'], default: 'lobby' },
  maxPlayers: { type: Number, default: 10 }
}, { timestamps: true });

const GameSession = mongoose.model('GameSession', GameSessionSchema);

// ==========================================
// 2. MIDDLEWARES (身分驗證中介軟體)
// ==========================================

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return res.status(403).json({ error: '無效或過期的憑證' });
      req.user = decoded;
      next();
    });
  } else {
    res.status(401).json({ error: '未授權，請登入' });
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: '權限不足，需要系統管理員權限' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: '管理員權限驗證錯誤' });
  }
};

// ==========================================
// 3. ECPAY HELPER FUNCTIONS (綠界簽章演算核心)
// ==========================================

function generateCheckMacValue(params) {
  const sortedKeys = Object.keys(params).sort();
  let rawString = `HashKey=${ECPAY_HASH_KEY}&`;
  
  for (let key of sortedKeys) {
    if (key !== 'CheckMacValue') {
      rawString += `${key}=${params[key]}&`;
    }
  }
  rawString += `HashIV=${ECPAY_HASH_IV}`;

  let encoded = encodeURIComponent(rawString)
    .replace(/%20/g, '+')
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .toLowerCase();

  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

// ==========================================
// 4. API ENDPOINTS (REST 接口實作)
// ==========================================

app.get('/', (req, res) => {
  res.send('Pipiplay 2.0 伺服器正在運行中 🚀');
});

// --- 註冊 (初始 100 金幣) ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: '所有欄位均為必填' });
    }

    const exist = await User.findOne({ $or: [{ email }, { username }] });
    if (exist) return res.status(400).json({ error: '使用者名稱或 Email 已被佔用' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      gold: 100 
    });

    await newUser.save();
    res.status(201).json({ message: '帳號註冊成功！已發放 100 初始金幣！' });
  } catch (err) {
    res.status(500).json({ error: '註冊處理錯誤' });
  }
});

// --- 登入 ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: '帳號或密碼錯誤' });

    if (user.isBlocked) {
      return res.status(403).json({ 
        error: '您的帳號已被封鎖！', 
        reason: user.blockedReason,
        isBlocked: true,
        vipLevel: user.vipLevel
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: '帳號或密碼錯誤' });

    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: '365d' } 
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        gold: user.gold,
        vipLevel: user.vipLevel,
        vipExpiry: user.vipExpiry,
        familyId: user.familyId,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: '登入失敗' });
  }
});

// --- 第三方登入 ---
app.post('/api/auth/social-login', async (req, res) => {
  try {
    const { provider, socialId, email, username } = req.body;
    let user = await User.findOne({ socialId, socialProvider: provider });

    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        user.socialProvider = provider;
        user.socialId = socialId;
        await user.save();
      } else {
        const tempPassword = await bcrypt.hash(Math.random().toString(36), 10);
        user = new User({
          username: username || `${provider}_user_${Math.floor(1000 + Math.random() * 9000)}`,
          email,
          password: tempPassword,
          gold: 100, 
          socialProvider: provider,
          socialId
        });
        await user.save();
      }
    }

    if (user.isBlocked) return res.status(403).json({ error: '帳號已被封鎖' });

    const token = jwt.sign({ id: user._id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '365d' });
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: '第三方登入處理失敗' });
  }
});

// --- 忘記密碼 ---
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: '找不到該信箱註冊之用戶' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: '密碼重置成功，請使用新密碼登入。' });
  } catch (err) {
    res.status(500).json({ error: '重置密碼失敗' });
  }
});

// ==========================================
// 綠界科技（ECPay）充值系統與會員訂閱
// ==========================================

const GOLD_PACKAGES = {
  'NT30': { priceTWD: 30, gold: 600 },
  'NT80': { priceTWD: 80, gold: 1800 },
  'NT1480': { priceTWD: 1480, gold: 3000 },  
  'NT5000': { priceTWD: 5000, gold: 10000 }   
};

// 建立綠界金流付款訂單
app.post('/api/billing/ecpay-checkout', authenticateJWT, async (req, res) => {
  try {
    const { itemType, itemKey } = req.body; 
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: '用戶不存在' });

    let amountTWD = 0;
    let goldGranted = 0;
    let itemName = '';

    if (itemType === 'gold') {
      const pack = GOLD_PACKAGES[itemKey];
      if (!pack) return res.status(400).json({ error: '無效的金幣儲值方案' });
      amountTWD = pack.priceTWD;
      goldGranted = pack.gold;
      itemName = `Pipiplay 金幣 ${goldGranted} 個`;
    } 
    else if (itemType === 'vip') {
      const sub = user.vipSubscription || { planType: null, startDate: null, monthsPaidCount: 0, isFirstTime: true };
      
      if (itemKey === 'monthly') {
        itemName = 'VIP 會員-月付訂閱';
        if (sub.isFirstTime) {
          amountTWD = 0; 
        } else if (sub.monthsPaidCount === 1) {
          amountTWD = 200; 
        } else {
          amountTWD = 250; 
        }
      } 
      else if (itemKey === 'semi-annually') {
        itemName = 'VIP 會員-半年付訂閱';
        if (sub.isFirstTime) {
          amountTWD = 0; 
        } else if (sub.monthsPaidCount >= 1 && sub.monthsPaidCount < 6) {
          amountTWD = 1125; 
        } else {
          amountTWD = 1200; 
        }
      } 
      else if (itemKey === 'yearly') {
        itemName = 'VIP 會員-年付訂閱';
        if (sub.isFirstTime) {
          amountTWD = 0; 
        } else if (sub.monthsPaidCount >= 1 && sub.monthsPaidCount < 12) {
          amountTWD = 1700; 
        } else {
          amountTWD = 1800; 
        }
      } else {
        return res.status(400).json({ error: '無效的 VIP 訂閱方案' });
      }
    } else {
      return res.status(400).json({ error: '不支援的儲值類型' });
    }

    if (amountTWD === 0) {
      const currentExpiry = user.vipExpiry && user.vipExpiry > new Date() ? new Date(user.vipExpiry) : new Date();
      const addDays = itemKey === 'monthly' ? 30 : (itemKey === 'semi-annually' ? 180 : 365);
      currentExpiry.setDate(currentExpiry.getDate() + addDays);

      user.vipLevel = Math.min(15, (user.vipLevel || 0) + 1);
      user.vipExpiry = currentExpiry;
      user.vipSubscription = {
        planType: itemKey,
        startDate: user.vipSubscription.startDate || new Date(),
        monthsPaidCount: (user.vipSubscription.monthsPaidCount || 0) + 1,
        isFirstTime: false
      };
      await user.save();
      return res.json({ 
        isFreeTrial: true, 
        message: '恭喜！首月體驗已成功免費開通！', 
        vipLevel: user.vipLevel, 
        vipExpiry: user.vipExpiry 
      });
    }

    const merchantTradeNo = 'PIPI' + Date.now().toString().slice(-14) + Math.floor(Math.random() * 9);

    const order = new Order({
      userId,
      merchantTradeNo,
      amountTWD,
      itemType,
      itemKey,
      goldGranted,
      status: 'pending'
    });
    await order.save();

    const date = new Date();
    const formattedDate = date.getFullYear() + '/' +
      String(date.getMonth() + 1).padStart(2, '0') + '/' +
      String(date.getDate()).padStart(2, '0') + ' ' +
      String(date.getHours()).padStart(2, '0') + ':' +
      String(date.getMinutes()).padStart(2, '0') + ':' +
      String(date.getSeconds()).padStart(2, '0');

    const ecpayParams = {
      MerchantID: ECPAY_MERCHANT_ID,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: formattedDate,
      PaymentType: 'aio',
      TotalAmount: amountTWD.toString(),
      TradeDesc: 'Pipiplay 儲值付款',
      ItemName: itemName,
      ReturnURL: 'https://pipiplay-backend-1.onrender.com/api/billing/ecpay-callback', 
      ClientBackURL: 'https://pipiplay-web.vercel.app/payment-success', 
      ChoosePayment: 'ALL', 
      EncryptType: '1' 
    };

    ecpayParams.CheckMacValue = generateCheckMacValue(ecpayParams);

    res.json({
      actionUrl: ECPAY_API_URL,
      params: ecpayParams
    });
  } catch (err) {
    console.error('建立綠界訂單出錯:', err);
    res.status(500).json({ error: '無法建立付款訂單，請稍後再試' });
  }
});

// 綠界回傳 Webhook
app.post('/api/billing/ecpay-callback', async (req, res) => {
  try {
    const callbackData = { ...req.body };
    const receivedCheckMacValue = callbackData.CheckMacValue;

    delete callbackData.CheckMacValue;
    const computedCheckMacValue = generateCheckMacValue(callbackData);

    if (receivedCheckMacValue !== computedCheckMacValue) {
      console.error('❌ [金流警告] 綠界 CheckMacValue 校驗失敗！');
      return res.status(400).send('0|CheckMacValueVerifyFail');
    }

    if (callbackData.RtnCode === '1') {
      const merchantTradeNo = callbackData.MerchantTradeNo;

      const order = await Order.findOne({ merchantTradeNo, status: 'pending' });
      if (order) {
        order.status = 'completed';
        order.tradeNo = callbackData.TradeNo;
        await order.save();

        const user = await User.findById(order.userId);
        if (user) {
          if (order.itemType === 'gold') {
            user.gold += order.goldGranted;
            await user.save();
            console.log(`✅ [儲值成功] 玩家 ${user.username} 到帳 ${order.goldGranted} 金幣！`);
            io.to(`user_${user._id}`).emit('gold_balance_updated', { newBalance: user.gold });
          } 
          else if (order.itemType === 'vip') {
            const currentExpiry = user.vipExpiry && user.vipExpiry > new Date() ? new Date(user.vipExpiry) : new Date();
            const addDays = order.itemKey === 'monthly' ? 30 : (order.itemKey === 'semi-annually' ? 180 : 365);
            currentExpiry.setDate(currentExpiry.getDate() + addDays);

            user.vipLevel = Math.min(15, (user.vipLevel || 0) + 1);
            user.vipExpiry = currentExpiry;
            user.vipSubscription = {
              planType: order.itemKey,
              startDate: user.vipSubscription.startDate || new Date(),
              monthsPaidCount: (user.vipSubscription.monthsPaidCount || 0) + 1,
              isFirstTime: false
            };
            await user.save();
            console.log(`✅ [VIP續訂成功] 玩家 ${user.username} 等級提升至 Lv.${user.vipLevel}！`);
            
            io.to(`user_${user._id}`).emit('vip_status_updated', { 
              vipLevel: user.vipLevel, 
              vipExpiry: user.vipExpiry 
            });
          }
        }
      }
    }

    res.send('1|OK');
  } catch (err) {
    console.error('處理綠界 Webhook 發生嚴重異常:', err);
    res.status(500).send('0|Error');
  }
});

// ==========================================
// VIP 8 專屬客服與小管家系統
// ==========================================

app.post('/api/assistant/chat', authenticateJWT, async (req, res) => {
  try {
    const { message } = req.body;
    const user = await User.findById(req.user.id);

    if (user.vipLevel < 8) {
      return res.status(403).json({ error: '線上小管家為 VIP 8 以上專屬特權服務，請提升您的 VIP 等級。' });
    }

    let reply = "";
    const cleanMsg = message.trim();

    if (cleanMsg.includes('封鎖') || cleanMsg.includes('被封')) {
      if (user.isBlocked) {
        reply = `【小管家專屬報告】查到了！您的帳號因為「${user.blockedReason || '違反使用者安全條款'}」而被封鎖限制。檢舉申訴人紀錄為：${user.reportedBy || '系統安全偵測異常'}。請問需要小管家幫您向管理員提交特權「申請解封」嗎？`;
      } else {
        reply = `【小管家】報告主人，您的帳號目前狀態非常健康，沒有任何封鎖紀錄喔！請放心暢玩！`;
      }
    } 
    else if (cleanMsg.includes('解封') || cleanMsg.includes('申請解封')) {
      if (user.isBlocked) {
        user.isBlocked = false; 
        user.blockedReason = '';
        await user.save();
        reply = `【小管家特權申請】已為您成功核對 VIP 8 身分，小管家剛才已動用解封特權，成功幫主人解除封鎖囉！現在您可以重新進入語音房了！`;
      } else {
        reply = `【小管家】主人，您目前並未被封鎖，不用辦理解封。`;
      }
    } 
    else if (cleanMsg.includes('檢舉') || cleanMsg.includes('誰檢舉我')) {
      if (user.reportedBy) {
        reply = `【小管家】主人，檢索到先前對您進行檢舉的玩家紀錄為：${user.reportedBy}。請注意保持友善社交喔！`;
      } else {
        reply = `【小管家】主人，目前在系統上沒有找到任何人對您的檢舉申訴紀錄。`;
      }
    } 
    else {
      reply = `【線上小管家】您好！我是您的專屬小秘書。我可以幫主人處理：帳號申訴、查詢被封原因與檢舉人、或是向後台自動申請秒速解封。請問今天有什麼事情需要小管家代勞嗎？`;
    }

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: '小管家系統忙碌中' });
  }
});

// ==========================================
// 語音房與家族系統管理 API
// ==========================================

// 建立桌遊房間
app.post('/api/games/create', authenticateJWT, async (req, res) => {
  try {
    const { gameName, isPaid, mode } = req.body;
    const user = await User.findById(req.user.id);

    const allowedGames = ['你畫我猜', '五子棋', '太空狼人殺', 'UNO', '嗨歌搶唱', '誰是臥底', '炸彈貓', '狼人殺'];
    if (!allowedGames.includes(gameName)) {
      return res.status(400).json({ error: '不支援該桌遊類型' });
    }

    let cost = 0;
    if (isPaid) {
      cost = 50; 
      if (user.gold < cost) {
        return res.status(400).json({ error: '金幣不足，無法建立收費版桌遊對戰房' });
      }
      user.gold -= cost;
      await user.save();
    }

    const newGame = new GameSession({
      gameName,
      isPaid,
      mode,
      cost,
      host: user._id,
      players: [user._id]
    });

    await newGame.save();
    res.status(201).json({ message: '桌遊對戰房建立成功！', game: newGame, remainingGold: user.gold });
  } catch (err) {
    res.status(500).json({ error: '桌遊房間創建失敗' });
  }
});

// 建立家族 (12000 金幣)
app.post('/api/families/create', authenticateJWT, async (req, res) => {
  try {
    const { name } = req.body;
    const creator = await User.findById(req.user.id);

    if (creator.gold < 12000) {
      return res.status(400).json({ error: '建立家族需要 12,000 金幣，餘額不足。' });
    }
    if (creator.familyId) {
      return res.status(400).json({ error: '您已加入或創建了其他家族' });
    }

    const newFamily = new Family({
      name,
      creator: creator._id,
      leader: creator._id,
      members: [creator._id],
      level: 1,
      dailyMaintenanceFee: 100,
      voiceRoom: {
        level: 7,
        moderators: [creator._id],
        isOpen: false
      }
    });

    await newFamily.save();

    creator.gold -= 12000;
    creator.familyId = newFamily._id;
    creator.familyRole = 'leader';
    await creator.save();

    res.status(201).json({
      message: '恭喜！家族創立成功！您已成為組長。',
      family: newFamily,
      remainingGold: creator.gold
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: '該家族名稱已被佔用' });
    }
    res.status(500).json({ error: '創立家族失敗' });
  }
});

// 家族捐款 (提升家族資金)
app.post('/api/families/donate', authenticateJWT, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.user.id);
    if (!user.familyId) return res.status(400).json({ error: '您不屬於任何家族' });

    if (user.gold < amount) return res.status(400).json({ error: '金幣不足，無法捐款' });

    user.gold -= Number(amount);
    await user.save();

    const family = await Family.findById(user.familyId);
    family.funds += Number(amount);

    const calculatedLevel = Math.max(1, Math.floor(family.funds / 10000));
    if (calculatedLevel > family.level) {
      family.level = calculatedLevel;
      family.dailyMaintenanceFee = calculatedLevel * 100; 
    }

    await family.save();

    res.json({
      message: '捐款成功！感謝您對家族的貢獻！',
      currentFunds: family.funds,
      familyLevel: family.level,
      remainingGold: user.gold
    });
  } catch (error) {
    res.status(500).json({ error: '捐款失敗' });
  }
});

// 家族扭蛋系統 (等級越高獎品越好，有機會獲得稀有戒指)
app.post('/api/families/gacha', authenticateJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.familyId) return res.status(400).json({ error: '您需要先加入家族才能使用家族扭蛋' });

    const family = await Family.findById(user.familyId);
    const gachaCost = 100;

    if (user.gold < gachaCost) {
      return res.status(400).json({ error: '家族扭蛋每次需要 100 金幣，您的餘額不足' });
    }

    user.gold -= gachaCost;

    let reward = '';
    const roll = Math.random() * 100;

    if (family.level >= 5) {
      if (roll < 5) {
        reward = '👑【至尊傳奇】神之戒 (稀有戒指)';
      } else if (roll < 20) {
        reward = '💍【璀璨奢華】星空對戒 (高級裝飾)';
      } else {
        reward = '🪙 150 家族金幣返還';
        user.gold += 150;
      }
    } else {
      if (roll < 10) {
        reward = '💍【新手首選】純銀守護戒指';
      } else {
        reward = '🪙 80 金幣小確幸';
        user.gold += 80;
      }
    }

    await user.save();
    res.json({ message: '扭蛋成功！', reward, remainingGold: user.gold });
  } catch (error) {
    res.status(500).json({ error: '扭蛋失敗' });
  }
});

// 家族偷襲與防護罩系統
app.post('/api/families/raid', authenticateJWT, async (req, res) => {
  try {
    const { targetFamilyId } = req.body;
    const user = await User.findById(req.user.id);

    if (!user.familyId) return res.status(400).json({ error: '您必須屬於某個家族才能發動偷襲' });
    if (user.familyRole !== 'leader' && user.familyRole !== 'co_leader') {
      return res.status(403).json({ error: '只有組長與副組長可對其他家族發動偷襲' });
    }

    const myFamily = await Family.findById(user.familyId);
    const enemyFamily = await Family.findById(targetFamilyId);

    if (!enemyFamily) return res.status(404).json({ error: '目標家族不存在' });

    if (enemyFamily.shieldActiveUntil && new Date(enemyFamily.shieldActiveUntil) > new Date()) {
      return res.status(403).json({ error: '偷襲失敗！對方家族目前正處於「防護罩」保護中！' });
    }

    const raidAmount = Math.floor(enemyFamily.funds * 0.1);
    enemyFamily.funds -= raidAmount;
    myFamily.funds += raidAmount;

    await enemyFamily.save();
    await myFamily.save();

    res.json({
      message: `偷襲大成功！成功掠奪 ${enemyFamily.name} 家族資金共 ${raidAmount} 元！`,
      myFamilyFunds: myFamily.funds
    });
  } catch (error) {
    res.status(500).json({ error: '偷襲操作出錯' });
  }
});

// 家族商店：購買防護罩 (500 家族資金)
app.post('/api/families/shop/buy-shield', authenticateJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.familyId) return res.status(400).json({ error: '您不屬於任何家族' });

    if (user.familyRole !== 'leader' && user.familyRole !== 'co_leader') {
      return res.status(403).json({ error: '只有組長與副組長有權限使用家族資金購買防護罩' });
    }

    const family = await Family.findById(user.familyId);
    if (family.funds < 500) {
      return res.status(400).json({ error: '家族資金不足 500 元，無法購買防護罩' });
    }

    family.funds -= 500;

    const currentShield = family.shieldActiveUntil ? new Date(family.shieldActiveUntil) : new Date();
    const newShieldExpiry = new Date(Math.max(currentShield, new Date()));
    newShieldExpiry.setHours(newShieldExpiry.getHours() + 24);

    family.shieldActiveUntil = newShieldExpiry;
    await family.save();

    res.json({
      message: '防護罩購買並啟用成功！24小時內將免疫所有偷襲！',
      shieldActiveUntil: family.shieldActiveUntil,
      remainingFunds: family.funds
    });
  } catch (error) {
    res.status(500).json({ error: '購買防護罩失敗' });
  }
});

// ==========================================
// 5. 系統管理員專屬 API
// ==========================================

app.post('/api/admin/block', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { targetUserId, reason, reportedBy } = req.body;
    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: '目標用戶不存在' });

    user.isBlocked = true;
    user.blockedReason = reason || '違反平台使用者規範';
    user.reportedBy = reportedBy || '系統管理員';
    user.blockedAt = new Date();
    await user.save();

    res.json({ message: '該帳號已成功封鎖。' });
  } catch (err) {
    res.status(500).json({ error: '操作失敗' });
  }
});

app.post('/api/admin/unblock', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: '目標用戶不存在' });

    user.isBlocked = false;
    user.blockedReason = '';
    user.reportedBy = '';
    user.blockedAt = null;
    await user.save();

    res.json({ message: '該帳號已成功解封恢復使用。' });
  } catch (err) {
    res.status(500).json({ error: '操作失敗' });
  }
});

app.get('/api/admin/players', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const players = await User.find({}, '-password');
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: '無法取得玩家列表' });
  }
});

app.post('/api/admin/grant-gold', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { targetUserId, amount, isInfinite } = req.body;
    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: '玩家不存在' });

    if (isInfinite) {
      user.gold = 999999999; 
    } else {
      user.gold += Number(amount);
    }
    await user.save();
    res.json({ message: '金幣發送成功！', currentGold: user.gold });
  } catch (error) {
    res.status(500).json({ error: '操作失敗' });
  }
});

app.post('/api/admin/grant-vip', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { targetUserId, days } = req.body;
    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: '玩家不存在' });

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + Number(days));

    user.vipStatus = true;
    user.vipExpiry = expiryDate;
    await user.save();

    res.json({ message: 'VIP 發送成功！', vipExpiry: expiryDate });
  } catch (error) {
    res.status(500).json({ error: '操作失敗' });
  }
});

// ==========================================
// 禮物系統 API
// ==========================================

app.post('/api/gifts/init', async (req, res) => {
  try {
    const count = await Gift.countDocuments();
    if (count === 0) {
      await Gift.insertMany([
        { name: '棒棒糖🍭', price: 10, iconUrl: 'lollipop', minVipLevelRequired: 0 },
        { name: '夢幻跑車🏎️', price: 1000, iconUrl: 'sports_car', minVipLevelRequired: 0 },
        { name: '至尊皇冠👑', price: 5000, iconUrl: 'royal_crown', minVipLevelRequired: 8 }, 
        { name: '天使之翼👼', price: 2000, iconUrl: 'angel_wings', minVipLevelRequired: 1 }
      ]);
      return res.json({ message: '初始禮物商品上架成功！' });
    }
    res.json({ message: '商城已有禮物，無須重複初始化' });
  } catch (error) {
    res.status(500).json({ error: '商城初始化失敗' });
  }
});

app.get('/api/gifts', authenticateJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const userVip = user ? user.vipLevel : 0;
    const availableGifts = await Gift.find({ minVipLevelRequired: { $lte: userVip } });
    res.json(availableGifts);
  } catch (err) {
    res.status(500).json({ error: '無法讀取禮物商城' });
  }
});

app.post('/api/gifts/send', authenticateJWT, async (req, res) => {
  try {
    const { giftId, receiverId, count, roomId } = req.body;
    const sender = await User.findById(req.user.id);
    const receiver = await User.findById(receiverId);
    const gift = await Gift.findById(giftId);

    if (!sender || !receiver || !gift) {
      return res.status(404).json({ error: '資料不存在(發送者/接收者/禮物)' });
    }

    if (gift.minVipLevelRequired > sender.vipLevel) {
      return res.status(403).json({ error: `此禮物需要 VIP 等級 ${gift.minVipLevelRequired} 以上，您的等級為 ${sender.vipLevel}` });
    }

    const totalCost = gift.price * count;
    if (sender.gold < totalCost) {
      return res.status(400).json({ error: '餘額不足，無法發送該數量禮物' });
    }

    sender.gold -= totalCost;
    await sender.save();

    const giftWallIndex = receiver.giftWall.findIndex(item => item.giftId.toString() === giftId);
    if (giftWallIndex > -1) {
      receiver.giftWall[giftWallIndex].count += count;
    } else {
      receiver.giftWall.push({ giftId: gift._id, count });
    }
    await receiver.save();

    const log = new GiftLog({
      sender: sender._id,
      receiver: receiver._id,
      gift: gift._id,
      count,
      totalCost,
      roomId
    });
    await log.save();

    io.to(`room_${roomId}`).emit('gift_received', {
      senderName: sender.username,
      receiverName: receiver.username,
      giftName: gift.name,
      giftIcon: gift.iconUrl,
      count,
      roomId
    });

    res.json({ message: '送禮成功！', remainingGold: sender.gold });
  } catch (error) {
    res.status(500).json({ error: '送禮操作失敗' });
  }
});

app.get('/api/gifts/leaderboard', async (req, res) => {
  try {
    const leaderboard = await GiftLog.aggregate([
      {
        $group: {
          _id: '$sender',
          totalSpent: { $sum: '$totalCost' }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      {
        $project: {
          'userInfo.username': 1,
          'userInfo.email': 1,
          totalSpent: 1
        }
      }
    ]);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: '無法取得排行榜' });
  }
});

// ==========================================
// 6. REAL-TIME SOCKET.IO (即時聊天、座席、桌遊引擎掛載)
// ==========================================

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('未提供 Token 憑證'));

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('認證失敗'));
    socket.user = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`🔌 玩家建立 Socket 連線: ${socket.user.username}`);

  socket.join(`user_${socket.user.id}`);

  socket.on('join_group', ({ type, targetId }) => {
    socket.join(`${type}_${targetId}`);
  });

  socket.on('send_world_msg', (data) => {
    io.emit('recv_world_msg', {
      sender: socket.user.username,
      content: data.content,
      timestamp: new Date()
    });
  });

  socket.on('send_room_msg', (data) => {
    const { roomId, content } = data;
    io.to(`room_${roomId}`).emit('recv_room_msg', {
      sender: socket.user.username,
      content,
      timestamp: new Date()
    });
  });

  // 私訊功能 (包含黑名單封鎖校驗)
  socket.on('send_private_msg', async (data) => {
    const { targetUserId, content } = data;
    try {
      const targetUser = await User.findById(targetUserId);
      if (!targetUser) return socket.emit('error_msg', '該用戶不存在');

      if (targetUser.blockedUsers.includes(socket.user.id)) {
        return socket.emit('error_msg', '傳送失敗，對方已將您加入黑名單。');
      }

      io.to(`user_${targetUserId}`).emit('recv_private_msg', {
        senderId: socket.user.id,
        senderName: socket.user.username,
        content,
        timestamp: new Date()
      });
    } catch (err) {
      socket.emit('error_msg', '私訊發送發生異常');
    }
  });

  socket.on('take_seat', async (data) => {
    const { roomId, seatIndex } = data;
    try {
      const room = await Room.findById(roomId);
      if (!room) return;

      const seat = room.seats.find(s => s.index === seatIndex);
      if (seat && seat.userId === null) {
        room.seats.forEach(s => {
          if (s.userId && s.userId.toString() === socket.user.id) {
            s.userId = null;
          }
        });

        seat.userId = socket.user.id;
        await room.save();

        io.to(`room_${roomId}`).emit('room_seats_updated', room.seats);
      }
    } catch (err) {
      console.error(err);
    }
  });

  // 掛載即時桌遊核心控制引擎
  initGameEngine(io, socket);

  socket.on('disconnect', () => {
    console.log(`🔌 玩家斷開 Socket 連線: ${socket.user.username}`);
  });
});

// ==========================================
// 7. 每日定時維護背景任務 (家族扣維持費、VIP 過期維護)
// ==========================================

setInterval(async () => {
  try {
    const families = await Family.find();
    for (let family of families) {
      const fee = family.level * 100;
      if (family.funds >= fee) {
        family.funds -= fee;
        await family.save();
        console.log(`[家族維護] ${family.name} 順利扣除每日維持費: ${fee} 元。`);
      } else {
        if (family.level > 1) {
          family.level -= 1;
          await family.save();
          console.warn(`[家族警告] ${family.name} 資金不足降等至 Lv.${family.level}`);
        }
      }
    }

    const now = new Date();
    const expiredVips = await User.find({ vipExpiry: { $lt: now }, vipLevel: { $gt: 0 } });
    for (let u of expiredVips) {
      u.vipLevel = 0; 
      u.vipSubscription.planType = null;
      await u.save();
      console.log(`[VIP維護] 用戶 ${u.username} VIP 效期屆滿，已恢復一般身分。`);
    }

  } catch (error) {
    console.error('[排程作業異常]:', error);
  }
}, 24 * 60 * 60 * 1000); 

// ==========================================
// 8. DB CONNECTION & SERVER RUN
// ==========================================

if (!MONGODB_URI) {
  console.error("❌ 錯誤：Render 未設定 MONGODB_URI 環境變數！");
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Pipiplay 已成功連接 MongoDB Atlas！');
    server.listen(PORT, () => {
      console.log(`🚀 Pipiplay 2.0 伺服器已於埠號: ${PORT} 順利啟動`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB 連接失敗:', err);
  });
