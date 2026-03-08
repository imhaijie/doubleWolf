'use client';

import { useState } from 'react';
import { Copy, Check, Users, Play, LogOut, X, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { GameState } from '@/hooks/use-game-state';
import type { RoleType, Role, SerializedPlayer } from '@/lib/types';
import { ROLE_DISPLAY } from '@/lib/types';
import { 
  selectRole, startGame, kickPlayer, leaveRoom, 
  updateSettings, updateRolePool 
} from '@/lib/socket';

interface LobbyProps {
  gameState: GameState;
}

export function Lobby({ gameState }: LobbyProps) {
  const { room, currentPlayer } = gameState;
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  if (!room || !currentPlayer) return null;

  const isHost = currentPlayer.isHost;
  const players = room.players;
  const availableRoles = room.availableRoles || [];

  // 按角色类型分组可选角色
  const rolesByType = availableRoles.reduce((acc, role) => {
    if (!acc[role.type]) acc[role.type] = [];
    acc[role.type].push(role);
    return acc;
  }, {} as Record<RoleType, Role[]>);

  // 检查是否所有人都选好了
  const allReady = players.every(p => p.identity1 && p.identity2);
  const canStart = isHost && allReady && players.length >= room.settings.minPlayers;

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectRole = (identity: 1 | 2, roleType: RoleType) => {
    selectRole(identity, roleType);
  };

  const handleStartGame = () => {
    if (canStart) {
      startGame();
    }
  };

  const handleKickPlayer = (playerId: string) => {
    if (isHost && playerId !== currentPlayer.id) {
      kickPlayer(playerId);
    }
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex flex-col p-4 pb-24">
      {/* 头部：房间码 */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={copyRoomCode}
          className="flex items-center gap-2 bg-card px-4 py-2 rounded-lg border border-border"
        >
          <span className="text-muted-foreground text-sm">房间码</span>
          <span className="font-mono text-xl font-bold tracking-wider">{room.id}</span>
          {copied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        <div className="flex items-center gap-2">
          {isHost && (
            <Dialog open={showSettings} onOpenChange={setShowSettings}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon">
                  <Settings className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>游戏设置</DialogTitle>
                </DialogHeader>
                <SettingsPanel room={room} onClose={() => setShowSettings(false)} />
              </DialogContent>
            </Dialog>
          )}
          <Button variant="outline" size="icon" onClick={handleLeaveRoom}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 玩家列表 */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            玩家 ({players.length}/{room.settings.maxPlayers})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                isCurrentPlayer={player.id === currentPlayer.id}
                isHost={isHost}
                onKick={() => handleKickPlayer(player.id)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 角色选择 */}
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">选择你的双身份</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {/* 第一身份 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground">第一身份</label>
              <RoleSelector
                selectedRole={currentPlayer.identity1}
                rolesByType={rolesByType}
                onSelect={(type) => handleSelectRole(1, type)}
                disabled={room.phase !== 'waiting' && room.phase !== 'role-select'}
              />
            </div>
            
            {/* 第二身份 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground">第二身份</label>
              <RoleSelector
                selectedRole={currentPlayer.identity2}
                rolesByType={rolesByType}
                onSelect={(type) => handleSelectRole(2, type)}
                disabled={room.phase !== 'waiting' && room.phase !== 'role-select'}
              />
            </div>
          </div>

          {/* 角色池剩余 */}
          <div className="mt-6">
            <p className="text-sm text-muted-foreground mb-2">剩余角色</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(rolesByType).map(([type, roles]) => (
                <Badge 
                  key={type} 
                  variant="secondary"
                  className="gap-1"
                  style={{ 
                    backgroundColor: `${ROLE_DISPLAY[type as RoleType].color}20`,
                    color: ROLE_DISPLAY[type as RoleType].color,
                  }}
                >
                  {ROLE_DISPLAY[type as RoleType].name} x{roles.length}
                </Badge>
              ))}
              {Object.keys(rolesByType).length === 0 && (
                <span className="text-sm text-muted-foreground">已分配完毕</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        {isHost ? (
          <Button 
            className="w-full h-12 text-lg gap-2" 
            onClick={handleStartGame}
            disabled={!canStart}
          >
            <Play className="w-5 h-5" />
            {!allReady 
              ? '等待所有玩家选择身份' 
              : players.length < room.settings.minPlayers
                ? `至少需要 ${room.settings.minPlayers} 人`
                : '开始游戏'
            }
          </Button>
        ) : (
          <div className="text-center text-muted-foreground">
            {allReady ? '等待房主开始游戏...' : '请选择你的双身份'}
          </div>
        )}
      </div>
    </div>
  );
}

// 玩家卡片
function PlayerCard({ 
  player, 
  isCurrentPlayer, 
  isHost,
  onKick,
}: { 
  player: SerializedPlayer; 
  isCurrentPlayer: boolean;
  isHost: boolean;
  onKick: () => void;
}) {
  const hasIdentity1 = !!player.identity1;
  const hasIdentity2 = !!player.identity2;
  const isReady = hasIdentity1 && hasIdentity2;

  return (
    <div 
      className={`
        relative p-3 rounded-lg border 
        ${isCurrentPlayer ? 'border-primary bg-primary/5' : 'border-border bg-card'}
      `}
    >
      {isHost && !isCurrentPlayer && (
        <button
          onClick={onKick}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-medium">
            {player.seatNumber}
          </span>
          <span className="font-medium truncate max-w-20">
            {player.name}
            {isCurrentPlayer && <span className="text-primary ml-1">(你)</span>}
          </span>
        </div>
        {player.isHost && (
          <Badge variant="outline" className="text-xs">房主</Badge>
        )}
      </div>
      
      <div className="flex gap-1">
        <div className={`flex-1 h-1.5 rounded-full ${hasIdentity1 ? 'bg-primary' : 'bg-muted'}`} />
        <div className={`flex-1 h-1.5 rounded-full ${hasIdentity2 ? 'bg-primary' : 'bg-muted'}`} />
      </div>
      
      {!player.isOnline && (
        <div className="absolute inset-0 bg-background/80 rounded-lg flex items-center justify-center">
          <span className="text-xs text-muted-foreground">离线</span>
        </div>
      )}
    </div>
  );
}

// 角色选择器
function RoleSelector({
  selectedRole,
  rolesByType,
  onSelect,
  disabled,
}: {
  selectedRole: Role | null;
  rolesByType: Record<RoleType, Role[]>;
  onSelect: (type: RoleType) => void;
  disabled: boolean;
}) {
  const availableTypes = Object.keys(rolesByType) as RoleType[];
  
  // 如果已选择，也要显示已选择的角色
  const allTypes = selectedRole 
    ? [...new Set([selectedRole.type, ...availableTypes])]
    : availableTypes;

  return (
    <Select
      value={selectedRole?.type || ''}
      onValueChange={(value) => onSelect(value as RoleType)}
      disabled={disabled}
    >
      <SelectTrigger 
        className="h-14"
        style={selectedRole ? {
          backgroundColor: `${ROLE_DISPLAY[selectedRole.type].color}10`,
          borderColor: ROLE_DISPLAY[selectedRole.type].color,
        } : {}}
      >
        <SelectValue placeholder="点击选择">
          {selectedRole && (
            <div className="flex items-center gap-2">
              <span>{ROLE_DISPLAY[selectedRole.type].icon}</span>
              <span style={{ color: ROLE_DISPLAY[selectedRole.type].color }}>
                {ROLE_DISPLAY[selectedRole.type].name}
              </span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allTypes.map((type) => {
          const count = rolesByType[type]?.length || 0;
          const isSelected = selectedRole?.type === type;
          const display = ROLE_DISPLAY[type];
          
          return (
            <SelectItem 
              key={type} 
              value={type}
              disabled={count === 0 && !isSelected}
            >
              <div className="flex items-center gap-2">
                <span>{display.icon}</span>
                <span style={{ color: display.color }}>{display.name}</span>
                {!isSelected && <span className="text-muted-foreground">({count})</span>}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

// 设置面板
function SettingsPanel({ 
  room, 
  onClose 
}: { 
  room: NonNullable<GameState['room']>;
  onClose: () => void;
}) {
  const [localSettings, setLocalSettings] = useState(room.settings);
  const [localRolePool, setLocalRolePool] = useState(room.rolePool);

  const handleSaveSettings = () => {
    updateSettings(localSettings);
    updateRolePool(localRolePool);
    onClose();
  };

  const roleTypes: RoleType[] = [
    'werewolf', 'white-wolf-king', 'seer', 'witch', 'hunter', 'guard', 'villager'
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* 游戏设置 */}
      <div className="flex flex-col gap-4">
        <h3 className="font-medium">游戏设置</h3>
        
        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground">发言时间</label>
          <Select
            value={String(localSettings.speechTime)}
            onValueChange={(v) => setLocalSettings(s => ({ ...s, speechTime: Number(v) as 5 | 10 | 15 }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 分钟</SelectItem>
              <SelectItem value="10">10 分钟</SelectItem>
              <SelectItem value="15">15 分钟</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground">投票时间</label>
          <Select
            value={String(localSettings.voteTime)}
            onValueChange={(v) => setLocalSettings(s => ({ ...s, voteTime: Number(v) as 60 | 120 | 0 }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="60">60 秒</SelectItem>
              <SelectItem value="120">120 秒</SelectItem>
              <SelectItem value="0">无限制</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 角色池配置 */}
      <div className="flex flex-col gap-4">
        <h3 className="font-medium">角色配置</h3>
        <div className="grid grid-cols-2 gap-3">
          {roleTypes.map((type) => {
            const display = ROLE_DISPLAY[type];
            return (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{display.icon}</span>
                  <span className="text-sm" style={{ color: display.color }}>
                    {display.name}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="w-6 h-6 rounded bg-secondary flex items-center justify-center"
                    onClick={() => setLocalRolePool(p => ({ 
                      ...p, 
                      [type]: Math.max(0, (p[type] || 0) - 1) 
                    }))}
                  >
                    -
                  </button>
                  <span className="w-6 text-center">{localRolePool[type] || 0}</span>
                  <button
                    className="w-6 h-6 rounded bg-secondary flex items-center justify-center"
                    onClick={() => setLocalRolePool(p => ({ 
                      ...p, 
                      [type]: (p[type] || 0) + 1 
                    }))}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          总计: {Object.values(localRolePool).reduce((a, b) => a + b, 0)} 个角色
          （需要 {Object.values(localRolePool).reduce((a, b) => a + b, 0) / 2} 名玩家）
        </p>
      </div>

      <Button onClick={handleSaveSettings}>保存设置</Button>
    </div>
  );
}
