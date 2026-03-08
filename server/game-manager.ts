import type { Server, Socket } from 'socket.io';
import type { 
  Room, Player, GamePhase, NightSubPhase, Role, RoleType,
  DeathRecord, DeathCause, GameEvent, GameRecap, SerializedPlayer
} from './types';
import * as store from './room-store';
import { isWolfFaction, getCurrentIdentity, isPlayerOut, ROLES } from './roles';
import { 
  checkVictory, getAliveWolves, getAlivePlayers, 
  getAlivePlayersByRole, isCurrentIdentityWolf, isCurrentIdentityWhiteWolfKing 
} from './victory-check';

// 夜晚阶段顺序
const NIGHT_PHASES: NightSubPhase[] = ['werewolf', 'seer', 'witch', 'guard', 'settle'];

export class GameManager {
  private io: Server;
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(io: Server) {
    this.io = io;
  }

  // 获取房间的Socket Room名称
  private getRoomName(roomId: string): string {
    return `room:${roomId}`;
  }

  // 广播到房间
  private broadcastToRoom(roomId: string, event: string, data: unknown): void {
    this.io.to(this.getRoomName(roomId)).emit(event, data);
  }

  // 发送给特定玩家
  private sendToPlayer(room: Room, playerId: string, event: string, data: unknown): void {
    const player = room.players.get(playerId);
    if (player?.socketId) {
      this.io.to(player.socketId).emit(event, data);
    }
  }

  // 发送给房主
  private sendToHost(room: Room, event: string, data: unknown): void {
    this.sendToPlayer(room, room.hostId, event, data);
  }

  // 玩家选择角色
  selectRole(room: Room, playerId: string, identity: 1 | 2, roleType: RoleType): boolean {
    const player = room.players.get(playerId);
    if (!player) return false;

    // 检查角色是否可用
    const roleIndex = room.availableRoles.findIndex(r => r.type === roleType);
    if (roleIndex === -1) return false;

    // 获取角色并从可用列表移除
    const role = room.availableRoles.splice(roleIndex, 1)[0];

    // 如果玩家之前选过这个身份位，将旧角色放回
    const oldRole = identity === 1 ? player.identity1 : player.identity2;
    if (oldRole) {
      room.availableRoles.push(oldRole);
    }

    // 分配新角色
    if (identity === 1) {
      player.identity1 = role;
    } else {
      player.identity2 = role;
    }

    // 更新狼人阵营标记
    player.isWolfFaction = isWolfFaction(player.identity1, player.identity2);

    // 广播更新
    this.broadcastToRoom(room.id, 'role-selected', {
      playerId,
      identity,
      role,
    });

    this.broadcastToRoom(room.id, 'role-pool-updated', {
      rolePool: room.rolePool,
      availableRoles: room.availableRoles,
    });

    return true;
  }

  // 开始游戏
  startGame(room: Room): { success: boolean; error?: string } {
    // 检查所有玩家是否都选好了双身份
    for (const player of room.players.values()) {
      if (!player.identity1 || !player.identity2) {
        return { success: false, error: `玩家 ${player.name} 尚未选择完双身份` };
      }
    }

    // 初始化女巫状态
    for (const player of room.players.values()) {
      if (player.identity1?.type === 'witch' || player.identity2?.type === 'witch') {
        store.getWitchState(room, player.id);
      }
    }

    // 进入第一夜
    this.startNight(room);
    return { success: true };
  }

  // 开始夜晚
  private startNight(room: Room): void {
    room.phase = 'night';
    room.nightState.nightNumber++;
    room.nightState.currentSubPhase = 'werewolf';
    room.nightState.wolfTarget = null;
    room.nightState.wolfVotes.clear();
    room.nightState.seerTarget = null;
    room.nightState.witchSave = false;
    room.nightState.witchPoison = null;
    room.nightState.guardTarget = null;
    room.nightState.pendingDeaths = [];
    room.nightState.hunterTriggered = false;
    room.nightState.completedActions.clear();

    this.addGameEvent(room, {
      type: 'phase-change',
      message: `第 ${room.nightState.nightNumber} 夜开始`,
    });

    this.broadcastToRoom(room.id, 'phase-update', {
      phase: 'night',
      subPhase: 'werewolf',
      data: { nightNumber: room.nightState.nightNumber },
    });

    this.promptNightActions(room, 'werewolf');
  }

