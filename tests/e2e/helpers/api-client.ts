import { APIRequestContext } from '@playwright/test';

export function createApiClient(request: APIRequestContext, apiKey?: string) {
  const headers = (extra?: Record<string, string>) => ({
    'Content-Type': 'application/json',
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
    ...extra,
  });

  return {
    // Health
    async health() {
      return request.get('/health');
    },

    async ready() {
      return request.get('/ready');
    },

    // API Keys
    async createApiKey(label = 'test') {
      return request.post('/api/v1/api-keys', {
        headers: headers(),
        data: { label },
      });
    },

    async listApiKeys() {
      return request.get('/api/v1/api-keys', { headers: headers() });
    },

    async deleteApiKey(id: string) {
      return request.delete(`/api/v1/api-keys/${id}`, { headers: headers() });
    },

    // Monitors
    async createMonitor(data: Record<string, unknown>) {
      return request.post('/api/v1/monitors', {
        headers: headers(),
        data,
      });
    },

    async getMonitor(id: string) {
      return request.get(`/api/v1/monitors/${id}`, { headers: headers() });
    },

    async listMonitors(params?: Record<string, string>) {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request.get(`/api/v1/monitors${qs}`, { headers: headers() });
    },

    async updateMonitor(id: string, data: Record<string, unknown>) {
      return request.patch(`/api/v1/monitors/${id}`, {
        headers: headers(),
        data,
      });
    },

    async deleteMonitor(id: string) {
      return request.delete(`/api/v1/monitors/${id}`, { headers: headers() });
    },

    async pauseMonitor(id: string) {
      return request.post(`/api/v1/monitors/${id}/pause`, { headers: headers() });
    },

    async resumeMonitor(id: string) {
      return request.post(`/api/v1/monitors/${id}/resume`, { headers: headers() });
    },

    async getMonitorPings(id: string) {
      return request.get(`/api/v1/monitors/${id}/pings`, { headers: headers() });
    },

    async getMonitorStats(id: string) {
      return request.get(`/api/v1/monitors/${id}/stats`, { headers: headers() });
    },

    // Pings
    async sendPing(uuid: string, type?: string) {
      if (!type) {
        return request.get(`/ping/${uuid}`);
      }
      return request.post(`/ping/${uuid}/${type}`, {
        headers: { 'Content-Type': 'application/json' },
        data: {},
      });
    },

    async sendPingWithBody(uuid: string, type: string, body: string) {
      return request.post(`/ping/${uuid}/${type}`, {
        headers: { 'Content-Type': 'application/json' },
        data: { body },
      });
    },

    // Incidents
    async listIncidents(status?: string) {
      const qs = status ? `?status=${status}` : '';
      return request.get(`/api/v1/incidents${qs}`, { headers: headers() });
    },

    async getIncident(id: string) {
      return request.get(`/api/v1/incidents/${id}`, { headers: headers() });
    },

    async acknowledgeIncident(id: string, by?: string) {
      return request.post(`/api/v1/incidents/${id}/acknowledge`, {
        headers: headers(),
        data: { acknowledgedBy: by },
      });
    },

    // Alert Configs
    async createAlertConfig(data: Record<string, unknown>) {
      return request.post('/api/v1/alert-configs', {
        headers: headers(),
        data,
      });
    },

    async listAlertConfigs(monitorId?: string) {
      const qs = monitorId ? `?monitorId=${monitorId}` : '';
      return request.get(`/api/v1/alert-configs${qs}`, { headers: headers() });
    },

    async deleteAlertConfig(id: string) {
      return request.delete(`/api/v1/alert-configs/${id}`, { headers: headers() });
    },

    // Dead Letters
    async listDeadLetters() {
      return request.get('/api/v1/dead-letters', { headers: headers() });
    },

    // Replay
    async createReplaySession(data: Record<string, unknown>) {
      return request.post('/api/v1/replay', {
        headers: headers(),
        data,
      });
    },

    async getReplaySession(id: string) {
      return request.get(`/api/v1/replay/${id}`, { headers: headers() });
    },

    // Teams
    async createTeam(data: Record<string, unknown>) {
      return request.post('/api/v1/teams', {
        headers: headers(),
        data,
      });
    },

    async listTeams() {
      return request.get('/api/v1/teams', { headers: headers() });
    },

    async deleteTeam(id: string) {
      return request.delete(`/api/v1/teams/${id}`, { headers: headers() });
    },

    // Dashboard
    async getDashboard() {
      return request.get('/api/v1/dashboard');
    },

    // Jobs
    async createJob(data: Record<string, unknown>) {
      return request.post('/api/v1/jobs', { headers: headers(), data });
    },
    async getJob(id: string) {
      return request.get(`/api/v1/jobs/${id}`, { headers: headers() });
    },
    async listJobs(params?: Record<string, string>) {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request.get(`/api/v1/jobs${qs}`, { headers: headers() });
    },
    async updateJob(id: string, data: Record<string, unknown>) {
      return request.patch(`/api/v1/jobs/${id}`, { headers: headers(), data });
    },
    async deleteJob(id: string) {
      return request.delete(`/api/v1/jobs/${id}`, { headers: headers() });
    },
    async pauseJob(id: string) {
      return request.post(`/api/v1/jobs/${id}/pause`, { headers: headers() });
    },
    async resumeJob(id: string) {
      return request.post(`/api/v1/jobs/${id}/resume`, { headers: headers() });
    },
    async triggerJob(id: string) {
      return request.post(`/api/v1/jobs/${id}/trigger`, { headers: headers() });
    },
    async getJobRuns(id: string, params?: Record<string, string>) {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request.get(`/api/v1/jobs/${id}/runs${qs}`, { headers: headers() });
    },
    async getJobRun(jobId: string, runId: string) {
      return request.get(`/api/v1/jobs/${jobId}/runs/${runId}`, { headers: headers() });
    },
    async getRunLogs(jobId: string, runId: string) {
      return request.get(`/api/v1/jobs/${jobId}/runs/${runId}/logs`, { headers: headers() });
    },
    async cancelRun(jobId: string, runId: string) {
      return request.post(`/api/v1/jobs/${jobId}/runs/${runId}/cancel`, { headers: headers() });
    },
    async getJobStats(id: string) {
      return request.get(`/api/v1/jobs/${id}/stats`, { headers: headers() });
    },
    // Workflows
    async getWorkflow(jobId: string) {
      return request.get(`/api/v1/jobs/${jobId}/workflow`, { headers: headers() });
    },
    async upsertWorkflow(jobId: string, data: Record<string, unknown>) {
      return request.put(`/api/v1/jobs/${jobId}/workflow`, { headers: headers(), data });
    },
    async getWorkflowRun(jobId: string, runId: string) {
      return request.get(`/api/v1/jobs/${jobId}/runs/${runId}/workflow`, { headers: headers() });
    },
    async cancelWorkflowRun(jobId: string, runId: string) {
      return request.post(`/api/v1/jobs/${jobId}/runs/${runId}/workflow/cancel`, { headers: headers() });
    },
    async sendWorkflowEvent(data: Record<string, unknown>) {
      return request.post('/api/v1/workflow-events', { headers: headers(), data });
    },
  };
}
