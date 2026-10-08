#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/cancel-build.yml', import.meta.url), 'utf8');
const script = workflow.split('script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n');
const execute = new (Object.getPrototypeOf(async function () {}).constructor)('github', 'context', 'Date', 'setTimeout', script);
assert(workflow.includes('retries: 3'));
const error = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
async function scenario({ cancelError, forceError, statusError, finishAt = 0, conclusion = 'cancelled', noActive = false, duplicate = false, commenter = 'user' } = {}) {
  let time = 0, force = 0, cancels = 0, reads = 0;
  const comments = [], updates = [];
  const run = { id: 42, display_title: 'dev/#594/example', event: 'workflow_dispatch', html_url: 'https://github.com/example/repo/actions/runs/42' };
  const github = {
    paginate: async (_, { status }) => noActive || (status === 'queued' && !duplicate) ? [] : [run],
    rest: {
      repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission: 'read' } }) },
      issues: { createComment: async input => comments.push(input), update: async input => updates.push(input) },
      actions: {
        listWorkflowRuns() {},
        cancelWorkflowRun: async () => { cancels++; if (cancelError) throw error(cancelError); },
        getWorkflowRun: async () => {
          reads++;
          if (statusError && reads === 1) throw error(statusError);
          return { data: { status: time >= finishAt ? 'completed' : 'in_progress', conclusion } };
        },
      },
    },
    request: async () => { force++; if (forceError && force === 1) throw error(forceError); },
  };
  const context = { repo: { owner: 'owner', repo: 'repo' }, payload: {
    comment: { body: '/cancel', user: { login: commenter } },
    issue: { number: 594, title: '[build] example', user: { login: 'user' } },
  } };
  let failure;
  try { await execute(github, context, { now: () => time }, (callback, ms) => { time += ms; callback(); }); }
  catch (caught) { failure = caught; }
  return { comments, updates, force, cancels, reads, failure };
}
for (const options of [
  {}, { cancelError: 502, finishAt: 10000 }, { forceError: 502, finishAt: 25000 },
  { cancelError: 409 }, { statusError: 503 }, { conclusion: 'success' }, { noActive: true }, { duplicate: true },
]) {
  const result = await scenario(options);
  assert.equal(result.failure, undefined, JSON.stringify(options));
  assert.equal(result.updates[0].state, 'closed');
  assert.equal(result.updates.length, 1, 'close the authorized Issue once before discovery');
  if (options.duplicate) assert.equal(result.cancels, 1, 'queued/in_progress transition must not duplicate cancellation');
  if (!options.noActive) assert(result.comments.at(-1).body.includes('Build stopped'));
  if (options.finishAt === 25000) assert.equal(result.force, 2, 'ambiguous force response must be reconciled/retried');
}
assert.match((await scenario({ finishAt: Infinity })).failure.message, /not confirmed/);
assert.equal((await scenario({ cancelError: 403 })).failure.status, 403, 'permission errors remain failures');
const denied = await scenario({ commenter: 'stranger' });
assert.equal(denied.cancels, 0); assert.equal(denied.updates.length, 0);
assert(denied.comments[0].body.includes('Permission denied'));
console.log('PASS cancellation reconciliation: normal/force 502, races, polling, timeout, authorization');
