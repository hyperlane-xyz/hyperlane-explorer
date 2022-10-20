import type { NextApiRequest, NextApiResponse } from 'next';

import { fetchDeliveryStatus } from '../../features/deliveryStatus/fetchDeliveryStatus';
import type { MessageDeliveryStatusResponse } from '../../features/deliveryStatus/types';
import { Message } from '../../types';
import { logger } from '../../utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MessageDeliveryStatusResponse>,
) {
  try {
    const message = req.body as Message;
    if (!message) throw new Error('No message in body');
    const deliverStatus = await fetchDeliveryStatus(message);
    res.status(200).json(deliverStatus);
  } catch (error) {
    logger.error('Error determining message status', error);
    res.status(500);
  }
}

export const config = {
  api: {
    responseLimit: '5kb',
    bodyParser: {
      sizeLimit: '5kb',
    },
  },
};
