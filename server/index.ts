import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import next from 'next';
import type { ClientToServerEvents, ServerToClientEvents, GameSettings, RolePool } from './types';
import * as store from './room-store';
import { GameManager } from './game-manager';
import { isCurrentIdentityWolf } from './victory-check';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// 初始化 Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);

  // 初始化 Socket.IO
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // 游戏管理器
  const gameManager = new GameManager(io);

  // Socket 连接映射 socketId -> playerId
  const socketToPlayer = new Map<string, { roomId: string; playerId: string }>();

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // 创建房间
    socket.on('create-room', ({ hostName, settings, customRoomId, rolePool }, callback) => {
      try {
        const { room, hostPlayer } = store.createRoom(hostName, settings, customRoomId, rolePool);
        hostPlayer.socketId = socket.id;
        
        socket.join(`room:${room.id}`);
        socketToPlayer.set(socket.id, { roomId: room.id, playerId: hostPlayer.id });

        console.log(`[Room] Created: ${room.id} by ${hostName}`);
        
        callback({ success: true, roomId: room.id, playerId: hostPlayer.id });
        
        // 发送完整房间状态
        socket.emit('room-state', store.serializeRoom(room, hostPlayer.id));
      } catch (error) {
        console.error('[Room] Create error:', error);
        callback({ success: false, error: error instanceof Error ? error.message : '创建房间失败' });
      }
    });

    // 加入房间
    socket.on('join-room', ({ roomId, playerName, playerId }, callback) => {
      try {
        const result = store.joinRoom(roomId.toUpperCase(), playerName, playerId);
        
        if (!result.success || !result.player || !result.room) {
          callback({ success: false, error: result.error });
          return;
        }

        result.player.socketId = socket.id;
        socket.join(`room:${result.room.id}`);
        socketToPlayer.set(socket.id, { roomId: result.room.id, playerId: result.player.id });

        console.log(`[Room] ${playerName} joined ${roomId}`);
        
        callback({ success: true, playerId: result.player.id });

        // 广播新玩家加入
        socket.to(`room:${result.room.id}`).emit('player-joined', 
          store.serializePlayer(result.player, result.room.hostId)
        );

        // 发送完整房间状态给新玩家
        socket.emit('room-state', store.serializeRoom(result.room, result.player.id));
      } catch (error) {
        console.error('[Room] Join error:', error);
        callback({ success: false, error: '加入房间失败' });
      }
    });

    // 断线重连
    socket.on('reconnect-room', ({ roomId, playerId }, callback) => {
      try {
        const room = store.getRoom(roomId);
        if (!room) {
          callback({ success: false, error: '房间不存在' });
          return;
        }

        const player = room.players.get(playerId);
        if (!player) {
          callback({ success: false, error: '玩家不存在' });
          return;
        }

        // 更新 socket 信息
        store.updatePlayerSocket(playerId, socket.id);
        socket.join(`room:${roomId}`);
        socketToPlayer.set(socket.id, { roomId, playerId });

        console.log(`[Room] ${player.name} reconnected to ${roomId}`);
        
        callback({ success: true });

        // 发送完整房间状态
        socket.emit('room-state', store.serializeRoom(room, playerId));

        // 如果房间正在进行夜晚阶段并且该玩家需要操作，重新发送操作提示
        if (room.phase === 'night') {
          const { currentSubPhase } = room.nightState;
          const alivePlayers = Array.from(room.players.values()).filter(p => {
            const p1Alive = p.identity1Alive;
            const p2Alive = p.identity2Alive;
            return p1Alive || p2Alive;
          });

          // 根据当前子阶段判断是否需要重新发送操作提示给该玩家
          let shouldSendPrompt = false;
          let actionPrompt = null;

          if (currentSubPhase === 'werewolf') {
            // player variable is defined earlier
            if (isCurrentIdentityWolf(player)) {
              shouldSendPrompt = true;
              const targets = alivePlayers.filter(p => !p.isWolfFaction);
              actionPrompt = {
                actionType: 'wolf-kill',
                options: targets.map(p => store.serializePlayer(p, room.hostId)),
              };
            }
          } else if (currentSubPhase === 'seer') {
            const currentIdentity = player.identity1Alive ? player.identity1 : player.identity2;
            if (currentIdentity?.type === 'seer') {
              shouldSendPrompt = true;
              const targets = alivePlayers.filter(p => p.id !== player.id);
              actionPrompt = {
                actionType: 'seer-check',
                options: targets.map(p => store.serializePlayer(p, room.hostId)),
              };
            }
          } else if (currentSubPhase === 'witch') {
            const currentIdentity = player.identity1Alive ? player.identity1 : player.identity2;
            if (currentIdentity?.type === 'witch') {
              shouldSendPrompt = true;
              const targets = alivePlayers.filter(p => p.id !== player.id);
              const wolfTarget = room.nightState.wolfTarget;
              const witchState = store.getWitchState(room, player.id);
              const canSaveSelf = room.nightState.nightNumber === 1;
              actionPrompt = {
                actionType: 'witch-action',
                options: targets.map(p => store.serializePlayer(p, room.hostId)),
                extraData: {
                  hasAntidote: witchState.hasAntidote,
                  hasPoison: witchState.hasPoison,
                  wolfTarget: (witchState.hasAntidote && wolfTarget && (canSaveSelf || wolfTarget !== player.id)) ? wolfTarget : null,
                  canSaveSelf,
                },
              };
            }
          } else if (currentSubPhase === 'guard') {
            const currentIdentity = player.identity1Alive ? player.identity1 : player.identity2;
            if (currentIdentity?.type === 'guard') {
              shouldSendPrompt = true;
              const targets = alivePlayers.filter(p => p.id !== room.nightState.lastGuardTarget);
              actionPrompt = {
                actionType: 'guard-protect',
                options: targets.map(p => store.serializePlayer(p, room.hostId)),
                extraData: {
                  lastTarget: room.nightState.lastGuardTarget,
                },
              };
            }
          }

          if (shouldSendPrompt && actionPrompt) {
            socket.emit('action-prompt', actionPrompt);
          }
        }
      } catch (error) {
        console.error('[Room] Reconnect error:', error);
        callback({ success: false, error: '重连失败' });
      }
    });

    // 更新设置（仅房主）
    socket.on('update-settings', (settings: Partial<GameSettings>) => {
      const mapping = socketToPlayer.get(socket.id);
      if (!mapping) return;

      const room = store.getRoom(mapping.roomId);
      if (!room || room.hostId !== mapping.playerId) return;
      if (room.phase !== 'waiting') return;

      store.updateRoomSettings(mapping.roomId, settings);
      io.to(`room:${room.id}`).emit('settings-updated', room.settings);
    });

    // 更新角色池（仅房主）
    socket.on('update-role-pool', (rolePool: RolePool) => {
      const mapping = socketToPlayer.get(socket.id);
      if (!mapping) return;

      const room = store.getRoom(mapping.roomId);
      if (!room || room.hostId !== mapping.playerId) return;
      if (room.phase !== 'waiting' && room.phase !== 'role-select') return;

      store.updateRolePool(mapping.roomId, rolePool);
      io.to(`room:${room.id}`).emit('role-pool-updated', room.rolePool, room.availableRoles);
    });

    // 选择角色
    socket.on('select-role', ({ identity, roleType }) => {
      const mapping = socketToPlayer.get(socket.id);
      if (!mapping) return;

      const room = store.getRoom(mapping.roomId);
      if (!room) return;
      if (room.phase !== 'waiting' && room.phase !== 'role-select') return;

      // 如果是第一个选择，将阶段改为 role-select
      if (room.phase === 'waiting') {
        room.phase = 'role-select';
        io.to(`room:${room.id}`).emit('phase-update', { phase: 'role-select' });
      }

      gameManager.selectRole(room, mapping.playerId, identity, roleType);
    });

    // 开始游戏（仅房主）
    socket.on('start-game', () => {
      const mapping = socketToPlayer.get(socket.id);
      if (!mapping) return;

      const room = store.getRoom(mapping.roomId);
      if (!room || room.hostId !== mapping.playerId) return;

      const result = gameManager.startGame(room);
      if (!result.success) {
        socket.emit('error', result.error || '无法开始游戏');
      }
    });

    // 提交行动
    socket.on('submit-action', ({ actionType, targetId, extraData }) => {
      const mapping = socketToPlayer.get(socket.id);
      if (!mapping) return;

      const room = store.getRoom(mapping.roomId);
      if (!room) return;

      if (room.phase === 'night') {
        gameManager.submitNightAction(room, mapping.playerId, actionType, targetId, extraData);
      } else if (actionType === 'hunter-shot' && targetId) {
        gameManager.hunterShot(room, mapping.playerId, targetId);
      }
    });

    // 投票
    socket.on('submit-vote', (targetId: string) => {
      const mapping = socketToPlayer.get(socket.id);
      if (!mapping) return;

      const room = store.getRoom(mapping.roomId);
      if (!room) return;

      gameManager.submitVote(room, mapping.playerId, targetId);
    });

    // 白狼王自爆
    socket.on('explode', (targetId: string) => {
      const mapping = socketToPlayer.get(socket.id);
      if (!mapping) return;

      const room = store.getRoom(mapping.roomId);
      if (!room) return;

      const success = gameManager.whiteWolfKingExplode(room, mapping.playerId, targetId);
      if (!success) {
        socket.emit('error', '无法自爆');
      }
    });

    // 房主结束发言计时
    socket.on('end-speech', () => {
      const mapping = socketToPlayer.get(socket.id);
      if (!mapping) return;
      const room = store.getRoom(mapping.roomId);
      if (!room) return;
      gameManager.endSpeech(room, mapping.playerId);
    });

    // 踢人（仅房主）
    socket.on('kick-player', (targetPlayerId: string) => {
      const mapping = socketToPlayer.get(socket.id);
      if (!mapping) return;

      const room = store.getRoom(mapping.roomId);
      if (!room || room.hostId !== mapping.playerId) return;
      if (room.phase !== 'waiting' && room.phase !== 'role-select') return;
      if (targetPlayerId === mapping.playerId) return; // 不能踢自己

      const targetPlayer = room.players.get(targetPlayerId);
      if (!targetPlayer) return;

      // 通知被踢玩家
      if (targetPlayer.socketId) {
        io.to(targetPlayer.socketId).emit('kicked');
        const targetSocket = io.sockets.sockets.get(targetPlayer.socketId);
        if (targetSocket) {
          targetSocket.leave(`room:${room.id}`);
        }
        socketToPlayer.delete(targetPlayer.socketId);
      }

      // 移除玩家
      const result = store.leaveRoom(targetPlayerId);
      if (result.room) {
        io.to(`room:${room.id}`).emit('player-left', targetPlayerId);
        // 广播更新后的房间状态
        for (const [pid, player] of room.players) {
          if (player.socketId) {
            io.to(player.socketId).emit('room-state', store.serializeRoom(room, pid));
          }
        }
      }
    });

    // 离开房间
    socket.on('leave-room', () => {
      handleDisconnect(socket.id);
    });

    // 断开连接
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id}, reason: ${reason}`);
      
      const mapping = socketToPlayer.get(socket.id);
      if (mapping) {
        const room = store.getRoom(mapping.roomId);
        if (room) {
          const player = room.players.get(mapping.playerId);
          if (player) {
            player.isOnline = false;
            player.socketId = null;
            // 不立即移除，等待重连
            io.to(`room:${room.id}`).emit('room-state', store.serializeRoom(room));
          }
        }
        socketToPlayer.delete(socket.id);
      }
    });
  });

  function handleDisconnect(socketId: string) {
    const mapping = socketToPlayer.get(socketId);
    if (!mapping) return;

    const result = store.leaveRoom(mapping.playerId);
    if (result.room) {
      io.to(`room:${result.roomId}`).emit('player-left', mapping.playerId);
      gameManager.clearRoomTimers(result.roomId!);
    }
    socketToPlayer.delete(socketId);
  }

  // Next.js 路由处理
  expressApp.all('*', (req, res) => {
    return handle(req, res);
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`> Port ${port} is in use, trying port ${port + 1}...`);
      httpServer.listen(port + 1, hostname);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  httpServer.listen(port, hostname, () => {
    const address = httpServer.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`> Ready on http://${hostname}:${actualPort}`);
    console.log(`> Socket.IO server running`);
  });
});
