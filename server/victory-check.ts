import type { Room, Player, Role } from './types';
import { isPlayerOut, isGodRole, getCurrentIdentity } from './roles';

interface VictoryResult {
  gameOver: boolean;
  winner: 'wolf' | 'good' | null;
  reason?: string;
}

/**
 * 检查胜利条件
 * 
 * 好人胜利：所有狼人阵营玩家的双身份全部死亡
 * 狼人胜利（满足其一）：
 *   - 所有"金水宝宝"死亡（双身份均为平民的玩家）
 *   - 所有神职玩家死亡（任一身份为预言家/女巫/猎人/守卫/白狼王）
 */
export function checkVictory(room: Room): VictoryResult {
  const players = Array.from(room.players.values());
  
  // 统计各类玩家
  let aliveWolfFactionPlayers = 0;  // 存活的狼人阵营玩家（任一身份存活）
  let aliveGoldenBabies = 0;        // 存活的金水宝宝（双身份均为平民）
  let aliveGodPlayers = 0;          // 存活的神职玩家（任一身份为神）

  for (const player of players) {
    const isAlive = player.identity1Alive || player.identity2Alive;
    if (!isAlive) continue;

    // 检查是否狼人阵营
    if (player.isWolfFaction) {
      aliveWolfFactionPlayers++;
    }

    // 检查是否金水宝宝（双身份均为平民）
    if (isGoldenBaby(player)) {
      aliveGoldenBabies++;
    }

    // 检查是否神职玩家
    if (hasGodIdentity(player)) {
      aliveGodPlayers++;
    }
  }

  // 好人胜利：所有狼人阵营玩家的双身份全部死亡
  if (aliveWolfFactionPlayers === 0) {
    return {
      gameOver: true,
      winner: 'good',
      reason: '所有狼人阵营玩家已出局，好人获胜！',
    };
  }

  // 狼人胜利条件1：所有金水宝宝死亡
  if (aliveGoldenBabies === 0 && hasGoldenBabies(players)) {
    return {
      gameOver: true,
      winner: 'wolf',
      reason: '所有金水宝宝已出局，狼人获胜！',
    };
  }

  // 狼人胜利条件2：所有神职玩家死亡
  if (aliveGodPlayers === 0 && hasGodPlayers(players)) {
    return {
      gameOver: true,
      winner: 'wolf',
      reason: '所有神职玩家已出局，狼人获胜！',
    };
  }

  return { gameOver: false, winner: null };
}

/**
 * 检查玩家是否为金水宝宝（双身份均为平民）
 */
function isGoldenBaby(player: Player): boolean {
  return (
    player.identity1?.type === 'villager' &&
    player.identity2?.type === 'villager'
  );
}

/**
 * 检查玩家是否拥有神职身份（任一身份为神）
 */
function hasGodIdentity(player: Player): boolean {
  return isGodRole(player.identity1) || isGodRole(player.identity2);
}

/**
 * 检查游戏中是否存在金水宝宝
 */
function hasGoldenBabies(players: Player[]): boolean {
  return players.some(p => isGoldenBaby(p));
}

/**
 * 检查游戏中是否存在神职玩家
 */
function hasGodPlayers(players: Player[]): boolean {
  return players.some(p => hasGodIdentity(p));
}

/**
 * 获取存活的狼人阵营玩家（用于夜晚狼人阶段）
 */
export function getAliveWolves(room: Room): Player[] {
  return Array.from(room.players.values()).filter(p => {
    // 玩家必须存活且是狼人阵营
    if (!p.isWolfFaction) return false;
    if (isPlayerOut(p)) return false;
    
    // 检查当前生效身份是否为狼人
    const currentIdentity = getCurrentIdentity(p);
    return currentIdentity?.type === 'werewolf' || currentIdentity?.type === 'white-wolf-king';
  });
}

/**
 * 获取存活的指定角色玩家
 */
export function getAlivePlayersByRole(room: Room, roleType: string): Player[] {
  return Array.from(room.players.values()).filter(p => {
    if (isPlayerOut(p)) return false;
    
    // 使用 getCurrentIdentity 正确识别当前生效身份
    const currentIdentity = getCurrentIdentity(p);
    return currentIdentity?.type === roleType;
  });
}

/**
 * 获取所有存活玩家
 */
export function getAlivePlayers(room: Room): Player[] {
  return Array.from(room.players.values()).filter(p => !isPlayerOut(p));
}

/**
 * 检查玩家当前身份是否为狼人（用于狼人技能判断）
 */
export function isCurrentIdentityWolf(player: Player): boolean {
  if (isPlayerOut(player)) return false;
  
  const currentIdentity = getCurrentIdentity(player);
  return currentIdentity?.type === 'werewolf' || currentIdentity?.type === 'white-wolf-king';
}

/**
 * 检查玩家当前身份是否为白狼王
 */
export function isCurrentIdentityWhiteWolfKing(player: Player): boolean {
  if (isPlayerOut(player)) return false;
  
  const currentIdentity = player.identity1Alive ? player.identity1 : player.identity2;
  return currentIdentity?.type === 'white-wolf-king';
}
