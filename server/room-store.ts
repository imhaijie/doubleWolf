import type { Room, Player, GameSettings, RolePool, NightState, DayState, GamePhase, Role, SerializedRoom, SerializedPlayer, WitchState } from './types';
import { DEFAULT_ROLE_POOL, generateAvailableRoles } from './roles';

// 内存存储
const rooms = new Map<string, Room>();
const playerToRoom = new Map<string, string>(); // playerId -> roomId

// 生成6位房间码
function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成玩家ID
function generatePlayerId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// 默认游戏设置
const defaultSettings: GameSettings = {
  minPlayers: 6,
  maxPlayers: 16,
  speechTime: 10,
  voteTime: 120,
};

// 创建空夜晚状态
function createNightState(): NightState {
  return {
    currentSubPhase: 'werewolf',
    nightNumber: 0,
    wolfTarget: null,
    wolfVotes: new Map(),
    seerTarget: null,
    witchSave: false,
    witchPoison: null,
    guardTarget: null,
    lastGuardTarget: null,
    pendingDeaths: [],
    hunterTriggered: false,
    completedActions: new Set(),
  };
}

// 创建空白天状态
function createDayState(speechTime: number): DayState {
  return {
    speechTimeLeft: speechTime * 60, // 转换为秒
    voteTimeLeft: 0,
    votes: new Map(),
    votingPhase: false,
  };
}

// 创建房间
export function createRoom(hostName: string, settings?: Partial<GameSettings>, customRoomId?: string, rolePool?: RolePool): { room: Room; hostPlayer: Player } {
  let roomId: string;
  
  if (customRoomId) {
    // 验证自定义房间号格式
    if (!/^[A-Z0-9]{6}$/.test(customRoomId)) {
      throw new Error('房间号必须是6位字母数字组合');
    }
    // 检查房间号是否已被使用
    if (rooms.has(customRoomId)) {
      throw new Error('房间号已被使用，请选择其他房间号');
    }
    roomId = customRoomId;
  } else {
    // 自动生成房间号
    roomId = generateRoomId();
    // 确保房间ID唯一
    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }
  }

  const hostId = generatePlayerId();
  const mergedSettings = { ...defaultSettings, ...settings };
  const mergedRolePool = rolePool ? { ...rolePool } : { ...DEFAULT_ROLE_POOL };

  // 自动调整最少人数为角色总数的一半向上取整
  const totalRoles = Object.values(mergedRolePool).reduce((sum, count) => sum + count, 0);
  mergedSettings.minPlayers = Math.ceil(totalRoles / 2);
  // 确保 maxPlayers 不小于 minPlayers
  if (mergedSettings.maxPlayers < mergedSettings.minPlayers) {
    mergedSettings.maxPlayers = mergedSettings.minPlayers;
  }

  const hostPlayer: Player = {
    id: hostId,
    name: hostName,
    socketId: null,
    seatNumber: 1,
    identity1: null,
    identity2: null,
    identity1Alive: true,
    identity2Alive: true,
    isWolfFaction: false,
    isOnline: true,
  };

  const room: Room = {
    id: roomId,
    hostId,
    players: new Map([[hostId, hostPlayer]]),
    settings: mergedSettings,
    rolePool: mergedRolePool,
    availableRoles: generateAvailableRoles(mergedRolePool),
    phase: 'waiting',
    nightState: createNightState(),
    dayState: createDayState(mergedSettings.speechTime),
    witchStates: new Map(),
    gameHistory: [],
    deaths: [],
    winner: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  rooms.set(roomId, room);
  playerToRoom.set(hostId, roomId);

  return { room, hostPlayer };
}

// 加入房间
export function joinRoom(roomId: string, playerName: string, existingPlayerId?: string): { success: boolean; player?: Player; room?: Room; error?: string } {
  const room = rooms.get(roomId);
  if (!room) {
    return { success: false, error: '房间不存在' };
  }

  // 断线重连
  if (existingPlayerId && room.players.has(existingPlayerId)) {
    const player = room.players.get(existingPlayerId)!;
    player.isOnline = true;
    room.lastActivity = Date.now();
    return { success: true, player, room };
  }

  // 检查人数限制
  if (room.players.size >= room.settings.maxPlayers) {
    return { success: false, error: '房间已满' };
  }

  // 检查游戏是否已开始
  if (room.phase !== 'waiting' && room.phase !== 'role-select') {
    return { success: false, error: '游戏已开始，无法加入' };
  }

  const playerId = generatePlayerId();
  const seatNumber = room.players.size + 1;

  const player: Player = {
    id: playerId,
    name: playerName,
    socketId: null,
    seatNumber,
    identity1: null,
    identity2: null,
    identity1Alive: true,
    identity2Alive: true,
    isWolfFaction: false,
    isOnline: true,
  };

  room.players.set(playerId, player);
  playerToRoom.set(playerId, roomId);
  room.lastActivity = Date.now();

  return { success: true, player, room };
}

// 离开房间
export function leaveRoom(playerId: string): { roomId?: string; room?: Room } {
  const roomId = playerToRoom.get(playerId);
  if (!roomId) return {};

  const room = rooms.get(roomId);
  if (!room) {
    playerToRoom.delete(playerId);
    return {};
  }

  room.players.delete(playerId);
  playerToRoom.delete(playerId);
  room.lastActivity = Date.now();

  // 如果房间没人了，删除房间
  if (room.players.size === 0) {
    rooms.delete(roomId);
    return { roomId };
  }

  // 如果离开的是房主，转移房主
  if (room.hostId === playerId) {
    const newHost = room.players.values().next().value;
    if (newHost) {
      room.hostId = newHost.id;
    }
  }

  // 重新分配座位号
  let seat = 1;
  for (const player of room.players.values()) {
    player.seatNumber = seat++;
  }

  return { roomId, room };
}

