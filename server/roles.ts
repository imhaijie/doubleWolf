import type { Role, RoleType, RolePool } from './types';

// 所有角色定义
export const ROLES: Record<RoleType, Role> = {
  werewolf: {
    id: 'werewolf',
    type: 'werewolf',
    name: '狼人',
    faction: 'wolf',
    isGod: false,
  },
  'white-wolf-king': {
    id: 'white-wolf-king',
    type: 'white-wolf-king',
    name: '白狼王',
    faction: 'wolf',
    isGod: true, // 白狼王算神职（影响胜利条件）
  },
  seer: {
    id: 'seer',
    type: 'seer',
    name: '预言家',
    faction: 'good',
    isGod: true,
  },
  witch: {
    id: 'witch',
    type: 'witch',
    name: '女巫',
    faction: 'good',
    isGod: true,
  },
  hunter: {
    id: 'hunter',
    type: 'hunter',
    name: '猎人',
    faction: 'good',
    isGod: true,
  },
  guard: {
    id: 'guard',
    type: 'guard',
    name: '守卫',
    faction: 'good',
    isGod: true,
  },
  villager: {
    id: 'villager',
    type: 'villager',
    name: '平民',
    faction: 'good',
    isGod: false,
  },
};

// 默认角色池配置（9人局）
export const DEFAULT_ROLE_POOL: RolePool = {
  werewolf: 2,
  'white-wolf-king': 1,
  seer: 1,
  witch: 1,
  hunter: 1,
  guard: 1,
  villager: 2,
};

// 预设模板
export const ROLE_PRESETS: Record<string, { name: string; pool: RolePool }> = {
  '9-standard': {
    name: '9人标准局',
    pool: {
      werewolf: 2,
      'white-wolf-king': 1,
      seer: 1,
      witch: 1,
      hunter: 1,
      guard: 1,
      villager: 2,
    },
  },
  '12-standard': {
    name: '12人标准局',
    pool: {
      werewolf: 3,
      'white-wolf-king': 1,
      seer: 1,
      witch: 1,
      hunter: 1,
      guard: 1,
      villager: 4,
    },
  },
};

// 根据角色池生成可选角色列表
export function generateAvailableRoles(rolePool: RolePool): Role[] {
  const roles: Role[] = [];
  for (const [roleType, count] of Object.entries(rolePool)) {
    const role = ROLES[roleType as RoleType];
    if (role && count > 0) {
      for (let i = 0; i < count; i++) {
        roles.push({ ...role, id: `${roleType}-${i}` });
      }
    }
  }
  return roles;
}

// 计算角色池总数
export function getRolePoolTotal(rolePool: RolePool): number {
  return Object.values(rolePool).reduce((sum, count) => sum + count, 0);
}

// 检查玩家是否属于狼人阵营
export function isWolfFaction(identity1: Role | null, identity2: Role | null): boolean {
  const wolfTypes: RoleType[] = ['werewolf', 'white-wolf-king'];
  return (
    (identity1 !== null && wolfTypes.includes(identity1.type)) ||
    (identity2 !== null && wolfTypes.includes(identity2.type))
  );
}

// 获取玩家当前生效身份
export function getCurrentIdentity(player: { 
  identity1: Role | null; 
  identity2: Role | null; 
  identity1Alive: boolean; 
  identity2Alive: boolean;
}): Role | null {
  if (player.identity1Alive && player.identity1) {
    return player.identity1;
  }
  if (player.identity2Alive && player.identity2) {
    return player.identity2;
  }
  return null;
}

// 检查玩家是否完全出局
export function isPlayerOut(player: { identity1Alive: boolean; identity2Alive: boolean }): boolean {
  return !player.identity1Alive && !player.identity2Alive;
}

// 检查角色是否为神职
export function isGodRole(role: Role | null): boolean {
  return role !== null && role.isGod;
}
