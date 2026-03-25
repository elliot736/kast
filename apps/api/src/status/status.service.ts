import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, desc, gte, sql, count } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.provider';
import { monitors, pings, incidents, teams } from '../database/schema';

export interface StatusMonitor {
  id: string;
  name: string;
  status: 'healthy' | 'late' | 'down' | 'paused';
  uptimePercent: number;
  lastPingAt: string | null;
  dailyUptime: { date: string; percent: number }[];
}

export interface StatusPage {
  teamName: string;
  teamSlug: string;
  overall: 'operational' | 'degraded' | 'outage';
  monitors: StatusMonitor[];
  activeIncidents: {
    id: string;
    monitorName: string;
    reason: string;
    startedAt: string;
    status: string;
  }[];
  recentIncidents: {
    id: string;
    monitorName: string;
    reason: string;
    startedAt: string;
    resolvedAt: string | null;
    downtimeSeconds: number | null;
  }[];
}

@Injectable()
export class StatusService {
  constructor(@Inject(DRIZZLE) private db: Database) {}

  async getStatusPage(teamSlug: string): Promise<StatusPage> {
    // Find team
    const [team] = await this.db
      .select()
      .from(teams)
      .where(eq(teams.slug, teamSlug))
      .limit(1);

    if (!team) throw new NotFoundException('Team not found');

    // Get monitors for this team
    const teamMonitors = await this.db
      .select()
      .from(monitors)
      .where(eq(monitors.teamId, team.id));

    // Compute per-monitor stats
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const statusMonitors: StatusMonitor[] = [];

    for (const monitor of teamMonitors) {
      if (monitor.isPaused) continue;

      // Get pings for last 30 days
      const monitorPings = await this.db
        .select({
          type: pings.type,
          createdAt: pings.createdAt,
        })
        .from(pings)
        .where(
          and(
            eq(pings.monitorId, monitor.id),
            gte(pings.createdAt, thirtyDaysAgo),
          ),
        )
        .orderBy(desc(pings.createdAt));

      // Daily uptime calculation
      const dayMap = new Map<string, { success: number; total: number }>();
      for (const ping of monitorPings) {
        if (ping.type !== 'success' && ping.type !== 'fail') continue;
        const day = ping.createdAt.toISOString().slice(0, 10);
        const entry = dayMap.get(day) ?? { success: 0, total: 0 };
        entry.total++;
        if (ping.type === 'success') entry.success++;
        dayMap.set(day, entry);
      }

      // Build 30-day array
      const dailyUptime: { date: string; percent: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        const entry = dayMap.get(date);
        dailyUptime.push({
          date,
          percent: entry && entry.total > 0
            ? Math.round((entry.success / entry.total) * 10000) / 100
            : 100,
        });
      }

      // Overall uptime
      const total = monitorPings.filter((p) => p.type === 'success' || p.type === 'fail').length;
      const successes = monitorPings.filter((p) => p.type === 'success').length;
      const uptimePercent = total > 0
        ? Math.round((successes / total) * 10000) / 100
        : 100;

      statusMonitors.push({
        id: monitor.id,
        name: monitor.name,
        status: monitor.status as StatusMonitor['status'],
        uptimePercent,
        lastPingAt: monitor.lastPingAt?.toISOString() ?? null,
        dailyUptime,
      });
    }

    // Active incidents
    const monitorIds = teamMonitors.map((m) => m.id);
    const monitorNameMap = new Map(teamMonitors.map((m) => [m.id, m.name]));

    const activeIncidents = monitorIds.length > 0
      ? await this.db
          .select()
          .from(incidents)
          .where(
            and(
              sql`${incidents.monitorId} = ANY(${monitorIds})`,
              sql`${incidents.status} IN ('open', 'acknowledged')`,
            ),
          )
          .orderBy(desc(incidents.startedAt))
      : [];

    // Recent resolved incidents (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const recentIncidents = monitorIds.length > 0
      ? await this.db
          .select()
          .from(incidents)
          .where(
            and(
              sql`${incidents.monitorId} = ANY(${monitorIds})`,
              eq(incidents.status, 'resolved'),
              gte(incidents.startedAt, sevenDaysAgo),
            ),
          )
          .orderBy(desc(incidents.startedAt))
          .limit(20)
      : [];

    // Overall status
    const hasDown = statusMonitors.some((m) => m.status === 'down');
    const hasLate = statusMonitors.some((m) => m.status === 'late');
    const overall = hasDown ? 'outage' : hasLate ? 'degraded' : 'operational';

    return {
      teamName: team.name,
      teamSlug: team.slug,
      overall,
      monitors: statusMonitors,
      activeIncidents: activeIncidents.map((i) => ({
        id: i.id,
        monitorName: monitorNameMap.get(i.monitorId) ?? 'Unknown',
        reason: i.reason ?? 'Unknown',
        startedAt: i.startedAt.toISOString(),
        status: i.status,
      })),
      recentIncidents: recentIncidents.map((i) => ({
        id: i.id,
        monitorName: monitorNameMap.get(i.monitorId) ?? 'Unknown',
        reason: i.reason ?? 'Unknown',
        startedAt: i.startedAt.toISOString(),
        resolvedAt: i.resolvedAt?.toISOString() ?? null,
        downtimeSeconds: i.downtimeSeconds,
      })),
    };
  }
}
