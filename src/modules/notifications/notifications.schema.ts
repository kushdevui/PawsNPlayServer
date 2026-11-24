import { z } from 'zod';

export const listNotificationsQuery = z
  .object({
    unread: z
      .enum(['true', 'false'], { errorMap: () => ({ message: 'unread must be true or false.' }) })
      .transform((value) => value === 'true')
      .optional(),
  })
  .passthrough();
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>;
