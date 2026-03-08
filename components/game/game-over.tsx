'use client';

import { motion } from 'framer-motion';
import { RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { GameState } from '@/hooks/use-game-state';
import type { RoleType } from '@/lib/types';
import { ROLE_DISPLAY } from '@/lib/types';
import { leaveRoom } from '@/lib/socket';
import { useRouter } from 'next/navigation';

interface GameOverProps {
  gameState: GameState;
}

const roleTypeToColor: Record<RoleType, string> = {
  'werewolf': 'bg-red-500/20 text-red-700 dark:text-red-400',
  'white-wolf-king': 'bg-red-600/20 text-red-800 dark:text-red-300',
  'seer': 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  'witch': 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  'hunter': 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  'guard': 'bg-green-500/20 text-green-700 dark:text-green-400',
  'villager': 'bg-slate-500/20 text-slate-700 dark:text-slate-400',
};

export function GameOver({ gameState }: GameOverProps) {
  const router = useRouter();
  const { winner, recap, room } = gameState;

  const handleLeaveRoom = () => {
    leaveRoom();
    router.push('/');
  };

  const handleNewGame = () => {
    leaveRoom();
    router.push('/');
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-3xl space-y-6"
      >
        {/* 游戏结束标题 */}
        <motion.div variants={itemVariants} className="text-center space-y-2">
          <h1 className="text-5xl font-bold">游戏结束</h1>
          <p className="text-lg text-muted-foreground">
            {winner === 'wolf' ? '狼人阵营胜利！' : '村民阵营胜利！'}
          </p>
        </motion.div>

        {/* 获胜者标识 */}
        <motion.div variants={itemVariants} className="flex justify-center">
          <Badge
            className={`text-lg px-6 py-2 ${
              winner === 'wolf'
                ? 'bg-red-500/20 text-red-700 dark:text-red-400'
                : 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
            }`}
          >
            {winner === 'wolf' ? '🐺 狼人阵营' : '🏘️ 村民阵营'}
          </Badge>
        </motion.div>

        {/* 玩家最终身份 */}
        {recap && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle>最终身份</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {recap.players.map((player) => {
                    const survived = player.finalStatus === 'alive';
                    const roles = [player.identity1, player.identity2].filter(Boolean);
                    
                    return (
                      <div
                        key={player.id}
                        className={`p-3 rounded-lg border ${
                          survived
                            ? 'bg-card border-border'
                            : 'bg-muted/50 border-muted-foreground/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="font-semibold">
                              【{player.seatNumber}号】{player.name}
                              {!survived && (
                                <span className="text-muted-foreground text-sm ml-2">
                                  (已阵亡)
                                </span>
                              )}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {roles.map((role) => (
                                <Badge
                                  key={role!.id}
                                  variant="outline"
                                  className={roleTypeToColor[role!.type]}
                                >
                                  {ROLE_DISPLAY[role!.type]?.name || role!.type}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          {survived && (
                            <span className="text-xl">✓</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* 游戏统计 */}
        {recap && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle>游戏统计</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">总轮数</p>
                    <p className="text-2xl font-bold">{recap.totalNights}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">生存者数</p>
                    <p className="text-2xl font-bold">
                      {recap.players.filter((p) => p.finalStatus === 'alive').length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* 操作时间轴 */}
        {recap && recap.timeline && recap.timeline.length > 0 && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle>操作时间轴</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {recap.timeline.map((event, index) => (
                    <div key={index} className="flex gap-3 text-sm pb-2 border-b border-border last:border-0">
                      <div className="text-muted-foreground whitespace-nowrap">
                        {event.phase === 'night' && `第${event.nightNumber}夜`}
                        {event.phase === 'day-announce' && '死亡公告'}
                        {event.phase === 'day-speech' && '白天发言'}
                        {event.phase === 'day-vote' && '白天投票'}
                      </div>
                      <div className="flex-1">
                        <p className="text-foreground">{event.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* 操作按钮 */}
        <motion.div
          variants={itemVariants}
          className="flex gap-3 justify-center flex-wrap"
        >
          <Button
            size="lg"
            onClick={handleNewGame}
            className="gap-2"
          >
            <Home className="w-4 h-4" />
            返回大厅
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={handleLeaveRoom}
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            离开游戏
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