  // 提示夜晚行动
  private promptNightActions(room: Room, subPhase: NightSubPhase): void {
    room.nightState.currentSubPhase = subPhase;
    const alivePlayers = getAlivePlayers(room);
    const alivePlayerData = alivePlayers.map(p => store.serializePlayer(p, room.hostId));

    switch (subPhase) {
      case 'werewolf': {
        const wolves = getAliveWolves(room);
        if (wolves.length === 0) {
          this.advanceNightPhase(room);
          return;
        }
        for (const wolf of wolves) {
          // 狼人只能刀非狼人阵营玩家
          const targets = alivePlayers.filter(p => !p.isWolfFaction);
          this.sendToPlayer(room, wolf.id, 'action-prompt', {
            actionType: 'wolf-kill',
            options: targets.map(p => store.serializePlayer(p, room.hostId)),
          });
        }
        break;
      }

      case 'seer': {
        const seers = getAlivePlayersByRole(room, 'seer');
        if (seers.length === 0) {
          this.advanceNightPhase(room);
          return;
        }
        for (const seer of seers) {
          // 预言家可以查验任何其他存活玩家
          const targets = alivePlayers.filter(p => p.id !== seer.id);
          this.sendToPlayer(room, seer.id, 'action-prompt', {
            actionType: 'seer-check',
            options: targets.map(p => store.serializePlayer(p, room.hostId)),
          });
        }
        break;
      }

      case 'witch': {
        const witches = getAlivePlayersByRole(room, 'witch');
        if (witches.length === 0) {
          this.advanceNightPhase(room);
          return;
        }
        for (const witch of witches) {
          const witchState = store.getWitchState(room, witch.id);
          const wolfTarget = room.nightState.wolfTarget;
          
          // 首夜可自救
          const canSaveSelf = room.nightState.nightNumber === 1;
          const canSave = witchState.hasAntidote && wolfTarget && 
            (canSaveSelf || wolfTarget !== witch.id);

          this.sendToPlayer(room, witch.id, 'action-prompt', {
            actionType: 'witch-action',
            options: alivePlayers.filter(p => p.id !== witch.id).map(p => store.serializePlayer(p, room.hostId)),
            extraData: {
              hasAntidote: witchState.hasAntidote,
              hasPoison: witchState.hasPoison,
              wolfTarget: canSave ? wolfTarget : null,
              canSaveSelf,
            },
          });
        }
        break;
      }

      case 'guard': {
        const guards = getAlivePlayersByRole(room, 'guard');
        if (guards.length === 0) {
          this.advanceNightPhase(room);
          return;
        }
        for (const guard of guards) {
          // 守卫不能连续守同一人
          const targets = alivePlayers.filter(p => 
            p.id !== room.nightState.lastGuardTarget
          );
          this.sendToPlayer(room, guard.id, 'action-prompt', {
            actionType: 'guard-protect',
            options: targets.map(p => store.serializePlayer(p, room.hostId)),
            extraData: {
              lastTarget: room.nightState.lastGuardTarget,
            },
          });
        }
        break;
      }

      case 'settle':
        this.settleNight(room);
        break;
    }

    // 广播阶段更新
    this.broadcastToRoom(room.id, 'phase-update', {
      phase: 'night',
      subPhase,
      data: { nightNumber: room.nightState.nightNumber },
    });
  }

