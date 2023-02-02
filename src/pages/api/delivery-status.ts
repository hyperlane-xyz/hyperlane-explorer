import type { NextApiRequest, NextApiResponse } from 'next';
import NextCors from 'nextjs-cors';

import { fetchDeliveryStatus } from '../../features/deliveryStatus/fetchDeliveryStatus';
import type { MessageDeliveryStatusResponse } from '../../features/deliveryStatus/types';
import { Message } from '../../types';
import { logger } from '../../utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MessageDeliveryStatusResponse | string>,
) {
  await NextCors(req, res, {
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    origin: '*',
    optionsSuccessStatus: 200,
  });

  try {
    const message = req.body as Message;
    if (!message) throw new Error('No message in body');
    const deliverStatus = await fetchDeliveryStatus(message);
    res.status(200).json(deliverStatus);
  } catch (error) {
    const msg = 'Unable to determine message status';
    logger.error(msg, error);
    res.status(500).send(msg);
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
