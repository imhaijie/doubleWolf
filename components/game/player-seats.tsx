'use client';

import { cn } from '@/lib/utils';
import type { SerializedPlayer } from '@/lib/types';
import { ROLE_DISPLAY, isPlayerOut } from '@/lib/types';

interface PlayerSeatsProps {
  players: SerializedPlayer[];
  currentPlayerId: string;
  selectedId?: string | null;
  onSelect?: (playerId: string) => void;
  selectableFilter?: (player: SerializedPlayer) => boolean;
  showRole?: boolean;
}

export function PlayerSeats({
  players,
  currentPlayerId,
  selectedId,
  onSelect,
  selectableFilter,
  showRole = false,
}: PlayerSeatsProps) {
  return (
    <div className="grid grid-cols-4 gap-2 p-4">
      {players.map((player) => {
        const isOut = isPlayerOut(player);
        const isCurrentPlayer = player.id === currentPlayerId;
        const isSelected = selectedId === player.id;
        const isSelectable = selectableFilter ? selectableFilter(player) : !isOut;
        const canSelect = onSelect && isSelectable && !isCurrentPlayer;

        // 获取当前身份
        const currentRole = player.identity1Alive 
          ? player.identity1 
          : player.identity2Alive 
            ? player.identity2 
            : null;

        return (
          <button
            key={player.id}
            onClick={() => canSelect && onSelect(player.id)}
            disabled={!canSelect}
            className={cn(
              'relative flex flex-col items-center gap-1 p-2 rounded-lg transition-all',
              'border-2',
              isOut && 'opacity-40',
              isSelected && 'border-primary bg-primary/10',
              !isSelected && isCurrentPlayer && 'border-accent bg-accent/10',
              !isSelected && !isCurrentPlayer && 'border-border bg-card',
              canSelect && 'hover:border-primary/50 cursor-pointer',
              !canSelect && !isCurrentPlayer && 'cursor-default',
            )}
          >
            {/* 座位号 */}
            <div 
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold',
                isOut ? 'bg-muted text-muted-foreground line-through' : 'bg-secondary text-secondary-foreground',
              )}
            >
              {player.seatNumber}
            </div>

            {/* 名字 */}
            <span className={cn(
              'text-xs truncate max-w-full',
              isCurrentPlayer && 'text-accent',
            )}>
              {player.name}
              {isCurrentPlayer && ' (你)'}
            </span>

            {/* 身份状态指示 */}
            <div className="flex gap-1">
              <div 
                className={cn(
                  'w-2 h-2 rounded-full',
                  player.identity1Alive ? 'bg-green-500' : 'bg-red-500',
                )}
                title={player.identity1Alive ? '第一身份存活' : '第一身份死亡'}
              />
              <div 
                className={cn(
                  'w-2 h-2 rounded-full',
                  player.identity2Alive ? 'bg-green-500' : 'bg-red-500',
                )}
                title={player.identity2Alive ? '第二身份存活' : '第二身份死亡'}
              />
            </div>

            {/* 显示角色（仅自己或复盘时） */}
            {showRole && currentRole && isCurrentPlayer && (
              <span 
                className="text-xs font-medium"
                style={{ color: ROLE_DISPLAY[currentRole.type].color }}
              >
                {ROLE_DISPLAY[currentRole.type].name}
              </span>
            )}

            {/* 选中标记 */}
            {isSelected && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                <span className="text-primary-foreground text-xs">✓</span>
              </div>
            )}

            {/* 离线标记 */}
            {!player.isOnline && (
              <div className="absolute inset-0 bg-background/60 rounded-lg flex items-center justify-center">
                <span className="text-xs text-muted-foreground">离线</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