  // 提交夜晚行动
  submitNightAction(room: Room, playerId: string, actionType: string, targetId?: string, extraData?: unknown): void {
    const player = room.players.get(playerId);
    if (!player) return;

    switch (actionType) {
      case 'wolf-kill': {
        if (!isCurrentIdentityWolf(player)) return;
        if (targetId) {
          room.nightState.wolfVotes.set(playerId, targetId);
        }
        room.nightState.completedActions.add(playerId);
        
        // 检查是否所有狼人都投票了
        const wolves = getAliveWolves(room);
        const allVoted = wolves.every(w => room.nightState.completedActions.has(w.id));
        
        if (allVoted) {
          // 统计投票结果
          const voteCount = new Map<string, number>();
          for (const vote of room.nightState.wolfVotes.values()) {
            voteCount.set(vote, (voteCount.get(vote) || 0) + 1);
          }
          // 取票数最高
          let maxVotes = 0;
          let target: string | null = null;
          for (const [id, count] of voteCount) {
            if (count > maxVotes) {
              maxVotes = count;
              target = id;
            }
          }
          room.nightState.wolfTarget = target;
          
          this.sendToHost(room, 'phase-complete', '狼人组');
          this.advanceNightPhase(room);
        }
        break;
      }

      case 'seer-check': {
        const currentIdentity = getCurrentIdentity(player);
        if (currentIdentity?.type !== 'seer') return;
        
        room.nightState.seerTarget = targetId || null;
        room.nightState.completedActions.add(playerId);
        
        // 返回查验结果
        if (targetId) {
          const target = room.players.get(targetId);
          if (target) {
            const result = target.isWolfFaction ? '查杀' : '金水';
            this.sendToPlayer(room, playerId, 'action-result', {
              result,
              extraData: { targetId, targetName: target.name },
            });
            
            this.addGameEvent(room, {
              type: 'action',
              playerId,
              targetId,
              actionType: 'seer-check',
              result,
              message: `预言家查验了 ${target.name}`,
            });
          }
        }
        
        this.sendToHost(room, 'phase-complete', '预言家组');
        this.advanceNightPhase(room);
        break;
      }

      case 'witch-save': {
        const currentIdentity = getCurrentIdentity(player);
        if (currentIdentity?.type !== 'witch') return;
        
        const witchState = store.getWitchState(room, playerId);
        if (!witchState.hasAntidote) return;
        
        const saveTarget = extraData as boolean;
        if (saveTarget && room.nightState.wolfTarget) {
          room.nightState.witchSave = true;
          witchState.hasAntidote = false;
          
          this.addGameEvent(room, {
            type: 'action',
            playerId,
            actionType: 'witch-save',
            message: '女巫使用了解药',
          });
        }
        break;
      }

      case 'witch-skip-save': {
        // 女巫选择不救
        break;
      }

      case 'witch-poison': {
        const currentIdentity = getCurrentIdentity(player);
        if (currentIdentity?.type !== 'witch') return;
        
        const witchState = store.getWitchState(room, playerId);
        
        if (targetId) {
          if (!witchState.hasPoison) return;
          room.nightState.witchPoison = targetId;
          witchState.hasPoison = false;
          
          this.addGameEvent(room, {
            type: 'action',
            playerId,
            targetId,
            actionType: 'witch-poison',
            message: '女巫使用了毒药',
          });
        }
        
        // 女巫完成毒药步骤
        room.nightState.completedActions.add(playerId);
        this.sendToHost(room, 'phase-complete', '女巫组');
        this.advanceNightPhase(room);
        break;
      }

      case 'witch-skip-poison': {
        // 女巫选择不用毒药，标记完成
        room.nightState.completedActions.add(playerId);
        this.sendToHost(room, 'phase-complete', '女巫组');
        this.advanceNightPhase(room);
        break;
      }

      case 'witch-done': {
        room.nightState.completedActions.add(playerId);
        this.sendToHost(room, 'phase-complete', '女巫组');
        this.advanceNightPhase(room);
        break;
      }

      case 'guard-protect': {
        const currentIdentity = getCurrentIdentity(player);
        if (currentIdentity?.type !== 'guard') return;
        
        room.nightState.guardTarget = targetId || null;
        room.nightState.completedActions.add(playerId);
        
        if (targetId) {
          this.addGameEvent(room, {
            type: 'action',
            playerId,
            targetId,
            actionType: 'guard-protect',
            message: '守卫守护了一名玩家',
          });
        }
        
        this.sendToHost(room, 'phase-complete', '守卫组');
        this.advanceNightPhase(room);
        break;
      }

      case 'skip': {
        room.nightState.completedActions.add(playerId);
        // 检查当前阶段是否完成
        this.checkSubPhaseComplete(room);
        break;
      }
    }

    // 广播操作完成
    this.broadcastToRoom(room.id, 'action-submitted', playerId);
  }