// 获取房间
export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

// 获取玩家所在房间
export function getPlayerRoom(playerId: string): Room | undefined {
  const roomId = playerToRoom.get(playerId);
  if (!roomId) return undefined;
  return rooms.get(roomId);
}

// 更新玩家Socket ID
export function updatePlayerSocket(playerId: string, socketId: string | null): void {
  const room = getPlayerRoom(playerId);
  if (!room) return;
  
  const player = room.players.get(playerId);
  if (player) {
    player.socketId = socketId;
    player.isOnline = socketId !== null;
    room.lastActivity = Date.now();
  }
}

// 更新房间设置
export function updateRoomSettings(roomId: string, settings: Partial<GameSettings>): Room | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  room.settings = { ...room.settings, ...settings };
  room.dayState.speechTimeLeft = room.settings.speechTime * 60;
  room.lastActivity = Date.now();
  return room;
}

// 更新角色池
export function updateRolePool(roomId: string, rolePool: RolePool): Room | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  room.rolePool = rolePool;
  room.availableRoles = generateAvailableRoles(rolePool);
  room.lastActivity = Date.now();
  return room;
}

// 序列化玩家（用于传输）
export function serializePlayer(player: Player, hostId: string): SerializedPlayer {
  return {
    id: player.id,
    name: player.name,
    seatNumber: player.seatNumber,
    identity1: player.identity1,
    identity2: player.identity2,
    identity1Alive: player.identity1Alive,
    identity2Alive: player.identity2Alive,
    isWolfFaction: player.isWolfFaction,
    isOnline: player.isOnline,
    isHost: player.id === hostId,
  };
}

// 序列化房间（用于传输，隐藏敏感信息）
export function serializeRoom(room: Room, forPlayerId?: string): SerializedRoom {
  const players = Array.from(room.players.values()).map(p => {
    const serialized = serializePlayer(p, room.hostId);
    // 游戏中隐藏其他玩家的身份
    if (room.phase !== 'waiting' && room.phase !== 'role-select' && room.phase !== 'game-over' && p.id !== forPlayerId) {
      return {
        ...serialized,
        identity1: null,
        identity2: null,
        isWolfFaction: false, // 隐藏阵营
      };
    }
    return serialized;
  });

  // 计算可投票人数
  const alivePlayers = Array.from(room.players.values()).filter(
    p => p.identity1Alive || p.identity2Alive
  );

  return {
    id: room.id,
    hostId: room.hostId,
    players,
    settings: room.settings,
    rolePool: room.rolePool,
    availableRoles: room.availableRoles,
    phase: room.phase,
    nightState: room.phase === 'night' ? {
      currentSubPhase: room.nightState.currentSubPhase,
      nightNumber: room.nightState.nightNumber,
      completedActions: Array.from(room.nightState.completedActions),
    } : undefined,
    dayState: (room.phase === 'day-speech' || room.phase === 'day-vote') ? {
      speechTimeLeft: room.dayState.speechTimeLeft,
      voteTimeLeft: room.dayState.voteTimeLeft,
      votedCount: room.dayState.votes.size,
      totalVoters: alivePlayers.length,
      votingPhase: room.dayState.votingPhase,
    } : undefined,
    winner: room.winner,
  };
}

// 获取女巫状态
export function getWitchState(room: Room, playerId: string): WitchState {
  let state = room.witchStates.get(playerId);
  if (!state) {
    state = {
      hasAntidote: true,
      hasPoison: true,
      antidoteUsedOnSelf: false,
    };
    room.witchStates.set(playerId, state);
  }
  return state;
}

// 重置房间为等待状态
export function resetRoom(roomId: string): Room | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  room.phase = 'waiting';
  room.nightState = createNightState();
  room.dayState = createDayState(room.settings.speechTime);
  room.witchStates.clear();
  room.gameHistory = [];
  room.deaths = [];
  room.winner = null;
  room.availableRoles = generateAvailableRoles(room.rolePool);

  // 重置玩家状态
  for (const player of room.players.values()) {
    player.identity1 = null;
    player.identity2 = null;
    player.identity1Alive = true;
    player.identity2Alive = true;
    player.isWolfFaction = false;
  }

  room.lastActivity = Date.now();
  return room;
}

// 清理过期房间（24小时无活动）
export function cleanupExpiredRooms(): number {
  const now = Date.now();
  const expireTime = 24 * 60 * 60 * 1000; // 24小时
  let cleaned = 0;

  for (const [roomId, room] of rooms) {
    if (now - room.lastActivity > expireTime) {
      // 清理玩家映射
      for (const playerId of room.players.keys()) {
        playerToRoom.delete(playerId);
      }
      rooms.delete(roomId);
      cleaned++;
    }
  }

  return cleaned;
}

// 定期清理（每小时执行一次）
setInterval(() => {
  const cleaned = cleanupExpiredRooms();
  if (cleaned > 0) {
    console.log(`[RoomStore] Cleaned ${cleaned} expired rooms`);
  }
}, 60 * 60 * 1000);
