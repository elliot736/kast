import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { WorkflowService } from './workflow.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createChainMock(finalResult?: unknown[]) {
  const chain: Record<string, any> = {};
  const methods = [
    'select',
    'insert',
    'update',
    'delete',
    'from',
    'where',
    'set',
    'values',
    'limit',
    'orderBy',
    'offset',
  ];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.returning = vi.fn().mockResolvedValue(finalResult ?? []);
  // Make the chain thenable so `await chain` resolves to finalResult
  chain.then = (resolve: any) => resolve(finalResult ?? []);
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowService', () => {
  let service: WorkflowService;
  let mockDb: Record<string, any>;

  beforeEach(() => {
    mockDb = {};
    service = new WorkflowService(mockDb as any);
  });

  // -----------------------------------------------------------------------
  // getByJobId
  // -----------------------------------------------------------------------

  describe('getByJobId', () => {
    it('returns the latest version when a workflow exists', async () => {
      const workflow = {
        id: 'wf-1',
        jobId: 'job-1',
        version: 3,
        steps: [{ id: 's1', name: 'step1', type: 'run', config: {} }],
        createdAt: new Date(),
      };

      const chain = createChainMock([workflow]);
      mockDb.select = vi.fn().mockReturnValue(chain);

      const result = await service.getByJobId('job-1');

      expect(result).toEqual(workflow);
      expect(mockDb.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.orderBy).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('returns null when no workflow exists for the job', async () => {
      const chain = createChainMock([]);
      mockDb.select = vi.fn().mockReturnValue(chain);

      const result = await service.getByJobId('nonexistent-job');

      expect(result).toBeNull();
    });

    it('returns null when the select result is undefined', async () => {
      // Simulate destructuring of an empty array → undefined
      const chain = createChainMock([]);
      mockDb.select = vi.fn().mockReturnValue(chain);

      const result = await service.getByJobId('no-match');

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // upsert
  // -----------------------------------------------------------------------

  describe('upsert', () => {
    it('creates a new workflow with version 1 when no existing workflow', async () => {
      const newWorkflow = {
        id: 'wf-new',
        jobId: 'job-1',
        version: 1,
        steps: [{ id: 's1', name: 'Call API', type: 'run', config: { url: 'https://example.com', method: 'GET' } }],
        createdAt: new Date(),
      };

      // getByJobId returns nothing
      const selectChain = createChainMock([]);
      mockDb.select = vi.fn().mockReturnValue(selectChain);

      // insert returns the new workflow
      const insertChain = createChainMock([newWorkflow]);
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const dto = {
        steps: [{ id: 's1', name: 'Call API', type: 'run' as const, config: { url: 'https://example.com', method: 'GET' } }],
      };

      const result = await service.upsert('job-1', dto);

      expect(result).toEqual(newWorkflow);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-1',
          version: 1,
          // Legacy array auto-migrated to graph format
          steps: expect.objectContaining({ nodes: expect.any(Array), edges: expect.any(Array) }),
        }),
      );
      expect(insertChain.returning).toHaveBeenCalled();
    });

    it('increments version when a workflow already exists', async () => {
      const existing = {
        id: 'wf-1',
        jobId: 'job-1',
        version: 2,
        steps: { nodes: [], edges: [] },
        createdAt: new Date(),
      };
      const updated = {
        id: 'wf-2',
        jobId: 'job-1',
        version: 3,
        steps: { nodes: [{ id: 's1' }], edges: [] },
        createdAt: new Date(),
      };

      const selectChain = createChainMock([existing]);
      mockDb.select = vi.fn().mockReturnValue(selectChain);

      const insertChain = createChainMock([updated]);
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      // Pass graph format directly
      const dto = {
        steps: { nodes: [{ id: 's1', name: 'New Step', type: 'run', config: { url: 'https://example.com', method: 'POST' } }], edges: [] },
      };

      const result = await service.upsert('job-1', dto);

      expect(result).toEqual(updated);
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-1',
          version: 3,
          steps: dto.steps,
        }),
      );
    });

    it('returns the created workflow entity', async () => {
      const created = { id: 'wf-abc', jobId: 'j1', version: 1, steps: [], createdAt: new Date() };

      const selectChain = createChainMock([]);
      mockDb.select = vi.fn().mockReturnValue(selectChain);

      const insertChain = createChainMock([created]);
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const result = await service.upsert('j1', { steps: [] as any });

      expect(result).toBe(created);
    });
  });

  // -----------------------------------------------------------------------
  // getWorkflowRun
  // -----------------------------------------------------------------------

  describe('getWorkflowRun', () => {
    it('returns a run with step results when found', async () => {
      const workflow = { id: 'wf-1', jobId: 'job-1', version: 1, steps: { nodes: [{ id: 's1', name: 's1', type: 'start', config: {} }], edges: [] } };
      const wfRun = { id: 'run-1', workflowId: 'wf-1', jobRunId: 'jr-1', status: 'completed' };
      const stepResults = [
        { id: 'sr-1', workflowRunId: 'run-1', stepIndex: 0, status: 'completed', output: { data: 'ok' } },
      ];

      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // getByJobId -> workflow
          return createChainMock([workflow]);
        }
        if (selectCallCount === 2) {
          // workflowRun lookup
          return createChainMock([wfRun]);
        }
        // step results
        return createChainMock(stepResults);
      });

      const result = await service.getWorkflowRun('job-1', 'jr-1');

      expect(result).toEqual({
        ...wfRun,
        steps: workflow.steps,
        stepResults,
      });
      expect(selectCallCount).toBe(3);
    });

    it('throws NotFoundException when no workflow exists for the job', async () => {
      mockDb.select = vi.fn().mockReturnValue(createChainMock([]));

      await expect(service.getWorkflowRun('bad-job', 'run-1')).rejects.toThrow(NotFoundException);
      await expect(service.getWorkflowRun('bad-job', 'run-1')).rejects.toThrow('Workflow not found for this job');
    });

    it('throws NotFoundException when workflow exists but run not found', async () => {
      const workflow = { id: 'wf-1', jobId: 'job-1', version: 1, steps: [] };

      // Each call to getWorkflowRun triggers two selects:
      //   1) getByJobId -> workflow found
      //   2) workflowRun lookup -> empty (not found)
      // We call getWorkflowRun twice (for two expect assertions), so we need 4 results.
      const selectResults = [
        [workflow], [], // first call
        [workflow], [], // second call
      ];
      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        const result = selectResults[selectCallCount] ?? [];
        selectCallCount++;
        return createChainMock(result);
      });

      await expect(service.getWorkflowRun('job-1', 'missing-run')).rejects.toThrow(NotFoundException);
      await expect(service.getWorkflowRun('job-1', 'missing-run')).rejects.toThrow('Workflow run not found');
    });
  });

  // -----------------------------------------------------------------------
  // cancelWorkflowRun
  // -----------------------------------------------------------------------

  describe('cancelWorkflowRun', () => {
    it('sets status to cancelled and returns the updated run', async () => {
      const workflow = { id: 'wf-1', jobId: 'job-1', version: 1, steps: [] };
      const cancelledRun = {
        id: 'run-1',
        workflowId: 'wf-1',
        jobRunId: 'jr-1',
        status: 'cancelled',
        finishedAt: expect.any(Date),
      };

      // getByJobId
      mockDb.select = vi.fn().mockReturnValue(createChainMock([workflow]));

      // update chain
      const updateChain = createChainMock([cancelledRun]);
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const result = await service.cancelWorkflowRun('job-1', 'jr-1');

      expect(result).toEqual(cancelledRun);
      expect(mockDb.update).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          finishedAt: expect.any(Date),
        }),
      );
      expect(updateChain.where).toHaveBeenCalled();
      expect(updateChain.returning).toHaveBeenCalled();
    });

    it('throws NotFoundException when no workflow exists for the job', async () => {
      mockDb.select = vi.fn().mockReturnValue(createChainMock([]));

      await expect(service.cancelWorkflowRun('bad-job', 'run-1')).rejects.toThrow(NotFoundException);
      await expect(service.cancelWorkflowRun('bad-job', 'run-1')).rejects.toThrow('Workflow not found for this job');
    });

    it('throws NotFoundException when update returns empty (run not found)', async () => {
      const workflow = { id: 'wf-1', jobId: 'job-1', version: 1, steps: [] };

      mockDb.select = vi.fn().mockReturnValue(createChainMock([workflow]));

      const updateChain = createChainMock([]);
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      await expect(service.cancelWorkflowRun('job-1', 'missing-run')).rejects.toThrow(NotFoundException);
      await expect(service.cancelWorkflowRun('job-1', 'missing-run')).rejects.toThrow('Workflow run not found');
    });
  });
});