  // 检查子阶段是否完成
  private checkSubPhaseComplete(room: Room): void {
    const subPhase = room.nightState.currentSubPhase;
    let allComplete = false;

    switch (subPhase) {
      case 'werewolf': {
        const wolves = getAliveWolves(room);
        allComplete = wolves.every(w => room.nightState.completedActions.has(w.id));
        break;
      }
      case 'seer': {
        const seers = getAlivePlayersByRole(room, 'seer');
        allComplete = seers.every(s => room.nightState.completedActions.has(s.id));
        break;
      }
      case 'witch': {
        const witches = getAlivePlayersByRole(room, 'witch');
        allComplete = witches.every(w => room.nightState.completedActions.has(w.id));
        break;
      }
      case 'guard': {
        const guards = getAlivePlayersByRole(room, 'guard');
        allComplete = guards.every(g => room.nightState.completedActions.has(g.id));
        break;
      }
    }

    if (allComplete) {
      this.advanceNightPhase(room);
    }
  }

  // 推进夜晚阶段
  private advanceNightPhase(room: Room): void {
    const currentIndex = NIGHT_PHASES.indexOf(room.nightState.currentSubPhase);
    const nextIndex = currentIndex + 1;

    if (nextIndex < NIGHT_PHASES.length) {
      this.promptNightActions(room, NIGHT_PHASES[nextIndex]);
    }
  }

  // 结算夜晚
  private settleNight(room: Room): void {
    const deaths: DeathRecord[] = [];
    const { wolfTarget, witchSave, witchPoison, guardTarget } = room.nightState;

    // 处理狼刀
    if (wolfTarget) {
      const isGuarded = guardTarget === wolfTarget;
      const isSaved = witchSave;
      
      // 如果被守或被救，不死
      if (!isGuarded && !isSaved) {
        this.killPlayerIdentity(room, wolfTarget, 'wolf-kill', deaths);
      }
    }

    // 处理女巫毒杀（毒杀无法被守卫抵消）
    if (witchPoison) {
      this.killPlayerIdentity(room, witchPoison, 'witch-poison', deaths);
    }

    // 更新上一夜守护目标
    room.nightState.lastGuardTarget = guardTarget;

    // 记录死亡
    room.deaths.push(...deaths);
    room.nightState.pendingDeaths = deaths.map(d => d.playerId);

    // 检查猎人触发
    const hunterDeath = deaths.find(d => {
      const player = room.players.get(d.playerId);
      if (!player) return false;
      
      // 检查死亡的身份是否为猎人，且不是被毒杀
      const deadIdentity = d.identity === 1 ? player.identity1 : player.identity2;
      return deadIdentity?.type === 'hunter' && d.cause !== 'witch-poison';
    });

    if (hunterDeath) {
      this.promptHunterShot(room, hunterDeath.playerId);
    } else {
      this.startDay(room, deaths);
    }
  }

