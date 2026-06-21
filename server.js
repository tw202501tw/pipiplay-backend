/**
 * Pipiplay 桌遊核心引擎 - game_manager.js
 * 負責處理即時桌遊房間的遊戲狀態、回合邏輯、規則判定，並透過 Socket.io 進行全體同步。
 * 支援遊戲：
 * 1. 五子棋 (Gomoku)
 * 2. 誰是臥底 (Who is the Spy)
 */

const activeGames = {}; 

// 誰是臥底 隨機詞庫
const WORD_LIBRARY = [
  { civilian: "蘋果", spy: "梨子" },
  { civilian: "牛奶", spy: "豆漿" },
  { civilian: "小丑", spy: "魔術師" },
  { civilian: "看電影", spy: "看電視" },
  { civilian: "火鍋", spy: "麻辣燙" },
  { civilian: "高鐵", spy: "火車" }
];

function initGameEngine(io, socket) {
  
  // 監聽玩家點擊「準備 / 取消準備」
  socket.on('player_toggle_ready', (data) => {
    const { gameId, isReady } = data;
    socket.to(`game_${gameId}`).emit('player_ready_status', {
      userId: socket.user.id,
      username: socket.user.username,
      isReady
    });
  });

  // 監聽房主點擊「開始遊戲」
  socket.on('start_game', async (data) => {
    const { gameId, gameName, playerList } = data; 
    
    // 在記憶體中建立當局遊戲狀態
    activeGames[gameId] = {
      gameId,
      gameName,
      status: 'playing',
      players: playerList,
      spectators: [],
      currentTurnIndex: 0,
      winner: null
    };

    if (gameName === '五子棋') {
      setupGomoku(gameId, playerList);
    } else if (gameName === '誰是臥底') {
      setupWhoIsSpy(gameId, playerList);
    }

    // 廣播遊戲正式開始與初始資料
    io.to(`game_${gameId}`).emit('game_started', activeGames[gameId]);
  });

  // ==========================================
  // A. 五子棋 (Gomoku) 落子與判定邏輯
  // ==========================================
  socket.on('gomoku_place_piece', (data) => {
    const { gameId, x, y } = data;
    const game = activeGames[gameId];

    if (!game || game.gameName !== '五子棋' || game.status !== 'playing') {
      return socket.emit('game_error', '遊戲尚未開始或已結束');
    }

    const currentPlayer = game.players[game.currentTurnIndex];
    if (currentPlayer.id !== socket.user.id) {
      return socket.emit('game_error', '還沒有輪到你落子喔！');
    }

    if (game.board[y][x] !== 0) {
      return socket.emit('game_error', '這個位置已經有棋子了！');
    }

    // 1 代表黑子，2 代表白子
    const pieceType = game.currentTurnIndex === 0 ? 1 : 2;
    game.board[y][x] = pieceType;

    // 檢查是否有玩家連成五子獲勝
    if (checkGomokuWin(game.board, x, y, pieceType)) {
      game.status = 'ended';
      game.winner = currentPlayer;
      io.to(`game_${gameId}`).emit('game_over', {
        winner: currentPlayer,
        board: game.board
      });
      delete activeGames[gameId]; // 結算後清除記憶體
      return;
    }

    // 切換至下一位玩家
    game.currentTurnIndex = (game.currentTurnIndex + 1) % game.players.length;

    // 廣播棋盤更新狀態
    io.to(`game_${gameId}`).emit('gomoku_updated', {
      board: game.board,
      currentTurnIndex: game.currentTurnIndex,
      lastMove: { x, y, pieceType }
    });
  });

  // ==========================================
  // B. 誰是臥底 (Who is the Spy) 發言與投票邏輯
  // ==========================================
  socket.on('spy_finish_description', (data) => {
    const { gameId } = data;
    const game = activeGames[gameId];

    if (!game || game.gameName !== '誰是臥底' || game.status !== 'playing') return;

    const currentPlayer = game.players[game.currentTurnIndex];
    if (currentPlayer.id !== socket.user.id) {
      return socket.emit('game_error', '非你的描述回合！');
    }

    // 尋找下一個未淘汰的發言人
    let nextIndex = game.currentTurnIndex;
    do {
      nextIndex = (nextIndex + 1) % game.players.length;
    } while (game.players[nextIndex].isEliminated && nextIndex !== game.currentTurnIndex);

    game.currentTurnIndex = nextIndex;
    game.descriptionCount += 1;
    
    const activePlayersCount = game.players.filter(p => !p.isEliminated).length;

    // 若每個人都描述完畢，則進入投票階段
    if (game.descriptionCount >= activePlayersCount) {
      game.stage = 'voting';
      io.to(`game_${gameId}`).emit('spy_enter_voting_stage', {
        players: game.players,
        message: "發言結束！請大家開始投票選出你認為的臥底！"
      });
    } else {
      io.to(`game_${gameId}`).emit('spy_next_description_turn', {
        currentTurnIndex: game.currentTurnIndex
      });
    }
  });

  // 接收玩家投票
  socket.on('spy_cast_vote', (data) => {
    const { gameId, targetUserId } = data; 
    const game = activeGames[gameId];

    if (!game || game.stage !== 'voting') return;

    game.votes[socket.user.id] = targetUserId;

    const activePlayers = game.players.filter(p => !p.isEliminated);
    const voteCount = Object.keys(game.votes).length;

    // 當所有存活玩家皆投票完畢，進行結算
    if (voteCount >= activePlayers.length) {
      processSpyVotingResult(io, gameId);
    } else {
      io.to(`game_${gameId}`).emit('spy_vote_received', {
        votedCount: voteCount,
        totalRequired: activePlayers.length
      });
    }
  });
}

