'use client';

import { AnimatePresence, motion } from 'framer-motion';

interface DeathEvent {
  playerId: string;
  identity: 1 | 2;
  message: string;
  timestamp: number;
}

interface DeathNotificationProps {
  events: DeathEvent[];
}

export function DeathNotification({ events }: DeathNotificationProps) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {events.map((event) => (
          <motion.div
            key={event.timestamp}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="bg-card border border-border px-6 py-3 rounded-lg shadow-lg text-center"
          >
            <p className="text-foreground font-medium">{event.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