  // 杀死玩家的一个身份
  private killPlayerIdentity(room: Room, playerId: string, cause: DeathCause, deaths: DeathRecord[]): void {
    const player = room.players.get(playerId);
    if (!player) return;

    // 先死第一身份，再死第二身份
    if (player.identity1Alive) {
      player.identity1Alive = false;
      deaths.push({ playerId, identity: 1, cause, nightNumber: room.nightState.nightNumber });
    } else if (player.identity2Alive) {
      player.identity2Alive = false;
      deaths.push({ playerId, identity: 2, cause, nightNumber: room.nightState.nightNumber });
    }
  }

  // 提示猎人开枪
  private promptHunterShot(room: Room, hunterId: string): void {
    room.nightState.hunterTriggered = true;
    const alivePlayers = getAlivePlayers(room).filter(p => p.id !== hunterId);
    
    this.sendToPlayer(room, hunterId, 'action-prompt', {
      actionType: 'hunter-shot',
      options: alivePlayers.map(p => store.serializePlayer(p, room.hostId)),
    });
  }

  // 猎人开枪
  hunterShot(room: Room, hunterId: string, targetId: string): void {
    const target = room.players.get(targetId);
    if (!target) return;

    const deaths: DeathRecord[] = [];
    this.killPlayerIdentity(room, targetId, 'hunter-shot', deaths);
    room.deaths.push(...deaths);

    this.addGameEvent(room, {
      type: 'death',
      playerId: targetId,
      actionType: 'hunter-shot',
      message: `猎人开枪带走了 ${target.seatNumber} 号`,
    });

    this.broadcastToRoom(room.id, 'death-event', {
      playerId: targetId,
      identity: deaths[0]?.identity || 1,
      message: `猎人开枪带走了【${target.seatNumber}号】`,
    });

    // 检查被枪杀者是否也是猎人
    const shotPlayerHunter = deaths.find(d => {
      const p = room.players.get(d.playerId);
      const deadIdentity = d.identity === 1 ? p?.identity1 : p?.identity2;
      return deadIdentity?.type === 'hunter';
    });

    if (shotPlayerHunter) {
      this.promptHunterShot(room, targetId);
    } else if (room.phase === 'night') {
      // 夜晚猎人开枪后进入白天
      this.startDay(room, room.deaths.filter(d => d.nightNumber === room.nightState.nightNumber));
    } else {
      // 白天猎人开枪后检查胜利
      const victory = checkVictory(room);
      if (victory.gameOver) {
        this.endGame(room, victory.winner!, victory.reason);
      } else {
        this.startNight(room);
      }
    }
  }

  // 开始白天
  private startDay(room: Room, nightDeaths: DeathRecord[]): void {
    room.phase = 'day-announce';
    
    this.addGameEvent(room, {
      type: 'phase-change',
      message: `天亮了`,
    });

    // 广播死亡公告
    for (const death of nightDeaths) {
      const player = room.players.get(death.playerId);
      if (player) {
        const message = death.identity === 1 
          ? `【${player.seatNumber}号】第一身份阵亡`
          : `【${player.seatNumber}号】出局`;
        
        this.broadcastToRoom(room.id, 'death-event', {
          playerId: death.playerId,
          identity: death.identity,
          message,
        });
      }
    }

    // 检查胜利条件
    const victory = checkVictory(room);
    if (victory.gameOver) {
      this.endGame(room, victory.winner!, victory.reason);
      return;
    }

    // 延迟后进入发言阶段
    setTimeout(() => {
      this.startSpeech(room);
    }, 3000);
  }

  // 开始发言阶段
  private startSpeech(room: Room): void {
    room.phase = 'day-speech';
    room.dayState.speechTimeLeft = room.settings.speechTime * 60;
    room.dayState.votingPhase = false;
    room.dayState.votes.clear();

    this.broadcastToRoom(room.id, 'phase-update', {
      phase: 'day-speech',
      data: { speechTimeLeft: room.dayState.speechTimeLeft },
    });

    // 启动发言倒计时
    this.startSpeechTimer(room);
  }

