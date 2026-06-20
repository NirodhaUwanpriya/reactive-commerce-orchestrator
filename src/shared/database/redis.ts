import { createClient } from 'redis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || '6379';

export const cache = {
  // 1. Instantiating the client driver
  rawClient: createClient({
    url: `redis://${redisHost}:${redisPort}`
  }),

  // 2. The explicit network initialization routine
  async initialize(): Promise<void> {
    try {
      this.rawClient.on('error', (err) => console.error('💥 Redis Runtime Error:', err));
      await this.rawClient.connect();
      console.log('⚡ Connected to Redis Cache Engine successfully.');
    } catch (error) {
      console.error('❌ Redis Initialization Failed:', error);
      throw error;
    }
  },

  // 3. Reusable cache-aside wrapper utilities
  async get(key: string): Promise<string | null> {
    return await this.rawClient.get(key);
  },

  async set(key: string, value: string, ttlSeconds = 300): Promise<void> {
    await this.rawClient.set(key, value, { EX: ttlSeconds });
  },

  async del(key: string): Promise<void> {
    await this.rawClient.del(key);
  }
};