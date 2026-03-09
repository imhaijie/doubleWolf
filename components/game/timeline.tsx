'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { GameEvent } from '@/lib/types';

interface TimelineDialogProps {
  events: GameEvent[];
}

export function TimelineDialog({ events }: TimelineDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1"
      >
        <Clock className="w-4 h-4" />
        回合记录
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>操作时间轴</DialogTitle>
          </DialogHeader>
          <Card>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
              {events.map((event, index) => (
                <div
                  key={index}
                  className="flex gap-3 text-sm pb-2 border-b border-border last:border-0"
                >
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
            </CardContent>
          </Card>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