  // 发言倒计时
  private startSpeechTimer(room: Room): void {
    const timerId = `speech-${room.id}`;
    this.clearTimer(timerId);

    const timer = setInterval(() => {
      room.dayState.speechTimeLeft--;
      
      // 每5秒广播一次（减少网络负载）
      if (room.dayState.speechTimeLeft % 5 === 0 || room.dayState.speechTimeLeft <= 10) {
        this.broadcastToRoom(room.id, 'day-timer-update', room.dayState.speechTimeLeft);
      }

      if (room.dayState.speechTimeLeft <= 0) {
        this.clearTimer(timerId);
        this.startVoting(room);
      }
    }, 1000);

    this.timers.set(timerId, timer);
  }

  // 白狼王自爆
  whiteWolfKingExplode(room: Room, exploderId: string, targetId: string): boolean {
    const exploder = room.players.get(exploderId);
    if (!exploder || !isCurrentIdentityWhiteWolfKing(exploder)) return false;
    if (room.phase !== 'day-speech') return false;

    const target = room.players.get(targetId);
    if (!target || isPlayerOut(target)) return false;

    // 停止发言计时
    this.clearTimer(`speech-${room.id}`);

    // 双人出局
    const deaths: DeathRecord[] = [];
    this.killPlayerIdentity(room, exploderId, 'explode', deaths);
    this.killPlayerIdentity(room, targetId, 'explode', deaths);
    room.deaths.push(...deaths);

    this.addGameEvent(room, {
      type: 'explode',
      playerId: exploderId,
      targetId,
      message: `【${exploder.seatNumber}号】自爆，带走【${target.seatNumber}号】`,
    });

    this.broadcastToRoom(room.id, 'explode-event', {
      exploderId,
      targetId,
    });

    // 检查胜利条件
    const victory = checkVictory(room);
    if (victory.gameOver) {
      this.endGame(room, victory.winner!, victory.reason);
    } else {
      // 直接进入夜晚
      setTimeout(() => {
        this.startNight(room);
      }, 2000);
    }

    return true;
  }

  // 开始投票
  private startVoting(room: Room): void {
    room.phase = 'day-vote';
    room.dayState.votingPhase = true;
    room.dayState.voteTimeLeft = room.settings.voteTime;
    room.dayState.votes.clear();

    this.broadcastToRoom(room.id, 'phase-update', {
      phase: 'day-vote',
      data: { voteTimeLeft: room.dayState.voteTimeLeft },
    });

    if (room.settings.voteTime > 0) {
      this.startVoteTimer(room);
    }
  }

  // 投票倒计时
  private startVoteTimer(room: Room): void {
    const timerId = `vote-${room.id}`;
    this.clearTimer(timerId);

    const timer = setInterval(() => {
      room.dayState.voteTimeLeft--;
      
      if (room.dayState.voteTimeLeft % 5 === 0 || room.dayState.voteTimeLeft <= 10) {
        this.broadcastToRoom(room.id, 'vote-timer-update', room.dayState.voteTimeLeft);
      }

      if (room.dayState.voteTimeLeft <= 0) {
        this.clearTimer(timerId);
        this.settleVote(room);
      }
    }, 1000);

    this.timers.set(timerId, timer);
  }

  // 提交投票
  submitVote(room: Room, playerId: string, targetId: string): void {
    const player = room.players.get(playerId);
    if (!player || isPlayerOut(player)) return;
    if (room.phase !== 'day-vote') return;

    room.dayState.votes.set(playerId, targetId);

    const alivePlayers = getAlivePlayers(room);
    this.broadcastToRoom(room.id, 'vote-update', {
      votedCount: room.dayState.votes.size,
      total: alivePlayers.length,
    });

    // 检查是否所有人都投票了
    if (room.dayState.votes.size >= alivePlayers.length) {
      this.clearTimer(`vote-${room.id}`);
      this.settleVote(room);
    }
  }