// 初始化五子棋棋盤 (15x15 空白棋盤)
function setupGomoku(gameId, playerList) {
  const game = activeGames[gameId];
  game.board = Array.from({ length: 15 }, () => Array(15).fill(0));
  game.players = playerList.slice(0, 2); // 強制限雙人對弈
}

// 判定五子棋連線演算法 (橫、豎、斜、反斜)
function checkGomokuWin(board, x, y, pieceType) {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let [dx, dy] of directions) {
    let count = 1;
    let tx = x + dx;
    let ty = y + dy;
    while (tx >= 0 && tx < 15 && ty >= 0 && ty < 15 && board[ty][tx] === pieceType) {
      count++;
      tx += dx;
      ty += dy;
    }
    tx = x - dx;
    ty = y - dy;
    while (tx >= 0 && tx < 15 && ty >= 0 && ty < 15 && board[ty][tx] === pieceType) {
      count++;
      tx -= dx;
      ty -= dy;
    }
    if (count >= 5) return true; 
  }
  return false;
}

// 初始化誰是臥底
function setupWhoIsSpy(gameId, playerList) {
  const game = activeGames[gameId];
  
  // 1. 隨機抽選一組對立詞彙
  const randomIndex = Math.floor(Math.random() * WORD_LIBRARY.length);
  const selectedWordGroup = WORD_LIBRARY[randomIndex];

  // 2. 隨機挑選一名臥底
  const spyIndex = Math.floor(Math.random() * playerList.length);

  game.players = playerList.map((player, idx) => {
    const isSpy = idx === spyIndex;
    return {
      ...player,
      word: isSpy ? selectedWordGroup.spy : selectedWordGroup.civilian,
      isSpy: isSpy,
      isEliminated: false
    };
  });

  game.stage = 'description'; 
  game.descriptionCount = 0;
  game.votes = {}; 
}

// 誰是臥底 投票票數結算與勝負判定
function processSpyVotingResult(io, gameId) {
  const game = activeGames[gameId];
  if (!game) return;

  const voteTally = {};
  for (let voterId in game.votes) {
    const targetId = game.votes[voterId];
    voteTally[targetId] = (voteTally[targetId] || 0) + 1;
  }

  let maxVotes = -1;
  let eliminatedId = null;
  let isTie = false; 

  for (let targetId in voteTally) {
    if (voteTally[targetId] > maxVotes) {
      maxVotes = voteTally[targetId];
      eliminatedId = targetId;
      isTie = false;
    } else if (voteTally[targetId] === maxVotes) {
      isTie = true;
    }
  }

  game.votes = {}; // 清空本輪投票

  if (isTie) {
    game.stage = 'description';
    game.descriptionCount = 0;
    io.to(`game_${gameId}`).emit('spy_voting_tied', {
      message: "投票結果平手！未能淘汰任何人，請開始新一輪發言描述！"
    });
    return;
  }

  const eliminatedPlayer = game.players.find(p => p.id === eliminatedId);
  if (eliminatedPlayer) {
    eliminatedPlayer.isEliminated = true;
  }

  const survivors = game.players.filter(p => !p.isEliminated);
  const spiesCount = survivors.filter(p => p.isSpy).length;
  const civiliansCount = survivors.length - spiesCount;

  if (spiesCount === 0) {
    game.status = 'ended';
    io.to(`game_${gameId}`).emit('game_over', {
      winnerRole: 'civilian',
      message: "恭喜平民獲得勝利！所有臥底已被揪出！",
      players: game.players
    });
    delete activeGames[gameId];
  } else if (spiesCount >= civiliansCount) {
    game.status = 'ended';
    io.to(`game_${gameId}`).emit('game_over', {
      winnerRole: 'spy',
      message: "遊戲結束，臥底獲得了最終勝利！",
      players: game.players
    });
    delete activeGames[gameId];
  } else {
    game.stage = 'description';
    game.descriptionCount = 0;
    game.currentTurnIndex = game.players.findIndex(p => !p.isEliminated);

    io.to(`game_${gameId}`).emit('spy_player_eliminated', {
      eliminatedPlayer,
      players: game.players,
      nextTurnIndex: game.currentTurnIndex,
      message: `玩家 ${eliminatedPlayer.username} 被投票淘汰！遊戲繼續。`
    });
  }
}

module.exports = { initGameEngine };
