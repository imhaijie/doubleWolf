'use client';

import { useState, useEffect } from 'react';
import { Moon, Eye, FlaskConical, Shield, Target, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayerSeats } from './player-seats';
import type { GameState } from '@/hooks/use-game-state';
import type { SerializedPlayer } from '@/lib/types';
import { ROLE_DISPLAY, getCurrentIdentity, isPlayerOut } from '@/lib/types';
import { submitAction } from '@/lib/socket';

interface NightPhaseProps {
  gameState: GameState;
}

export function NightPhase({ gameState }: NightPhaseProps) {
  const { 
    room, 
    currentPlayer, 
    nightSubPhase, 
    nightNumber,
    actionPrompt,
    actionResult,
    hasSubmittedAction,
  } = gameState;

  if (!room || !currentPlayer) return null;

  const currentRole = getCurrentIdentity(currentPlayer);
  const isOut = isPlayerOut(currentPlayer);

  // 获取当前阶段的中文名
  const getSubPhaseName = () => {
    switch (nightSubPhase) {
      case 'werewolf': return '狼人';
      case 'seer': return '预言家';
      case 'witch': return '女巫';
      case 'guard': return '守卫';
      case 'hunter': return '猎人';
      case 'settle': return '结算中';
      default: return '等待中';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-[#0a0a15]">
      {/* 头部：夜晚信息 */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Moon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold">第 {nightNumber} 夜</h2>
            <p className="text-sm text-muted-foreground">
              {getSubPhaseName()}行动中
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

      {/* 玩家座位 */}
      <div className="flex-1 overflow-auto">
        <PlayerSeats
          players={room.players}
          currentPlayerId={currentPlayer.id}
          showRole={true}
        />
      </div>

      {/* 操作面板 */}
      <div className="p-4 border-t border-border/50">
        {isOut ? (
          <WaitingPanel message="你已出局，等待其他玩家..." />
        ) : hasSubmittedAction ? (
          <WaitingPanel message="已提交，等待其他玩家..." icon={<Check className="w-5 h-5 text-green-500" />} />
        ) : actionPrompt ? (
          <ActionPanel 
            actionPrompt={actionPrompt} 
            actionResult={actionResult}
            currentPlayer={currentPlayer}
            room={room}
          />
        ) : (
          <WaitingPanel message="等待中..." icon={<Clock className="w-5 h-5 animate-pulse" />} />
        )}
      </div>
    </div>
  );
}

// 等待面板
function WaitingPanel({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <Card className="bg-card/50">
      <CardContent className="flex items-center justify-center gap-3 py-8">
        {icon || <Moon className="w-5 h-5 text-muted-foreground animate-pulse" />}
        <span className="text-muted-foreground">{message}</span>
      </CardContent>
    </Card>
  );
}

// 操作面板
function ActionPanel({ 
  actionPrompt, 
  actionResult,
  currentPlayer,
  room,
}: { 
  actionPrompt: NonNullable<GameState['actionPrompt']>;
  actionResult: GameState['actionResult'];
  currentPlayer: SerializedPlayer;
  room: NonNullable<GameState['room']>;
}) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [witchStep, setWitchStep] = useState<'save' | 'poison' | 'done'>('save');

  const { actionType, options, extraData } = actionPrompt;

  // 根据操作类型渲染
  switch (actionType) {
    case 'wolf-kill':
      return (
        <WolfKillPanel 
          options={options}
          selectedTarget={selectedTarget}
          onSelect={setSelectedTarget}
          currentPlayerId={currentPlayer.id}
        />
      );

    case 'seer-check':
      return (
        <SeerCheckPanel
          options={options}
          selectedTarget={selectedTarget}
          onSelect={setSelectedTarget}
          result={actionResult}
          currentPlayerId={currentPlayer.id}
        />
      );

    case 'witch-action':
      return (
        <WitchActionPanel
          options={options}
          extraData={extraData as {
            hasAntidote: boolean;
            hasPoison: boolean;
            wolfTarget: string | null;
            canSaveSelf: boolean;
          }}
          witchStep={witchStep}
          setWitchStep={setWitchStep}
          selectedTarget={selectedTarget}
          onSelect={setSelectedTarget}
          room={room}
          currentPlayerId={currentPlayer.id}
        />
      );

    case 'guard-protect':
      return (
        <GuardProtectPanel
          options={options}
          selectedTarget={selectedTarget}
          onSelect={setSelectedTarget}
          extraData={extraData as { lastTarget: string | null }}
          currentPlayerId={currentPlayer.id}
        />
      );

    case 'hunter-shot':
      return (
        <HunterShotPanel
          options={options}
          selectedTarget={selectedTarget}
          onSelect={setSelectedTarget}
          currentPlayerId={currentPlayer.id}
        />
      );

    default:
      return <WaitingPanel message="等待中..." />;
  }
}

// 狼人击杀面板
function WolfKillPanel({
  options,
  selectedTarget,
  onSelect,
  currentPlayerId,
}: {
  options: SerializedPlayer[];
  selectedTarget: string | null;
  onSelect: (id: string | null) => void;
  currentPlayerId: string;
}) {
  const handleSubmit = () => {
    submitAction('wolf-kill', selectedTarget || undefined);
  };

  return (
    <Card className="bg-wolf/10 border-wolf/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-wolf">
          <Target className="w-4 h-4" />
          选择击杀目标
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PlayerSeats
          players={options}
          currentPlayerId={currentPlayerId}
          selectedId={selectedTarget}
          onSelect={onSelect}
          selectableFilter={(p) => !isPlayerOut(p)}
        />
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => {
              onSelect(null);
              submitAction('wolf-kill');
            }}
          >
            空刀
          </Button>
          <Button 
            className="flex-1 bg-wolf hover:bg-wolf/90"
            onClick={handleSubmit}
            disabled={!selectedTarget}
          >
            确认击杀
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// 预言家查验面板
function SeerCheckPanel({
  options,
  selectedTarget,
  onSelect,
  result,
  currentPlayerId,
}: {
  options: SerializedPlayer[];
  selectedTarget: string | null;
  onSelect: (id: string | null) => void;
  result: GameState['actionResult'];
  currentPlayerId: string;
}) {
  const handleSubmit = () => {
    if (selectedTarget) {
      submitAction('seer-check', selectedTarget);
    }
  };

  // 显示查验结果
  if (result) {
    const isWolf = result.result === '查杀';
    return (
      <Card className={`${isWolf ? 'bg-wolf/10 border-wolf/30' : 'bg-seer/10 border-seer/30'}`}>
        <CardContent className="py-8 text-center">
          <div className="text-4xl mb-2">{isWolf ? '🐺' : '👤'}</div>
          <p className={`text-xl font-bold ${isWolf ? 'text-wolf' : 'text-seer'}`}>
            {result.result}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {(result.extraData as { targetName?: string })?.targetName} 是{isWolf ? '狼人阵营' : '好人阵营'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-seer/10 border-seer/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-seer">
          <Eye className="w-4 h-4" />
          选择查验目标
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PlayerSeats
          players={options}
          currentPlayerId={currentPlayerId}
          selectedId={selectedTarget}
          onSelect={onSelect}
          selectableFilter={(p) => !isPlayerOut(p)}
        />
        <Button 
          className="w-full bg-seer hover:bg-seer/90"
          onClick={handleSubmit}
          disabled={!selectedTarget}
        >
          查验
        </Button>
      </CardContent>
    </Card>
  );
}

// 女巫操作面板
function WitchActionPanel({
  options,
  extraData,
  witchStep,
  setWitchStep,
  selectedTarget,
  onSelect,
  room,
  currentPlayerId,
}: {
  options: SerializedPlayer[];
  extraData: {
    hasAntidote: boolean;
    hasPoison: boolean;
    wolfTarget: string | null;
    canSaveSelf: boolean;
  };
  witchStep: 'save' | 'poison' | 'done';
  setWitchStep: (step: 'save' | 'poison' | 'done') => void;
  selectedTarget: string | null;
  onSelect: (id: string | null) => void;
  room: NonNullable<GameState['room']>;
  currentPlayerId: string;
}) {
  const { hasAntidote, hasPoison, wolfTarget, canSaveSelf } = extraData;

  // 获取被刀玩家信息
  const wolfTargetPlayer = wolfTarget 
    ? room.players.find(p => p.id === wolfTarget) 
    : null;

  if (witchStep === 'save') {
    return (
      <Card className="bg-witch/10 border-witch/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-witch">
            <FlaskConical className="w-4 h-4" />
            解药
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {wolfTargetPlayer && hasAntidote ? (
            <>
              <p className="text-center">
                今晚 <strong>{wolfTargetPlayer.seatNumber}号 {wolfTargetPlayer.name}</strong> 被刀
              </p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    submitAction('witch-skip-save');
                    setWitchStep('poison');
                  }}
                >
                  不救
                </Button>
                <Button 
                  className="flex-1 bg-witch hover:bg-witch/90"
                  onClick={() => {
                    submitAction('witch-save', undefined, true);
                    setWitchStep('poison');
                  }}
                >
                  使用解药
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-center text-muted-foreground">
                {!hasAntidote ? '解药已用尽' : '今晚是平安夜'}
              </p>
              <Button 
                variant="outline"
                onClick={() => setWitchStep('poison')}
              >
                下一步
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  if (witchStep === 'poison') {
    return (
      <Card className="bg-witch/10 border-witch/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-witch">
            <FlaskConical className="w-4 h-4" />
            毒药
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasPoison ? (
            <>
              <PlayerSeats
                players={options}
                currentPlayerId={currentPlayerId}
                selectedId={selectedTarget}
                onSelect={onSelect}
                selectableFilter={(p) => !isPlayerOut(p)}
              />
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    submitAction('witch-skip-poison');
                  }}
                >
                  不用
                </Button>
                <Button 
                  className="flex-1 bg-witch hover:bg-witch/90"
                  onClick={() => {
                    if (selectedTarget) {
                      submitAction('witch-poison', selectedTarget);
                    }
                  }}
                  disabled={!selectedTarget}
                >
                  使用毒药
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-center text-muted-foreground">毒药已用尽</p>
              <Button 
                variant="outline"
                onClick={() => submitAction('witch-skip-poison')}
              >
                完成
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return <WaitingPanel message="操作完成" icon={<Check className="w-5 h-5 text-green-500" />} />;
}

// 守卫守护面板
function GuardProtectPanel({
  options,
  selectedTarget,
  onSelect,
  extraData,
  currentPlayerId,
}: {
  options: SerializedPlayer[];
  selectedTarget: string | null;
  onSelect: (id: string | null) => void;
  extraData: { lastTarget: string | null };
  currentPlayerId: string;
}) {
  const handleSubmit = () => {
    submitAction('guard-protect', selectedTarget || undefined);
  };

  return (
    <Card className="bg-guard/10 border-guard/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-guard">
          <Shield className="w-4 h-4" />
          选择守护目标
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {extraData.lastTarget && (
          <p className="text-sm text-muted-foreground text-center">
            上一夜守护的玩家不可连续守护
          </p>
        )}
        <PlayerSeats
          players={options}
          currentPlayerId={currentPlayerId}
          selectedId={selectedTarget}
          onSelect={onSelect}
          selectableFilter={(p) => !isPlayerOut(p) && p.id !== extraData.lastTarget}
        />
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => {
              onSelect(null);
              submitAction('guard-protect');
            }}
          >
            空守
          </Button>
          <Button 
            className="flex-1 bg-guard hover:bg-guard/90"
            onClick={handleSubmit}
            disabled={!selectedTarget}
          >
            确认守护
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// 猎人开枪面板
function HunterShotPanel({
  options,
  selectedTarget,
  onSelect,
  currentPlayerId,
}: {
  options: SerializedPlayer[];
  selectedTarget: string | null;
  onSelect: (id: string | null) => void;
  currentPlayerId: string;
}) {
  const handleSubmit = () => {
    if (selectedTarget) {
      submitAction('hunter-shot', selectedTarget);
    }
  };

  return (
    <Card className="bg-hunter/10 border-hunter/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-hunter">
          <Target className="w-4 h-4" />
          猎人开枪 - 选择带走目标
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-center text-muted-foreground">
          你已死亡，可以开枪带走一名玩家
        </p>
        <PlayerSeats
          players={options}
          currentPlayerId={currentPlayerId}
          selectedId={selectedTarget}
          onSelect={onSelect}
          selectableFilter={(p) => !isPlayerOut(p)}
        />
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => submitAction('hunter-shot')}
          >
            不开枪
          </Button>
          <Button 
            className="flex-1 bg-hunter hover:bg-hunter/90"
            onClick={handleSubmit}
            disabled={!selectedTarget}
          >
            开枪
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