  // 结算投票
  private settleVote(room: Room): void {
    const voteCount = new Map<string, number>();
    
    for (const targetId of room.dayState.votes.values()) {
      voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
    }

    // 找出最高票
    let maxVotes = 0;
    const topPlayers: string[] = [];
    
    for (const [playerId, count] of voteCount) {
      if (count > maxVotes) {
        maxVotes = count;
        topPlayers.length = 0;
        topPlayers.push(playerId);
      } else if (count === maxVotes) {
        topPlayers.push(playerId);
      }
    }

    // 平票或无人投票
    if (topPlayers.length !== 1 || maxVotes === 0) {
      this.addGameEvent(room, {
        type: 'vote',
        message: '平票，无人出局',
      });
      
      this.broadcastToRoom(room.id, 'death-event', {
        playerId: '',
        identity: 1,
        message: '平票，无人出局',
      });

      // 进入夜晚
      setTimeout(() => {
        this.startNight(room);
      }, 2000);
      return;
    }

    // 处决最高票玩家
    const outPlayerId = topPlayers[0];
    const outPlayer = room.players.get(outPlayerId);
    if (!outPlayer) return;

    const deaths: DeathRecord[] = [];
    this.killPlayerIdentity(room, outPlayerId, 'vote', deaths);
    room.deaths.push(...deaths);

    const message = deaths[0]?.identity === 1
      ? `【${outPlayer.seatNumber}号】第一身份阵亡`
      : `【${outPlayer.seatNumber}号】出局`;

    this.addGameEvent(room, {
      type: 'vote',
      playerId: outPlayerId,
      message: `投票出局：${outPlayer.seatNumber}号`,
    });

    this.broadcastToRoom(room.id, 'death-event', {
      playerId: outPlayerId,
      identity: deaths[0]?.identity || 1,
      message,
    });

    // 检查猎人触发（投票出局的猎人可以开枪）
    const isHunter = deaths.some(d => {
      const deadIdentity = d.identity === 1 ? outPlayer.identity1 : outPlayer.identity2;
      return deadIdentity?.type === 'hunter';
    });

    if (isHunter) {
      setTimeout(() => {
        this.promptHunterShot(room, outPlayerId);
      }, 1000);
      return;
    }

    // 检查胜利条件
    const victory = checkVictory(room);
    if (victory.gameOver) {
      this.endGame(room, victory.winner!, victory.reason);
    } else {
      // 进入夜晚
      setTimeout(() => {
        this.startNight(room);
      }, 2000);
    }
  }

  // 结束游戏
  private endGame(room: Room, winner: 'wolf' | 'good', reason?: string): void {
    room.phase = 'game-over';
    room.winner = winner;

    this.addGameEvent(room, {
      type: 'phase-change',
      message: reason || (winner === 'wolf' ? '狼人获胜！' : '好人获胜！'),
    });

    const recap: GameRecap = {
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        seatNumber: p.seatNumber,
        identity1: p.identity1,
        identity2: p.identity2,
        finalStatus: isPlayerOut(p) ? 'dead' : 'alive',
      })),
      timeline: room.gameHistory,
      winner,
      totalNights: room.nightState.nightNumber,
    };

    this.broadcastToRoom(room.id, 'game-end', { winner, recap });
  }

  // 添加游戏事件
  private addGameEvent(room: Room, event: Omit<GameEvent, 'timestamp' | 'phase' | 'nightNumber'>): void {
    room.gameHistory.push({
      ...event,
      timestamp: Date.now(),
      phase: room.phase,
      nightNumber: room.nightState.nightNumber,
    });
  }

  // 清除计时器
  private clearTimer(timerId: string): void {
    const timer = this.timers.get(timerId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(timerId);
    }
  }

  // 清除房间所有计时器
  clearRoomTimers(roomId: string): void {
    this.clearTimer(`speech-${roomId}`);
    this.clearTimer(`vote-${roomId}`);
  }
}
