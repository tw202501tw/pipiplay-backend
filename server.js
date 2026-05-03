const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 4000;
const JWT_SECRET = "pipiplay_secret";

// 假資料庫（之後可以換 MongoDB）
const users = [];

// 你的管理員帳號
const ADMIN_EMAIL = "hitw202501@outlook.com";

// 測試
app.get("/", (req, res) => {
  res.send("Pipiplay backend is running 🚀");
});


// ================== 註冊 ==================
app.post("/register", async (req, res) => {
  const { email, password, birthday, name, avatar, gender } = req.body;

  if (!email || !password || !birthday || !name || !gender) {
    return res.status(400).json({ message: "資料不完整" });
  }

  // 不雅詞
  const bannedWords = ["幹", "靠", "白痴", "智障"];
  if (bannedWords.some((w) => name.includes(w))) {
    return res.status(400).json({ message: "名稱不能有不雅文字" });
  }

  // 年齡限制
  const age = new Date().getFullYear() - new Date(birthday).getFullYear();
  if (age < 6) {
    return res.status(403).json({ message: "未滿6歲不能玩" });
  }

  // 是否已存在
  const exists = users.find((u) => u.email === email);
  if (exists) {
    return res.status(400).json({ message: "帳號已存在" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = {
    id: users.length + 1,
    email,
    passwordHash,
    birthday,
    name,
    avatar: avatar || "",
    gender,
    coins: 0,
    vipLevel: 0,
    isVIP: false,
    isAdmin: email === ADMIN_EMAIL,
    isBanned: false,
  };

  users.push(user);

  res.json({ message: "註冊成功", user });
});


// ================== 登入 ==================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = users.find((u) => u.email === email);
  if (!user) {
    return res.status(404).json({ message: "帳號不存在" });
  }

  if (user.isBanned) {
    return res.status(403).json({ message: "此帳號已被鎖定" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "密碼錯誤" });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, isAdmin: user.isAdmin },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ message: "登入成功", token, user });
});


// ================== 管理員：送金幣 ==================
app.post("/admin/give-coins", (req, res) => {
  const { adminEmail, targetEmail, coins } = req.body;

  const admin = users.find((u) => u.email === adminEmail);
  if (!admin || !admin.isAdmin) {
    return res.status(403).json({ message: "只有管理員可以操作" });
  }

  const target = users.find((u) => u.email === targetEmail);
  if (!target) {
    return res.status(404).json({ message: "找不到玩家" });
  }

  target.coins += Number(coins);

  res.json({ message: "已發送遊戲幣", target });
});


// ================== 管理員：送VIP ==================
app.post("/admin/give-vip", (req, res) => {
  const { adminEmail, targetEmail, vipLevel } = req.body;

  const admin = users.find((u) => u.email === adminEmail);
  if (!admin || !admin.isAdmin) {
    return res.status(403).json({ message: "只有管理員可以操作" });
  }

  const target = users.find((u) => u.email === targetEmail);
  if (!target) {
    return res.status(404).json({ message: "找不到玩家" });
  }

  target.isVIP = true;
  target.vipLevel = Math.min(Number(vipLevel), 15);

  res.json({ message: "已發送VIP", target });
});


// ================== 啟動 ==================
app.listen(PORT, () => {
  console.log("伺服器啟動：http://localhost:4000");
});
