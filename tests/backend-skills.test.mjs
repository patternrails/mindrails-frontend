import test from 'node:test';
import assert from 'node:assert/strict';
import { BackendClient } from '../src/lib/backend-client.ts';
import { skillPath, parseSkill, parseSkillPage, parseSkillDetail, parseSkillConfig, uploadSkill } from '../src/lib/backend-skills.ts';

const skill = { id: '00000000-0000-4000-8000-000000000001', ownerId: '00000000-0000-4000-8000-000000000099', name: 'test-skill', description: 'Use for tests', root: '/skills/test-skill' };

test('Skills accepts native names and the minimal DTO, including bundled skills', () => {
  assert.deepEqual(parseSkill(skill), skill);
  assert.deepEqual(parseSkill({ ...skill, root: null }), { ...skill, root: null });
  for (const name of ['中文-skill', 'My Skill', 'bad_name']) {
    assert.equal(skillPath(name), `api/skills/${encodeURIComponent(name)}`);
    assert.equal(parseSkill({ ...skill, name }).name, name);
  }
  for (const name of ['../escape', '..', '.', 'a/b', 'a\\b', '', ' ', 'a\n']) {
    assert.throws(() => skillPath(name), { code: 'invalid-request' });
  }
  for (const patch of [{ root: undefined }, { description: 1 }, { name: '' }]) {
    assert.throws(() => parseSkill({ ...skill, ...patch }), { code: 'invalid-response' });
  }
  assert.deepEqual(parseSkillConfig({ paths: ['/skills'], classpathPath: 'skills' }), { paths: ['/skills'], classpathPath: 'skills' });
  assert.throws(() => parseSkillConfig({ paths: [1], classpathPath: 'skills' }), { code: 'invalid-response' });
});

test('Skills validates pagination and relative native resource paths', () => {
  const page = { items: [skill], total: 1, page: 0, size: 20, hasNext: false };
  assert.deepEqual(parseSkillPage(page), page);
  for (const patch of [{ hasNext: true }, { items: [skill, skill] }, { size: 0 }, { page: -1 }, { total: 0 }]) {
    assert.throws(() => parseSkillPage({ ...page, ...patch }), { code: 'invalid-response' });
  }
  const detail = { skill, content: 'instructions', resources: ['references/doc.md'] };
  assert.deepEqual(parseSkillDetail(detail), detail);
  for (const path of ['../escape', '/absolute', 'C:\\escape', 'a/../escape', '\\absolute']) {
    assert.throws(() => parseSkillDetail({ ...detail, resources: [path] }), { code: 'invalid-response' });
  }
});

test('Skills reads list, config and detail through the backend prefix; refresh rereads files', async () => {
  const sent = [];
  let description = 'Before edit';
  const client = new BackendClient('http://localhost:8080/prefix', { fetch: async (url, options) => {
    sent.push({ url, method: options.method });
    if (url.endsWith('/config')) return Response.json({ paths: ['/skills'], classpathPath: 'skills' });
    if (url.endsWith('/detail')) return Response.json({ skill: { ...skill, description }, content: 'instructions', resources: [] });
    return Response.json({ items: [{ ...skill, description }], total: 1, page: 0, size: 20, hasNext: false });
  } });
  const path = 'api/skills?page=0&size=20&q=';
  assert.equal(parseSkillPage(await client.request(path)).items[0].description, 'Before edit');
  description = 'After edit';
  assert.equal(parseSkillPage(await client.request(path)).items[0].description, 'After edit');
  parseSkillConfig(await client.request('api/skills/config'));
  parseSkillDetail(await client.request(`${skillPath(skill.name)}/detail`));
  assert.ok(sent.every(request => request.url.startsWith('http://localhost:8080/prefix/api/skills') && request.method === 'GET'));
  client.dispose();
});


test('Skills uploads the ZIP as a multipart file and reads the installed name', async () => {
  const file = new File(['ZIP bytes'], 'test-skill.zip', { type: 'application/zip' });
  const installed = { ...skill, name: 'test-skill-1' };
  const client = new BackendClient('http://localhost:8080/prefix', { fetch: async (url, options) => {
    assert.equal(url, 'http://localhost:8080/prefix/api/skills/upload');
    assert.equal(options.method, 'POST');
    assert.equal(new Headers(options.headers).has('content-type'), false);
    const part = options.body.get('file');
    assert.equal(part.name, file.name);
    assert.equal(await part.text(), 'ZIP bytes');
    return Response.json(installed, { status: 201 });
  } });
  try {
    assert.deepEqual(await uploadSkill(client, file, new AbortController().signal), installed);
  } finally {
    client.dispose();
  }
});
