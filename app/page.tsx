'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Moon, Users, Plus, ArrowRight, Settings, Clock, Vote, Users2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { createRoom, joinRoom } from '@/lib/socket';
import type { GameSettings, RolePool } from '@/lib/types';

// 角色预设模板
const ROLE_PRESETS = {
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
    } as RolePool,
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
    } as RolePool,
  },
  'custom': {
    name: '自定义配置',
    pool: {
      werewolf: 2,
      'white-wolf-king': 1,
      seer: 1,
      witch: 1,
      hunter: 1,
      guard: 1,
      villager: 2,
    } as RolePool,
  },
};

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [customRoomId, setCustomRoomId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // 游戏设置
  const [speechTime, setSpeechTime] = useState<5 | 10 | 15>(10);
  const [voteTime, setVoteTime] = useState<60 | 120 | 0>(120);
  
  // 角色配置
  const [rolePreset, setRolePreset] = useState<string>('9-standard');
  const [customRolePool, setCustomRolePool] = useState<RolePool>(ROLE_PRESETS['9-standard'].pool);

  // 处理角色预设变化
  const handleRolePresetChange = (preset: string) => {
    setRolePreset(preset);
    if (preset !== 'custom') {
      setCustomRolePool(ROLE_PRESETS[preset as keyof typeof ROLE_PRESETS].pool);
    }
  };

  // 更新自定义角色数量
  const updateRoleCount = (roleType: keyof RolePool, count: number) => {
    setCustomRolePool(prev => ({
      ...prev,
      [roleType]: Math.max(0, count)
    }));
    setRolePreset('custom');
  };

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      setError('请输入你的名字');
      return;
    }

    if (customRoomId.trim() && customRoomId.length !== 6) {
      setError('房间号必须是6位字符');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const settings: Partial<GameSettings> = {
        speechTime,
        voteTime,
      };
      const { roomId } = await createRoom(
        playerName.trim(), 
        settings, 
        customRoomId.trim() || undefined,
        customRolePool
      );
      router.push(`/room/${roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建房间失败');
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      setError('请输入你的名字');
      return;
    }
    if (!roomCode.trim()) {
      setError('请输入房间码');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await joinRoom(roomCode.trim().toUpperCase(), playerName.trim());
      router.push(`/room/${roomCode.trim().toUpperCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入房间失败');
      setIsLoading(false);
    }
  };

  if (mode === 'home') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md flex flex-col items-center gap-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Moon className="w-10 h-10 text-primary" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight">狼人杀面杀助手</h1>
              <p className="text-muted-foreground mt-2">双身份版 - 手机打开即用</p>
            </div>
          </div>

          {/* Actions */}
          <div className="w-full flex flex-col gap-4">
            <Button
              size="lg"
              className="w-full h-14 text-lg gap-2"
              onClick={() => setMode('create')}
            >
              <Plus className="w-5 h-5" />
              创建房间
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="w-full h-14 text-lg gap-2"
              onClick={() => setMode('join')}
            >
              <Users className="w-5 h-5" />
              加入房间
            </Button>
          </div>

          {/* Features */}
          <div className="grid grid-cols-3 gap-4 w-full mt-4">
            <FeatureItem icon="1" label="双身份" />
            <FeatureItem icon="2" label="实时同步" />
            <FeatureItem icon="3" label="身份隐藏" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">
            {mode === 'create' ? '创建房间' : '加入房间'}
          </CardTitle>
          <CardDescription>
            {mode === 'create' 
              ? '创建一个新房间，邀请朋友加入' 
              : '输入房间码加入已有房间'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">你的名字</label>
            <Input
              placeholder="输入你的名字"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={12}
              autoFocus
            />
          </div>

          {mode === 'create' && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-muted-foreground">
                  房间号 <span className="text-muted-foreground">(可选，留空自动生成)</span>
                </label>
                <Input
                  placeholder="输入6位房间号"
                  value={customRoomId}
                  onChange={(e) => setCustomRoomId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest font-mono"
                />
              </div>

              {/* 游戏设置 */}
              <div className="flex flex-col gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Settings className="w-4 h-4" />
                  游戏设置
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      发言时间
                    </Label>
                    <Select value={speechTime.toString()} onValueChange={(value) => setSpeechTime(parseInt(value) as 5 | 10 | 15)}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5分钟</SelectItem>
                        <SelectItem value="10">10分钟</SelectItem>
                        <SelectItem value="15">15分钟</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Vote className="w-3 h-3" />
                      投票时间
                    </Label>
                    <Select value={voteTime.toString()} onValueChange={(value) => setVoteTime(parseInt(value) as 60 | 120 | 0)}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="60">1分钟</SelectItem>
                        <SelectItem value="120">2分钟</SelectItem>
                        <SelectItem value="0">无限</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* 角色配置 */}
              <div className="flex flex-col gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users2 className="w-4 h-4" />
                  角色配置
                </div>
                
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">预设模板</Label>
                  <Select value={rolePreset} onValueChange={handleRolePresetChange}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                        <SelectItem key={key} value={key}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {rolePreset === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(customRolePool).map(([roleType, count]) => (
                      <div key={roleType} className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          {roleType === 'werewolf' ? '狼人' :
                           roleType === 'white-wolf-king' ? '白狼王' :
                           roleType === 'seer' ? '预言家' :
                           roleType === 'witch' ? '女巫' :
                           roleType === 'hunter' ? '猎人' :
                           roleType === 'guard' ? '守卫' :
                           roleType === 'villager' ? '平民' : roleType}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 w-6 p-0"
                            onClick={() => updateRoleCount(roleType as keyof RolePool, count - 1)}
                            disabled={count <= 0}
                          >
                            -
                          </Button>
                          <span className="w-6 text-center">{count}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 w-6 p-0"
                            onClick={() => updateRoleCount(roleType as keyof RolePool, count + 1)}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  总角色数: {Object.values(customRolePool).reduce((sum, count) => sum + count, 0)}
                </div>
              </div>
            </>
          )}

          {mode === 'join' && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-muted-foreground">房间码</label>
              <Input
                placeholder="输入6位房间码"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="text-center text-2xl tracking-widest font-mono"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setMode('home');
                setError('');
              }}
            >
              返回
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={mode === 'create' ? handleCreateRoom : handleJoinRoom}
              disabled={isLoading}
            >
              {isLoading ? '连接中...' : (
                <>
                  {mode === 'create' ? '创建' : '加入'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function FeatureItem({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-card">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
        {icon}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
