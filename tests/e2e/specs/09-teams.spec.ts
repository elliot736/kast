import { test, expect } from '@playwright/test';
import { createApiClient } from '../helpers/api-client';

let apiKey: string;
let teamId: string;
let teamSlug: string;

test.describe('Teams', () => {
  test.beforeAll(async ({ request }) => {
    const client = createApiClient(request);
    const keyRes = await client.createApiKey('teams-test');
    apiKey = (await keyRes.json()).key;

    // Create team in beforeAll
    teamSlug = `backend-team-${Date.now()}`;
    const authClient = createApiClient(request, apiKey);
    const res = await authClient.createTeam({
      name: 'Backend Team',
      slug: teamSlug,
    });
    const team = await res.json();
    teamId = team.id;
  });

  test('team was created correctly', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.listTeams();
    expect(res.ok()).toBeTruthy();
    const teams = await res.json();
    const team = teams.find((t: any) => t.id === teamId);
    expect(team).toBeTruthy();
    expect(team.name).toBe('Backend Team');
    expect(team.slug).toBe(teamSlug);
  });

  test('list teams includes created team', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.listTeams();
    expect(res.ok()).toBeTruthy();
    const teams = await res.json();
    expect(teams.some((t: any) => t.id === teamId)).toBeTruthy();
  });

  test('delete team', async ({ request }) => {
    const client = createApiClient(request, apiKey);
    const res = await client.deleteTeam(teamId);
    expect(res.ok()).toBeTruthy();

    const listRes = await client.listTeams();
    const teams = await listRes.json();
    expect(teams.some((t: any) => t.id === teamId)).toBeFalsy();
  });
});
