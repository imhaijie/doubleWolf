'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameState } from '@/hooks/use-game-state';
import { getSession, saveSession } from '@/lib/socket';
import { Lobby } from '@/components/game/lobby';
import { NightPhase } from '@/components/game/night-phase';
import { DayPhase } from '@/components/game/day-phase';
import { GameOver } from '@/components/game/game-over';
import { DeathNotification } from '@/components/game/death-notification';
import { Spinner } from '@/components/ui/spinner';

interface PageProps {
  params: Promise<{ roomId: string }>;
}

export default function RoomPage({ params }: PageProps) {
  const { roomId } = use(params);
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);
  
  const gameState = useGameState(roomId);
  const { 
    isConnected, 
    isReconnecting, 
    room, 
    currentPlayer,
    currentPhase,
    deathEvents,
    kicked,
    error,
    setPlayerId,
  } = gameState;

  // 初始化：检查会话
  useEffect(() => {
    const session = getSession();
    if (session && session.roomId === roomId) {
      setPlayerId(session.playerId);
    }
    setIsInitialized(true);
  }, [roomId, setPlayerId]);

  // 被踢出处理
  useEffect(() => {
    if (kicked) {
      router.push('/');
    }
  }, [kicked, router]);

  // 加载状态
  if (!isInitialized || isReconnecting) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Spinner className="w-8 h-8" />
        <p className="text-muted-foreground">
          {isReconnecting ? '重新连接中...' : '加载中...'}
        </p>
      </main>
    );
  }

  // 连接中
  if (!isConnected) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Spinner className="w-8 h-8" />
        <p className="text-muted-foreground">连接服务器中...</p>
      </main>
    );
  }

  // 未找到房间
  if (!room) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-lg">房间不存在或已关闭</p>
        <button
          onClick={() => router.push('/')}
          className="text-primary underline"
        >
          返回首页
        </button>
      </main>
    );
  }

  // 渲染当前阶段
  const renderPhase = () => {
    switch (currentPhase) {
      case 'waiting':
      case 'role-select':
        return <Lobby gameState={gameState} />;
      
      case 'night':
        return <NightPhase gameState={gameState} />;
      
      case 'day-announce':
      case 'day-speech':
      case 'day-vote':
        return <DayPhase gameState={gameState} />;
      
      case 'game-over':
        return <GameOver gameState={gameState} />;
      
      default:
        return <Lobby gameState={gameState} />;
    }
  };

  return (
    <main className="min-h-screen flex flex-col">
      {/* 死亡公告 */}
      <DeathNotification events={deathEvents} />
      
      {/* 错误提示 */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg">
          {error}
        </div>
      )}
      
      {/* 主内容 */}
      {renderPhase()}
    </main>
  );
}
