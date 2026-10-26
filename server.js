const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// 遊戲世界資料結構
const gameState = {
  players: {},
  monsters: {}
};

// 產生初始怪物
function spawnMonster(id, name, x, y, maxHp) {
  gameState.monsters[id] = {
    id,
    name,
    x,
    y,
    hp: maxHp,
    maxHp,
    targetPlayerId: null
  };
}

// 預設產生 4 隻史萊姆
for (let i = 1; i <= 4; i++) {
  spawnMonster(`mob_${i}`, '史萊姆', 4 + (i * 2), 4 + (i * 2), 50);
}

wss.on('connection', (ws) => {
  const playerId = 'player_' + Math.random().toString(36).substr(2, 6);
  
  // 網格座標 (Grid X, Grid Y)，預設在 (5, 5)
  gameState.players[playerId] = {
    id: playerId,
    name: '冒險者_' + playerId.slice(-3),
    x: 5,
    y: 5,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    atk: 12
  };

  // 發送初始世界狀態給該玩家
  ws.send(JSON.stringify({
    type: 'INIT',
    playerId,
    players: gameState.players,
    monsters: gameState.monsters
  }));

  // 廣播有新玩家登入
  broadcast({ type: 'PLAYER_JOINED', player: gameState.players[playerId] }, ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // 移動封包（接收網格座標）
      if (data.type === 'MOVE') {
        const player = gameState.players[playerId];
        if (player) {
          player.x = Math.max(0, Math.min(30, Math.round(data.x)));
          player.y = Math.max(0, Math.min(30, Math.round(data.y)));
          broadcast({ type: 'PLAYER_MOVED', playerId, x: player.x, y: player.y });
        }
      }

      // 攻擊怪物封包
      if (data.type === 'ATTACK_MOB') {
        const player = gameState.players[playerId];
        const mob = gameState.monsters[data.mobId];
        if (player && mob && mob.hp > 0) {
          // 距離檢驗（曼哈頓距離 <= 2 格才打得到）
          const dist = Math.abs(player.x - mob.x) + Math.abs(player.y - mob.y);
          if (dist <= 2) {
            const damage = Math.floor(player.atk * (0.8 + Math.random() * 0.4));
            mob.hp = Math.max(0, mob.hp - damage);

            broadcast({
              type: 'COMBAT_LOG',
              text: `${player.name} 對 【${mob.name}】 造成 ${damage} 點傷害！`,
              mobId: mob.id,
              damage,
              mobHp: mob.hp
            });

            // 怪物死亡
            if (mob.hp <= 0) {
              broadcast({ type: 'COMBAT_LOG', text: `【${mob.name}】 被擊敗了！` });
              // 3 秒後重生在隨機位置
              setTimeout(() => {
                mob.x = Math.floor(Math.random() * 12) + 2;
                mob.y = Math.floor(Math.random() * 12) + 2;
                mob.hp = mob.maxHp;
                broadcast({ type: 'MOB_RESPAWN', mob });
              }, 3000);
            }
          }
        }
      }
    } catch (err) {
      console.error('封包解析錯誤:', err);
    }
  });

  ws.on('close', () => {
    delete gameState.players[playerId];
    broadcast({ type: 'PLAYER_LEFT', playerId });
  });
});

function broadcast(data, exceptWs = null) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`MMO 伺服器啟動完成，監聽 Port: ${PORT}`);
});