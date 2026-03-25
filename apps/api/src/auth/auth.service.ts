import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.provider';
import { apiKeys } from '../database/schema';

@Injectable()
export class AuthService {
  constructor(@Inject(DRIZZLE) private db: Database) {}

  async createApiKey(label?: string): Promise<{ key: string; id: string }> {
    const raw = 'kst_' + randomBytes(24).toString('base64url');
    const keyHash = createHash('sha256').update(raw).digest('hex');
    const keyPrefix = raw.slice(0, 8);

    const [row] = await this.db
      .insert(apiKeys)
      .values({ keyHash, keyPrefix, label })
      .returning({ id: apiKeys.id });

    return { key: raw, id: row.id };
  }

  async validateApiKey(key: string): Promise<boolean> {
    const keyHash = createHash('sha256').update(key).digest('hex');

    const [row] = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    if (!row) return false;

    if (row.expiresAt && row.expiresAt < new Date()) return false;

    // Update last used timestamp (fire-and-forget)
    this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, row.id))
      .then(() => {});

    return true;
  }

  async listApiKeys() {
    return this.db
      .select({
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        label: apiKeys.label,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys);
  }

  async deleteApiKey(id: string) {
    await this.db.delete(apiKeys).where(eq(apiKeys.id, id));
  }
}
