'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  getSocket, onSocketEvent, getSession, reconnectRoom, saveSession 
} from '@/lib/socket';
import type { 
  SerializedRoom, SerializedPlayer, GamePhase, NightSubPhase,
  GameRecap, Role, RolePool, GameSettings
} from '@/lib/types';

// 操作提示数据
interface ActionPrompt {
  actionType: string;
  options: SerializedPlayer[];
  extraData?: unknown;
}

// 死亡事件
interface DeathEvent {
  playerId: string;
  identity: 1 | 2;
  message: string;
  timestamp: number;
}

// 游戏状态
export interface GameState {
  // 连接状态
  isConnected: boolean;
  isReconnecting: boolean;
  
  // 房间状态
  room: SerializedRoom | null;
  currentPlayer: SerializedPlayer | null;
  
  // 游戏进行状态
  currentPhase: GamePhase;
  nightSubPhase: NightSubPhase | null;
  nightNumber: number;
  
  // 操作状态
  actionPrompt: ActionPrompt | null;
  actionResult: { result: string; extraData?: unknown } | null;
  hasSubmittedAction: boolean;
  
  // 白天状态
  speechTimeLeft: number;
  voteTimeLeft: number;
  votedCount: number;
  totalVoters: number;
  hasVoted: boolean;
  
  // 死亡公告
  deathEvents: DeathEvent[];
  
  // 游戏结束
  gameOver: boolean;
  winner: 'wolf' | 'good' | null;
  recap: GameRecap | null;
  
  // 错误
  error: string | null;
  
  // 被踢出
  kicked: boolean;
}

const initialState: GameState = {
  isConnected: false,
  isReconnecting: false,
  room: null,
  currentPlayer: null,
  currentPhase: 'waiting',
  nightSubPhase: null,
  nightNumber: 0,
  actionPrompt: null,
  actionResult: null,
  hasSubmittedAction: false,
  speechTimeLeft: 0,
  voteTimeLeft: 0,
  votedCount: 0,
  totalVoters: 0,
  hasVoted: false,
  deathEvents: [],
  gameOver: false,
  winner: null,
  recap: null,
  error: null,
  kicked: false,
};

