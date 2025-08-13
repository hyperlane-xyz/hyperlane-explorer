import type { NextApiRequest, NextApiResponse } from 'next';
import { config } from '../../consts/config';
import axios from "axios";
import { createClient } from 'redis';

const API_KEY = process.env.NEXT_PUBLIC_INTERNAL_API_KEY;
const API_ROLE = process.env.NEXT_PUBLIC_INTERNAL_API_ROLE;
const APP_URL = process.env.NEXT_PUBLIC_INTERNAL_APP_URL || "https://explorer.hyperlane.xyz";

const REDIS_URL = process.env.REDIS_URL;
const REDIS_USERNAME = process.env.REDIS_USERNAMENEXT_PUBLIC_INTERNAL_;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

const redisClient = createClient({
  url: REDIS_URL,
  username: REDIS_USERNAME,
  password: REDIS_PASSWORD,
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
if (!redisClient.isReady) {
  redisClient.connect().catch(err => console.error('Failed to connect to Redis', err));
}

const AUTH0_TOKEN_REDIS_KEY = 'auth0_graphql_token';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const requestSecret = req.headers.authorization;
  let authorized = true;

  if (requestSecret !== `Bearer ${API_KEY}`) {
    authorized = false;
  }

  if (req.headers.origin !== APP_URL && !req.headers.referer?.startsWith(APP_URL)) {
    authorized = false;
  }

  let graphQLToken = "";

  if (authorized) {
    try {
      const cachedToken = await redisClient.get(AUTH0_TOKEN_REDIS_KEY);
      if (cachedToken) {
        graphQLToken = cachedToken;
      }

      // If token is not in cache, fetch it from Auth0
      if (!graphQLToken) {
        const auth0options = {
          method: 'POST',
          url: process.env.NEXT_PUBLIC_INTERNAL_AUTH0_DOMAIN,
          headers: {'content-type': 'application/json'},
          data: {
            'grant_type': 'client_credentials',
            'client_id': process.env.NEXT_PUBLIC_INTERNAL_AUTH0_CLIENT_ID,
            'client_secret': process.env.NEXT_PUBLIC_INTERNAL_AUTH0_CLIENT_SECRET,
            'audience': 'https://explorer4.hasura.app/v1/graphql',
          }
        };

        const { data } = await axios.request(auth0options);
        graphQLToken = data.access_token;

        // Store the new token in Redis
        if (redisClient.isReady && graphQLToken) {
          const expiresIn = data.expires_in || 86400;
          await redisClient.set(AUTH0_TOKEN_REDIS_KEY, graphQLToken, {
            EX: expiresIn - 60, // Set expiry in seconds, with a 60-second buffer
          });
        }
      }
    } catch (error) {
      console.error('Error fetching or caching Auth0 token:', error);
    }
  }

  try {
    // Forward the request to the Hasura GraphQL API
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-role': API_ROLE,
        // Add Authorization header only if graphQLToken is available
        ...(graphQLToken !== "" && { Authorization: `Bearer ${graphQLToken}` }),
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error forwarding request to GraphQL API:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
