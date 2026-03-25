import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.provider';
import { teams } from '../database/schema';
import type { CreateTeamDto, UpdateTeamDto } from './team.dto';

@Injectable()
export class TeamService {
  constructor(@Inject(DRIZZLE) private db: Database) {}

  async create(dto: CreateTeamDto) {
    const [team] = await this.db.insert(teams).values(dto).returning();
    return team;
  }

  async findAll() {
    return this.db.select().from(teams);
  }

  async findById(id: string) {
    const [team] = await this.db
      .select()
      .from(teams)
      .where(eq(teams.id, id))
      .limit(1);
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  async update(id: string, dto: UpdateTeamDto) {
    const [team] = await this.db
      .update(teams)
      .set(dto)
      .where(eq(teams.id, id))
      .returning();
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  async delete(id: string) {
    const [team] = await this.db
      .delete(teams)
      .where(eq(teams.id, id))
      .returning({ id: teams.id });
    if (!team) throw new NotFoundException('Team not found');
  }
}
