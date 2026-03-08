'use client';

import { io, Socket } from 'socket.io-client';
import type { 
  SerializedRoom, SerializedPlayer, GameSettings, 
  RolePool, Role, GamePhase, NightSubPhase, GameRecap, RoleType 
} from './types';

// Socket 事件类型
interface ServerToClientEvents {
  'room-state': (room: SerializedRoom) => void;
  'player-joined': (player: SerializedPlayer) => void;
  'player-left': (playerId: string) => void;
  'role-pool-updated': (data: { rolePool: RolePool; availableRoles: Role[] }) => void;
  'role-selected': (data: { playerId: string; identity: 1 | 2; role: Role }) => void;
  'phase-update': (data: { phase: GamePhase; subPhase?: NightSubPhase; data?: unknown }) => void;
  'action-prompt': (data: { actionType: string; options: SerializedPlayer[]; extraData?: unknown }) => void;
  'action-result': (data: { result: string; extraData?: unknown }) => void;
  'action-submitted': (playerId: string) => void;
  'phase-complete': (group: string) => void;
  'death-event': (data: { playerId: string; identity: 1 | 2; message: string }) => void;
  'vote-update': (data: { votedCount: number; total: number }) => void;
  'explode-event': (data: { exploderId: string; targetId: string }) => void;
  'day-timer-update': (timeLeft: number) => void;
  'vote-timer-update': (timeLeft: number) => void;
  'game-end': (data: { winner: 'wolf' | 'good'; recap: GameRecap }) => void;
  'error': (message: string) => void;
  'kicked': () => void;
  'settings-updated': (settings: GameSettings) => void;
}

interface ClientToServerEvents {
  'create-room': (data: { hostName: string; settings?: Partial<GameSettings> }, callback: (response: { success: boolean; roomId?: string; playerId?: string; error?: string }) => void) => void;
  'join-room': (data: { roomId: string; playerName: string; playerId?: string }, callback: (response: { success: boolean; playerId?: string; error?: string }) => void) => void;
  'reconnect-room': (data: { roomId: string; playerId: string }, callback: (response: { success: boolean; error?: string }) => void) => void;
  'update-settings': (settings: Partial<GameSettings>) => void;
  'update-role-pool': (rolePool: RolePool) => void;
  'select-role': (data: { identity: 1 | 2; roleType: RoleType }) => void;
  'start-game': () => void;
  'submit-action': (data: { actionType: string; targetId?: string; extraData?: unknown }) => void;
  'submit-vote': (targetId: string) => void;
  'explode': (targetId: string) => void;
  'kick-player': (playerId: string) => void;
  'leave-room': () => void;
}

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

// 获取或创建 Socket 连接
export function getSocket(): TypedSocket {
  if (!socket) {
    const url = typeof window !== 'undefined' 
      ? window.location.origin 
      : 'http://localhost:3000';
    
    socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
    }) as TypedSocket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
    });
  }
  return socket;
}

// 断开连接
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// 创建房间
export function createRoom(hostName: string, settings?: Partial<GameSettings>, customRoomId?: string, rolePool?: RolePool): Promise<{ roomId: string; playerId: string }> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    s.emit('create-room', { hostName, settings, customRoomId, rolePool }, (response) => {
      if (response.success && response.roomId && response.playerId) {
        // 保存到本地存储
        saveSession(response.roomId, response.playerId);
        resolve({ roomId: response.roomId, playerId: response.playerId });
      } else {
        reject(new Error(response.error || '创建房间失败'));
      }
    });
  });
}

// 加入房间
export function joinRoom(roomId: string, playerName: string): Promise<{ playerId: string }> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    const existingPlayerId = getSession()?.playerId;
    
    s.emit('join-room', { roomId, playerName, playerId: existingPlayerId }, (response) => {
      if (response.success && response.playerId) {
        saveSession(roomId, response.playerId);
        resolve({ playerId: response.playerId });
      } else {
        reject(new Error(response.error || '加入房间失败'));
      }
    });
  });
}

// 断线重连
export function reconnectRoom(roomId: string, playerId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    s.emit('reconnect-room', { roomId, playerId }, (response) => {
      if (response.success) {
        resolve();
      } else {
        reject(new Error(response.error || '重连失败'));
      }
    });
  });
}

// 更新设置
export function updateSettings(settings: Partial<GameSettings>): void {
  getSocket().emit('update-settings', settings);
}

// 更新角色池
export function updateRolePool(rolePool: RolePool): void {
  getSocket().emit('update-role-pool', rolePool);
}

// 选择角色
export function selectRole(identity: 1 | 2, roleType: RoleType): void {
  getSocket().emit('select-role', { identity, roleType });
}

// 开始游戏
export function startGame(): void {
  getSocket().emit('start-game');
}

// 提交行动
export function submitAction(actionType: string, targetId?: string, extraData?: unknown): void {
  getSocket().emit('submit-action', { actionType, targetId, extraData });
}

// 投票
export function submitVote(targetId: string): void {
  getSocket().emit('submit-vote', targetId);
}

// 白狼王自爆
export function explode(targetId: string): void {
  getSocket().emit('explode', targetId);
}

// 踢人
export function kickPlayer(playerId: string): void {
  getSocket().emit('kick-player', playerId);
}

// 离开房间
export function leaveRoom(): void {
  getSocket().emit('leave-room');
  clearSession();
}

// 会话存储
const SESSION_KEY = 'werewolf_session';

interface Session {
  roomId: string;
  playerId: string;
  timestamp: number;
}

export function saveSession(roomId: string, playerId: string): void {
  const session: Session = { roomId, playerId, timestamp: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): Session | null {
  try {
    const data = localStorage.getItem(SESSION_KEY);
    if (!data) return null;
    
    const session: Session = JSON.parse(data);
    // 24小时过期
    if (Date.now() - session.timestamp > 24 * 60 * 60 * 1000) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// 事件监听器类型
export type SocketEventHandler<T extends keyof ServerToClientEvents> = ServerToClientEvents[T];

// 添加事件监听
export function onSocketEvent<T extends keyof ServerToClientEvents>(
  event: T,
  handler: ServerToClientEvents[T]
): () => void {
  const s = getSocket();
  s.on(event, handler as never);
  return () => s.off(event, handler as never);
}