export function useGameState(roomId?: string) {
  const [state, setState] = useState<GameState>(initialState);
  const playerIdRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);

  // 更新部分状态
  const updateState = useCallback((updates: Partial<GameState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // 处理房间状态更新
  const handleRoomState = useCallback((room: SerializedRoom) => {
    const playerId = playerIdRef.current;
    const currentPlayer = playerId 
      ? room.players.find(p => p.id === playerId) || null 
      : null;

    updateState({
      room,
      currentPlayer,
      currentPhase: room.phase,
      nightSubPhase: room.nightState?.currentSubPhase || null,
      nightNumber: room.nightState?.nightNumber || 0,
      speechTimeLeft: room.dayState?.speechTimeLeft || 0,
      voteTimeLeft: room.dayState?.voteTimeLeft || 0,
      votedCount: room.dayState?.votedCount || 0,
      totalVoters: room.dayState?.totalVoters || 0,
      gameOver: room.phase === 'game-over',
      winner: room.winner,
      isReconnecting: false,
      // 重置操作状态
      hasSubmittedAction: room.nightState?.completedActions.includes(playerId || '') || false,
    });
  }, [updateState]);

  // 初始化 Socket 监听
  useEffect(() => {
    const socket = getSocket();
    const cleanups: (() => void)[] = [];

    // 连接状态
    const onConnect = () => {
      updateState({ isConnected: true, error: null });
      
      // 尝试重连房间
      const session = getSession();
      if (session && roomId && session.roomId === roomId) {
        playerIdRef.current = session.playerId;
        updateState({ isReconnecting: true });
        reconnectRoom(roomId, session.playerId)
          .then(() => {
            reconnectAttemptRef.current = 0;
          })
          .catch((err) => {
            console.error('[GameState] Reconnect failed:', err);
            if (reconnectAttemptRef.current < 3) {
              reconnectAttemptRef.current++;
            } else {
              updateState({ isReconnecting: false, error: '重连失败，请刷新页面' });
            }
          });
      }
    };

    const onDisconnect = () => {
      updateState({ isConnected: false });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    cleanups.push(() => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    });

    // 如果已连接，触发连接逻辑
    if (socket.connected) {
      onConnect();
    }

    // 房间状态
    cleanups.push(onSocketEvent('room-state', handleRoomState));

    // 玩家加入/离开
    cleanups.push(onSocketEvent('player-joined', (player) => {
      setState(prev => {
        if (!prev.room) return prev;
        const players = [...prev.room.players, player];
        return { ...prev, room: { ...prev.room, players } };
      });
    }));

    cleanups.push(onSocketEvent('player-left', (playerId) => {
      setState(prev => {
        if (!prev.room) return prev;
        const players = prev.room.players.filter(p => p.id !== playerId);
        return { ...prev, room: { ...prev.room, players } };
      });
    }));

    // 角色池更新
    cleanups.push(onSocketEvent('role-pool-updated', ({ rolePool, availableRoles }) => {
      setState(prev => {
        if (!prev.room) return prev;
        return { ...prev, room: { ...prev.room, rolePool, availableRoles: availableRoles || [] } };
      });
    }));

    // 角色选择
    cleanups.push(onSocketEvent('role-selected', ({ playerId, identity, role }) => {
      setState(prev => {
        if (!prev.room) return prev;
        const players = prev.room.players.map(p => {
          if (p.id !== playerId) return p;
          if (identity === 1) {
            return { ...p, identity1: role };
          } else {
            return { ...p, identity2: role };
          }
        });
        const currentPlayer = players.find(p => p.id === playerIdRef.current) || null;
        return { ...prev, room: { ...prev.room, players }, currentPlayer };
      });
    }));

    // 阶段更新
    cleanups.push(onSocketEvent('phase-update', ({ phase, subPhase, data }) => {
      updateState({
        currentPhase: phase,
        nightSubPhase: subPhase || null,
        nightNumber: (data as { nightNumber?: number })?.nightNumber || state.nightNumber,
        hasSubmittedAction: false,
        actionPrompt: null,
        actionResult: null,
        hasVoted: false,
      });
    }));

    // 操作提示
    cleanups.push(onSocketEvent('action-prompt', (prompt) => {
      updateState({ actionPrompt: prompt, hasSubmittedAction: false });
    }));

    // 操作结果
    cleanups.push(onSocketEvent('action-result', (result) => {
      updateState({ actionResult: result });
    }));

    // 操作已提交
    cleanups.push(onSocketEvent('action-submitted', (submittedPlayerId) => {
      if (submittedPlayerId === playerIdRef.current) {
        updateState({ hasSubmittedAction: true });
      }
    }));

    // 房主通知（仅房主）
    cleanups.push(onSocketEvent('phase-complete', (group) => {
      // 播放提示音
      if (typeof window !== 'undefined' && state.currentPlayer?.isHost) {
        const audio = new Audio('/notification.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      }
    }));

    // 死亡事件
    cleanups.push(onSocketEvent('death-event', (event) => {
      const deathEvent: DeathEvent = { ...event, timestamp: Date.now() };
      setState(prev => ({
        ...prev,
        deathEvents: [...prev.deathEvents, deathEvent],
      }));
      
      // 3秒后移除
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          deathEvents: prev.deathEvents.filter(e => e.timestamp !== deathEvent.timestamp),
        }));
      }, 3000);
    }));

    // 投票更新
    cleanups.push(onSocketEvent('vote-update', ({ votedCount, total }) => {
      updateState({ votedCount, totalVoters: total });
    }));

    // 自爆事件
    cleanups.push(onSocketEvent('explode-event', ({ exploderId, targetId }) => {
      // 处理自爆动画等
    }));

    // 发言计时
    cleanups.push(onSocketEvent('day-timer-update', (timeLeft) => {
      updateState({ speechTimeLeft: timeLeft });
    }));

    // 投票计时
    cleanups.push(onSocketEvent('vote-timer-update', (timeLeft) => {
      updateState({ voteTimeLeft: timeLeft });
    }));

    // 游戏结束
    cleanups.push(onSocketEvent('game-end', ({ winner, recap }) => {
      updateState({
        gameOver: true,
        winner,
        recap,
        currentPhase: 'game-over',
      });
    }));

    // 错误
    cleanups.push(onSocketEvent('error', (message) => {
      updateState({ error: message });
      setTimeout(() => updateState({ error: null }), 3000);
    }));

    // 被踢出
    cleanups.push(onSocketEvent('kicked', () => {
      updateState({ kicked: true });
    }));

    // 设置更新
    cleanups.push(onSocketEvent('settings-updated', (settings) => {
      setState(prev => {
        if (!prev.room) return prev;
        return { ...prev, room: { ...prev.room, settings } };
      });
    }));

    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, [roomId, handleRoomState, updateState]);

  // 设置玩家 ID
  const setPlayerId = useCallback((playerId: string) => {
    playerIdRef.current = playerId;
  }, []);

  // 标记已投票
  const markVoted = useCallback(() => {
    updateState({ hasVoted: true });
  }, [updateState]);

  return {
    ...state,
    setPlayerId,
    markVoted,
  };
}
