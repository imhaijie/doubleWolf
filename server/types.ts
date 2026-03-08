// 角色类型
export type RoleType = 
  | 'werewolf'      // 狼人
  | 'white-wolf-king' // 白狼王
  | 'seer'          // 预言家
  | 'witch'         // 女巫
  | 'hunter'        // 猎人
  | 'guard'         // 守卫
  | 'villager';     // 平民

// 角色定义
export interface Role {
  id: string;
  type: RoleType;
  name: string;
  faction: 'wolf' | 'good';
  isGod: boolean; // 是否为神职
}

// 角色池配置
export interface RolePool {
  [key: string]: number; // roleType -> count
}

// 游戏阶段
export type GamePhase = 
  | 'waiting'       // 等待开始
  | 'role-select'   // 角色选择
  | 'night'         // 夜晚
  | 'day-announce'  // 白天死亡公告
  | 'day-speech'    // 白天发言
  | 'day-vote'      // 白天投票
  | 'game-over';    // 游戏结束

// 夜晚子阶段
export type NightSubPhase = 
  | 'werewolf'      // 狼人行动
  | 'seer'          // 预言家行动
  | 'witch'         // 女巫行动
  | 'guard'         // 守卫行动
  | 'hunter'        // 猎人开枪（触发）
  | 'settle';       // 结算

// 玩家状态
export interface Player {
  id: string;
  name: string;
  socketId: string | null;
  seatNumber: number;
  identity1: Role | null;       // 第一身份
  identity2: Role | null;       // 第二身份
  identity1Alive: boolean;      // 第一身份存活
  identity2Alive: boolean;      // 第二身份存活
  isWolfFaction: boolean;       // 是否狼人阵营（永久）
  isOnline: boolean;
}

// 游戏设置
export interface GameSettings {
  minPlayers: number;
  maxPlayers: number;
  speechTime: 5 | 10 | 15;      // 发言时间（分钟）
  voteTime: 60 | 120 | 0;       // 投票时间（秒，0=无限）
}

// 女巫状态
export interface WitchState {
  hasAntidote: boolean;         // 是否有解药
  hasPoison: boolean;           // 是否有毒药
  antidoteUsedOnSelf: boolean;  // 解药是否用于自救（首夜可）
}

// 夜晚状态
export interface NightState {
  currentSubPhase: NightSubPhase;
  nightNumber: number;
  wolfTarget: string | null;           // 狼人刀的目标
  wolfVotes: Map<string, string>;      // 狼人投票 playerId -> targetId
  seerTarget: string | null;           // 预言家查验目标
  witchSave: boolean;                  // 女巫是否救人
  witchPoison: string | null;          // 女巫毒的目标
  guardTarget: string | null;          // 守卫守护目标
  lastGuardTarget: string | null;      // 上一夜守护目标（不可连守）
  pendingDeaths: string[];             // 待结算死亡
  hunterTriggered: boolean;            // 猎人是否触发
  completedActions: Set<string>;       // 已完成操作的玩家ID
}

// 白天状态
export interface DayState {
  speechTimeLeft: number;              // 发言剩余时间（秒）
  voteTimeLeft: number;                // 投票剩余时间（秒）
  votes: Map<string, string>;          // playerId -> targetId
  votingPhase: boolean;                // 是否投票阶段
}

// 游戏事件（用于复盘）
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

// 死亡原因
export type DeathCause = 
  | 'wolf-kill'     // 狼杀
  | 'witch-poison'  // 女巫毒杀
  | 'vote'          // 投票出局
  | 'hunter-shot'   // 猎人枪杀
  | 'explode';      // 白狼王自爆

// 死亡记录
export interface DeathRecord {
  playerId: string;
  identity: 1 | 2;              // 死亡的是第几身份
  cause: DeathCause;
  nightNumber?: number;
}

// 房间状态
export interface Room {
  id: string;
  hostId: string;
  players: Map<string, Player>;
  settings: GameSettings;
  rolePool: RolePool;
  availableRoles: Role[];       // 可选角色列表
  phase: GamePhase;
  nightState: NightState;
  dayState: DayState;
  witchStates: Map<string, WitchState>; // playerId -> WitchState
  gameHistory: GameEvent[];
  deaths: DeathRecord[];
  winner: 'wolf' | 'good' | null;
  createdAt: number;
  lastActivity: number;
}

// Socket 事件类型
export interface ServerToClientEvents {
  'room-state': (room: SerializedRoom) => void;
  'player-joined': (player: SerializedPlayer) => void;
  'player-left': (playerId: string) => void;
  'role-pool-updated': (rolePool: RolePool, availableRoles: Role[]) => void;
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

export interface ClientToServerEvents {
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

// 序列化类型（用于传输）
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
}

// 游戏复盘数据
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
