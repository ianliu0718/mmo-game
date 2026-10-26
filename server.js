const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 託管 public 資料夾內的靜態資源
app.use(express.static(path.join(__dirname, 'public')));

// 儲存玩家狀態
const players = {};

wss.on('connection', (ws) => {
  const playerId = 'player_' + Math.random().toString(36).substr(2, 9);
  players[playerId] = { id: playerId, x: 150, y: 150 };

  // 回傳初始狀態
  ws.send(JSON.stringify({ type: 'INIT', playerId, players }));

  // 通知其他玩家
  broadcast({ type: 'PLAYER_JOINED', player: players[playerId] }, ws);

  // 接收玩家移動封包
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'MOVE') {
        if (players[playerId]) {
          players[playerId].x = data.x;
          players[playerId].y = data.y;
          broadcast({ type: 'PLAYER_MOVED', playerId, x: data.x, y: data.y });
        }
      }
    } catch (err) {
      console.error('封包解析失敗:', err);
    }
  });

  // 離線處理
  ws.on('close', () => {
    delete players[playerId];
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

// 綁定 Render 指派的 PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`MMO 伺服器啟動完成，監聽 Port: ${PORT}`);
});