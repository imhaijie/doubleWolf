// 重新导出服务端类型供客户端使用
export type RoleType = 
  | 'werewolf'
  | 'white-wolf-king'
  | 'seer'
  | 'witch'
  | 'hunter'
  | 'guard'
  | 'villager';

export interface Role {
  id: string;
  type: RoleType;
  name: string;
  faction: 'wolf' | 'good';
  isGod: boolean;
}

export type GamePhase = 
  | 'waiting'
  | 'role-select'
  | 'night'
  | 'day-announce'
  | 'day-speech'
  | 'day-vote'
  | 'game-over';

export type NightSubPhase = 
  | 'werewolf'
  | 'seer'
  | 'witch'
  | 'guard'
  | 'hunter'
  | 'settle';

export interface SerializedPlayer {
  id: string;
  name: string;
  seatNumber: number;
  identity1: Role | null;
  identity2: Role | null;
  identity1Alive: boolean;
  identity2Alive: boolean;
  isWolfFaction: boolean;
  isOnline: boolean;
  isHost: boolean;
}

export interface GameSettings {
  minPlayers: number;
  maxPlayers: number;
  speechTime: 5 | 10 | 15;
  voteTime: 60 | 120 | 0;
}

export interface RolePool {
  [key: string]: number;
}

export interface SerializedRoom {
  id: string;
  hostId: string;
  players: SerializedPlayer[];
  settings: GameSettings;
  rolePool: RolePool;
  availableRoles: Role[];
  phase: GamePhase;
  nightState?: {
    currentSubPhase: NightSubPhase;
    nightNumber: number;
    completedActions: string[];
  };
  dayState?: {
    speechTimeLeft: number;
    voteTimeLeft: number;
    votedCount: number;
    totalVoters: number;
    votingPhase: boolean;
  };
  winner: 'wolf' | 'good' | null;
  gameHistory?: GameEvent[]; // 事件时间轴，客户端用于回放/查看
}

export interface GameEvent {
  timestamp: number;
  phase: GamePhase;
  nightNumber?: number;
  type: 'action' | 'death' | 'vote' | 'explode' | 'phase-change';
  playerId?: string;
  targetId?: string;
  actionType?: string;
  result?: string;
  message: string;
}

export interface GameRecap {
  players: Array<{
    id: string;
    name: string;
    seatNumber: number;
    identity1: Role | null;
    identity2: Role | null;
    finalStatus: 'alive' | 'dead';
  }>;
  timeline: GameEvent[];
  winner: 'wolf' | 'good';
  totalNights: number;
}

// 角色显示信息
export const ROLE_DISPLAY: Record<RoleType, { name: string; color: string; icon: string }> = {
  werewolf: { name: '狼人', color: '#dc2626', icon: '🐺' },
  'white-wolf-king': { name: '白狼王', color: '#991b1b', icon: '👑' },
  seer: { name: '预言家', color: '#2563eb', icon: '🔮' },
  witch: { name: '女巫', color: '#7c3aed', icon: '🧙‍♀️' },
  hunter: { name: '猎人', color: '#ea580c', icon: '🏹' },
  guard: { name: '守卫', color: '#059669', icon: '🛡️' },
  villager: { name: '平民', color: '#64748b', icon: '👤' },
};

// 获取玩家当前生效身份
export function getCurrentIdentity(player: SerializedPlayer): Role | null {
  if (player.identity1Alive && player.identity1) {
    return player.identity1;
  }
  if (player.identity2Alive && player.identity2) {
    return player.identity2;
  }
  return null;
}

// 检查玩家是否完全出局
export function isPlayerOut(player: SerializedPlayer): boolean {
  return !player.identity1Alive && !player.identity2Alive;
}
