import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, gte, desc, sql, count } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.provider';
import { monitors, pings, incidents } from '../database/schema';
import { CreateMonitorDto, UpdateMonitorDto } from './monitor.dto';

@Injectable()
export class MonitorService {
  private dashboardCache: { data: any; expiresAt: number } | null = null;

  constructor(@Inject(DRIZZLE) private db: Database) {}

  async create(dto: CreateMonitorDto) {
    const [monitor] = await this.db
      .insert(monitors)
      .values({
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        schedule: dto.schedule,
        intervalSeconds: dto.intervalSeconds,
        graceSeconds: dto.graceSeconds,
        maxRuntimeSeconds: dto.maxRuntimeSeconds,
        tags: dto.tags,
        teamId: dto.teamId,
        logRetentionDays: dto.logRetentionDays,
      })
      .returning();
    return monitor;
  }

  async findAll(filters?: { status?: string; tag?: string; teamId?: string }) {
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(monitors.status, filters.status as any));
    }
    if (filters?.teamId) {
      conditions.push(eq(monitors.teamId, filters.teamId));
    }
    if (filters?.tag) {
      conditions.push(sql`${monitors.tags} @> ${JSON.stringify([filters.tag])}::jsonb`);
    }
    if (conditions.length > 0) {
      return this.db.select().from(monitors).where(and(...conditions));
    }
    return this.db.select().from(monitors);
  }

  async findById(id: string) {
    const [monitor] = await this.db
      .select()
      .from(monitors)
      .where(eq(monitors.id, id))
      .limit(1);
    if (!monitor) throw new NotFoundException('Monitor not found');
    return monitor;
  }

  async findByPingUuid(pingUuid: string) {
    const [monitor] = await this.db
      .select()
      .from(monitors)
      .where(eq(monitors.pingUuid, pingUuid))
      .limit(1);
    if (!monitor) throw new NotFoundException('Monitor not found');
    return monitor;
  }

  async update(id: string, dto: UpdateMonitorDto) {
    const [monitor] = await this.db
      .update(monitors)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(monitors.id, id))
      .returning();
    if (!monitor) throw new NotFoundException('Monitor not found');
    return monitor;
  }

  async delete(id: string) {
    const [monitor] = await this.db
      .delete(monitors)
      .where(eq(monitors.id, id))
      .returning({ id: monitors.id });
    if (!monitor) throw new NotFoundException('Monitor not found');
  }

  async pause(id: string, paused: boolean) {
    const status = paused ? 'paused' as const : 'healthy' as const;
    const [monitor] = await this.db
      .update(monitors)
      .set({ isPaused: paused, status, updatedAt: new Date() })
      .where(eq(monitors.id, id))
      .returning();
    if (!monitor) throw new NotFoundException('Monitor not found');
    return monitor;
  }

  async getPings(id: string, limit = 50) {
    return this.db
      .select()
      .from(pings)
      .where(eq(pings.monitorId, id))
      .orderBy(desc(pings.createdAt))
      .limit(limit);
  }

  async getStats(id: string) {
    const monitor = await this.findById(id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const [pingStats] = await this.db
      .select({
        total: count(),
        successes: count(sql`CASE WHEN ${pings.type} = 'success' THEN 1 END`),
        failures: count(sql`CASE WHEN ${pings.type} = 'fail' THEN 1 END`),
        avgDuration: sql<number>`avg(${pings.durationMs})`,
      })
      .from(pings)
      .where(
        and(
          eq(pings.monitorId, id),
          gte(pings.createdAt, thirtyDaysAgo),
        ),
      );

    const [incidentStats] = await this.db
      .select({
        total: count(),
        open: count(sql`CASE WHEN ${incidents.status} = 'open' THEN 1 END`),
      })
      .from(incidents)
      .where(eq(incidents.monitorId, id));

    const total = Number(pingStats?.total ?? 0);
    const successes = Number(pingStats?.successes ?? 0);

    return {
      monitorId: id,
      period: '30d',
      pings: {
        total,
        successes,
        failures: Number(pingStats?.failures ?? 0),
        uptimePercent: total > 0 ? Math.round((successes / total) * 10000) / 100 : 100,
      },
      avgRuntimeMs: pingStats?.avgDuration ? Math.round(Number(pingStats.avgDuration)) : null,
      incidents: {
        total: Number(incidentStats?.total ?? 0),
        open: Number(incidentStats?.open ?? 0),
      },
      status: monitor.status,
      consecutiveFailures: monitor.consecutiveFailures,
    };
  }

  async getDashboardStats() {
    if (this.dashboardCache && this.dashboardCache.expiresAt > Date.now()) {
      return this.dashboardCache.data;
    }

    const allMonitors = await this.db.select().from(monitors);
    const total = allMonitors.length;
    const healthy = allMonitors.filter((m) => m.status === 'healthy').length;
    const down = allMonitors.filter((m) => m.status === 'down').length;
    const late = allMonitors.filter((m) => m.status === 'late').length;
    const paused = allMonitors.filter((m) => m.status === 'paused').length;

    const [incidentCount] = await this.db
      .select({ count: count() })
      .from(incidents)
      .where(eq(incidents.status, 'open'));

    const data = {
      monitors: { total, healthy, down, late, paused },
      openIncidents: Number(incidentCount?.count ?? 0),
    };

    this.dashboardCache = { data, expiresAt: Date.now() + 30_000 };

    return data;
  }
}
