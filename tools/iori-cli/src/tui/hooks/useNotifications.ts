import { useCallback, useState } from 'react';

import type { Client } from '../../client.js';
import type { NotificationItemData, NotificationsResponse } from '../../types.js';

interface UseNotificationsResult {
  items: NotificationItemData[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useNotifications(client: Client): UseNotificationsResult {
  const [items, setItems] = useState<NotificationItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.get<NotificationsResponse>('/api/v1/notifications');
      setItems(data.notifications);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { items, loading, error, reload };
}
