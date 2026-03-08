'use client';

import { useState, useEffect } from 'react';
import { Sun, Clock, Vote, Bomb, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { PlayerSeats } from './player-seats';
import type { GameState } from '@/hooks/use-game-state';
import { ROLE_DISPLAY, getCurrentIdentity, isPlayerOut } from '@/lib/types';
import { submitVote, explode } from '@/lib/socket';

interface DayPhaseProps {
  gameState: GameState;
}

export function DayPhase({ gameState }: DayPhaseProps) {
  const { 
    room, 
    currentPlayer, 
    currentPhase,
    speechTimeLeft,
    voteTimeLeft,
    votedCount,
    totalVoters,
    hasVoted,
    markVoted,
    actionPrompt,
  } = gameState;

  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [showExplodeDialog, setShowExplodeDialog] = useState(false);
  const [explodeTarget, setExplodeTarget] = useState<string | null>(null);

  if (!room || !currentPlayer) return null;

  const currentRole = getCurrentIdentity(currentPlayer);
  const isOut = isPlayerOut(currentPlayer);
  const isVotingPhase = currentPhase === 'day-vote';
  const isSpeechPhase = currentPhase === 'day-speech';
  
  // 检查是否是白狼王
  const isWhiteWolfKing = currentRole?.type === 'white-wolf-king';

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 计算倒计时进度
  const getSpeechProgress = () => {
    const totalTime = room.settings.speechTime * 60;
    return (speechTimeLeft / totalTime) * 100;
  };

  const getVoteProgress = () => {
    if (room.settings.voteTime === 0) return 100;
    return (voteTimeLeft / room.settings.voteTime) * 100;
  };

  // 处理投票
  const handleVote = () => {
    if (selectedTarget && !hasVoted && !isOut) {
      submitVote(selectedTarget);
      markVoted();
    }
  };

  // 处理白狼王自爆
  const handleExplode = () => {
    if (explodeTarget && isWhiteWolfKing && !isOut) {
      explode(explodeTarget);
      setShowExplodeDialog(false);
    }
  };

  // 检查是否有猎人开枪
  const isHunterShot = actionPrompt?.actionType === 'hunter-shot';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#1a1a2e] to-background">
      {/* 头部：白天信息 + 倒计时 */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Sun className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="font-bold">
                {isVotingPhase ? '投票阶段' : '发言阶段'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isVotingPhase 
                  ? `${votedCount}/${totalVoters} 人已投票`
                  : '请玩家依次发言'
                }
              </p>
            </div>
          </div>

          {/* 当前身份 */}
          {currentRole && !isOut && (
            <Badge 
              className="gap-1"
              style={{ 
                backgroundColor: `${ROLE_DISPLAY[currentRole.type].color}20`,
                color: ROLE_DISPLAY[currentRole.type].color,
                borderColor: ROLE_DISPLAY[currentRole.type].color,
              }}
            >
              {ROLE_DISPLAY[currentRole.type].icon}
              {ROLE_DISPLAY[currentRole.type].name}
            </Badge>
          )}
        </div>

        {/* 倒计时条 */}
        <div className="px-4 pb-3">
          {isSpeechPhase && (
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Progress 
                value={getSpeechProgress()} 
                className="flex-1 h-2"
                style={{
                  '--progress-color': getSpeechProgress() > 30 
                    ? getSpeechProgress() > 60 ? '#22c55e' : '#eab308'
                    : '#ef4444',
                } as React.CSSProperties}
              />
              <span className={`
                font-mono text-sm font-medium
                ${speechTimeLeft <= 60 ? 'text-destructive animate-pulse' : 'text-foreground'}
              `}>
                {formatTime(speechTimeLeft)}
              </span>
            </div>
          )}
          {isVotingPhase && room.settings.voteTime > 0 && (
            <div className="flex items-center gap-3">
              <Vote className="w-4 h-4 text-muted-foreground" />
              <Progress 
                value={getVoteProgress()} 
                className="flex-1 h-2"
              />
              <span className={`
                font-mono text-sm font-medium
                ${voteTimeLeft <= 10 ? 'text-destructive animate-pulse' : 'text-foreground'}
              `}>
                {formatTime(voteTimeLeft)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 玩家座位 */}
      <div className="flex-1 overflow-auto p-2">
        <PlayerSeats
          players={room.players}
          currentPlayerId={currentPlayer.id}
          selectedId={isVotingPhase ? selectedTarget : null}
          onSelect={isVotingPhase && !hasVoted && !isOut ? setSelectedTarget : undefined}
          selectableFilter={(p) => !isPlayerOut(p) && p.id !== currentPlayer.id}
          showRole={true}
        />
      </div>

      {/* 底部操作栏 */}
      <div className="sticky bottom-0 p-4 bg-background/80 backdrop-blur-sm border-t border-border/50">
        {/* 猎人开枪 */}
        {isHunterShot && actionPrompt && (
          <HunterShotPanel
            options={actionPrompt.options}
            currentPlayerId={currentPlayer.id}
          />
        )}

        {/* 投票阶段 */}
        {isVotingPhase && !isHunterShot && (
          <div className="flex flex-col gap-3">
            {isOut ? (
              <div className="text-center text-muted-foreground py-4">
                你已出局，等待投票结束...
              </div>
            ) : hasVoted ? (
              <div className="flex items-center justify-center gap-2 py-4 text-green-500">
                <Check className="w-5 h-5" />
                <span>已投票，等待其他玩家...</span>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      submitVote('');
                      markVoted();
                    }}
                  >
                    弃票
                  </Button>
                  <Button 
                    className="flex-1"
                    onClick={handleVote}
                    disabled={!selectedTarget}
                  >
                    投票给 {selectedTarget 
                      ? `${room.players.find(p => p.id === selectedTarget)?.seatNumber}号` 
                      : '...'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 发言阶段 */}
        {isSpeechPhase && !isHunterShot && (
          <div className="flex flex-col gap-3">
            {isOut ? (
              <div className="text-center text-muted-foreground py-4">
                你已出局，等待发言结束...
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-2">
                发言进行中，倒计时结束后进入投票
              </div>
            )}
            
            {/* 白狼王自爆按钮 */}
            {isWhiteWolfKing && !isOut && (
              <Button
                variant="destructive"
                className="w-full gap-2 animate-pulse"
                onClick={() => setShowExplodeDialog(true)}
              >
                <Bomb className="w-4 h-4" />
                自爆
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 白狼王自爆确认对话框 */}
      <Dialog open={showExplodeDialog} onOpenChange={setShowExplodeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              白狼王自爆
            </DialogTitle>
            <DialogDescription>
              自爆后你将出局，并可以带走一名玩家。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-2">选择带走的玩家：</p>
            <PlayerSeats
              players={room.players.filter(p => !isPlayerOut(p) && p.id !== currentPlayer.id)}
              currentPlayerId={currentPlayer.id}
              selectedId={explodeTarget}
              onSelect={setExplodeTarget}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExplodeDialog(false)}>
              取消
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleExplode}
              disabled={!explodeTarget}
            >
              确认自爆
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 猎人开枪面板（白天）
function HunterShotPanel({
  options,
  currentPlayerId,
}: {
  options: { id: string; name: string; seatNumber: number }[];
  currentPlayerId: string;
}) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  const handleShot = () => {
    if (selectedTarget) {
      submitVote(selectedTarget); // 复用投票接口
    }
  };

  return (
    <Card className="bg-hunter/10 border-hunter/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-hunter">
          <AlertTriangle className="w-4 h-4" />
          猎人开枪 - 选择带走目标
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-center text-muted-foreground">
          你被投票出局，可以开枪带走一名玩家
        </p>
        <div className="grid grid-cols-4 gap-2">
          {options.map((player) => (
            <button
              key={player.id}
              onClick={() => setSelectedTarget(player.id)}
              className={`
                p-2 rounded-lg border-2 transition-all
                ${selectedTarget === player.id 
                  ? 'border-hunter bg-hunter/10' 
                  : 'border-border bg-card hover:border-hunter/50'}
              `}
            >
              <div className="w-8 h-8 rounded-full bg-secondary mx-auto flex items-center justify-center font-bold">
                {player.seatNumber}
              </div>
              <span className="text-xs truncate block mt-1">{player.name}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => {
              // 不开枪
            }}
          >
            不开枪
          </Button>
          <Button 
            className="flex-1 bg-hunter hover:bg-hunter/90"
            onClick={handleShot}
            disabled={!selectedTarget}
          >
            开枪
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
