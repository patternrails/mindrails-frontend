import test from 'node:test';
import assert from 'node:assert/strict';
import { loginSession, clearAuth, authorizedFetch } from '../src/lib/auth-session.ts';
import { createTestConnection } from './fixtures/backend-connection.mjs';
import { createBackendAgentsStore } from '../src/lib/backend-agents-store.ts';
import { createTaskWorkspaceStore } from '../src/lib/task-workspace-store.ts';
import { backendAgent, agentId } from './fixtures/backend-agent.mjs';
import { backendProvider } from './fixtures/backend-session.mjs';
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
const session=(name)=>({accessToken:name.repeat(43),accessExpiresAt:'2030-01-01T00:00:00Z',user:{id:agentId(name==='a'?91:92),loginId:name,name,language:'en',role:'Normal'}});

test('switching users replaces the client and isolates task drafts even on the same backend',async t=>{
  const base='https://resource-isolation.example/';
  const connection=createTestConnection({fetch:async(url,init)=>{
    const path=new URL(url).pathname;
    if(path==='/api/health')return new Response(null,{status:200});
    if(path==='/api/agent') {
      const a=new Headers(init.headers).get('Authorization')?.includes('a'.repeat(43));
      return Response.json([{...backendAgent(a?1:2),ownerId:agentId(a?91:92)}]);
    }
    if(path.endsWith('/tasks'))return Response.json([]);
    throw new Error(`Unexpected ${path}`);
  }});
  const agents=createBackendAgentsStore(connection),tasks=createTaskWorkspaceStore(connection,agents,{pollMs:0,uuid:()=>agentId(900)});
  t.after(()=>{tasks.stop();agents.stop();connection.stop();clearAuth(base);});
  await loginSession(base,'a','password',async()=>Response.json(session('a')));
  await connection.setConfig(base);agents.start();tasks.start();await flush();
  const original=connection.getSnapshot().client;
  const draft=tasks.startDraft(agentId(1),backendProvider());tasks.edit(draft,{instructions:'Yuchen private draft'});
  assert.equal(tasks.getSnapshot().editors[draft].instructions,'Yuchen private draft');
  await loginSession(base,'b','password',async()=>Response.json(session('b')));await flush();
  assert.notEqual(connection.getSnapshot().client,original);
  assert.notEqual(connection.getSnapshot().client.resourceScope,original.resourceScope);
  assert.deepEqual(agents.getSnapshot().agents.map(a=>a.id),[agentId(2)]);
  assert.equal(tasks.getSnapshot().tasks.some(task=>task.id===draft),false);
  assert.equal(tasks.getSnapshot().editors[draft],undefined);
  await assert.rejects(original.request('api/agent'),{code:'cancelled'});
  await loginSession(base,'a','password',async()=>Response.json(session('a')));await flush();
  assert.equal(tasks.getSnapshot().editors[draft].instructions,'Yuchen private draft');
});

test('late successful responses from an earlier login are discarded',async()=>{
  const base='https://resource-late-response.example/';
  await loginSession(base,'a','password',async()=>Response.json(session('a')));
  let release;
  const request=authorizedFetch(base,base+'api/agent',{},async()=>new Promise(resolve=>{release=resolve;}));
  await loginSession(base,'b','password',async()=>Response.json(session('b')));
  release(Response.json([{name:'Private old data'}]));
  await assert.rejects(request,{name:'AbortError'});clearAuth(base);
});
