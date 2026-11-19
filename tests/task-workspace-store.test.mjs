import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskWorkspaceStore} from '../src/lib/task-workspace-store.ts';
import {createBackendAgentsStore} from '../src/lib/backend-agents-store.ts';
import {createTestConnection} from './fixtures/backend-connection.mjs';
import {backendTask,taskExecution,taskReply,TaskSocket,agentId,backendAgent,backendProvider} from './fixtures/backend-task.mjs';
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function setup(t,options={}){
 let next=800;const tasks=new Map([[agentId(300),backendTask()],[agentId(301),backendTask(301)]]),active=new Map(),executions=new Map(),calls=[],sockets=[];
 let hook=null;
 const connection=createTestConnection({fetch:async(url,init)=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):null;calls.push({path,method:init.method,body});
  if(hook){const result=await hook({path,init,body});if(result)return result;}
  if(path==='/api/health')return new Response(null,{status:200});
  if(path==='/api/agent')return Response.json([backendAgent()]);
  if(path===`/api/agent/${agentId()}`)return Response.json(backendAgent());
  const task=path.split('/tasks/')[1]?.split('/')[0];
  if(path.endsWith('/tasks')&&init.method==='GET')return Response.json([...tasks.values()]);
  if(path.endsWith('/tasks')&&init.method==='POST'){const id=agentId(next++);tasks.set(id,{...backendTask(),...body,id,provider:backendProvider(100,true)});return Response.json(id,{status:201});}
  if(path.endsWith('/executions/active'))return Response.json({activeExecution:active.get(task)??null});
  if(path.endsWith('/executions'))return Response.json([...executions.values()].filter(e=>e.taskId===task).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
  if(path.endsWith('/cancel')){active.set(task,{...active.get(task),status:'CANCELLING'});return new Response(null,{status:204});}
  if(path.includes('/executions/')){const execution=executions.get(path.split('/').at(-1));return execution?Response.json(execution):new Response(null,{status:404});}
  if(init.method==='DELETE'){tasks.delete(task);return new Response(null,{status:204});}
  if(init.method==='PUT'){const prior=tasks.get(task);tasks.set(task,{...prior,...body,provider:{...prior.provider,id:body.providerId}});return new Response(null,{status:204});}
  if(tasks.has(task))return Response.json(tasks.get(task));
  return new Response(null,{status:404});
 }});
 const agents=createBackendAgentsStore(connection),workspace=createTaskWorkspaceStore(connection,agents,{pollMs:0,uuid:()=>agentId(next++),socketFactory:()=>{const socket=new TaskSocket();sockets.push(socket);return socket;},...options});
 agents.start();workspace.start();t.after(()=>{workspace.stop();agents.stop();connection.stop();});
 return {connection,agents,workspace,tasks,active,executions,calls,sockets,setHook:h=>{hook=h;},connect:async()=>{await connection.initialize();await connection.setConfig('http://localhost:8080/');await flush();assert.equal(workspace.getSnapshot().status,'ready');},async refresh(){await workspace.refresh();await flush();}};
}
test('Task creation opens a local blank draft; first Save creates the backend resource once and preserves edits during Save',async t=>{
 const h=setup(t);await h.connect();const id=h.workspace.startDraft(agentId(),backendProvider(100,true));assert.equal(h.workspace.getSnapshot().tasks.find(t=>t.id===id).local,true);
 assert.equal(h.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/tasks')).length,0);assert.equal(await h.workspace.save(id),false);
 h.workspace.edit(id,{instructions:'Generate report',cronjob:'0 9 * * 1-5'});const wait=deferred();h.setHook(async({init,path})=>{if(init.method==='POST'&&path.endsWith('/tasks'))await wait.promise;});
 const pending=h.workspace.save(id);await flush();assert.equal(await h.workspace.save(id),false);h.workspace.edit(id,{instructions:'Newer unsaved instructions'});wait.resolve();assert.equal(await pending,true);await flush();
 const state=h.workspace.getSnapshot(),task=state.tasks.find(t=>t.id===state.activeTaskId);assert.equal(!!task.local,false);assert.notEqual(task.id,id);assert.equal(task.instructions,'Generate report');assert.equal(state.editors[task.id].instructions,'Newer unsaved instructions');
 assert.equal(h.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/tasks')).length,1);
});
test('Metadata edits preserve backend instructions and cron and retain unsaved workspace text',async t=>{
 const h=setup(t);await h.connect();h.workspace.selectTask(agentId(300));h.workspace.edit(agentId(300),{instructions:'Unsaved draft text'});
 h.tasks.get(agentId(300)).cronjob='0 10 * * *';assert.equal(await h.workspace.save(agentId(300),{name:'Renamed',provider:backendProvider(100,true)}),true);
 const write=h.calls.find(c=>c.method==='PUT');assert.equal(write.body.instructions,'Write a daily report');assert.equal(write.body.cronjob,'0 10 * * *');assert.equal(write.body.name,'Renamed');assert.equal(h.workspace.getSnapshot().editors[agentId(300)].instructions,'Unsaved draft text');
 h.workspace.selectTask(agentId(301));h.workspace.selectTask(agentId(300));assert.equal(h.workspace.getSnapshot().editors[agentId(300)].instructions,'Unsaved draft text');
});
test('A confirmed create with failed readback never returns to a retryable local draft',async t=>{
 const h=setup(t);await h.connect();const id=h.workspace.startDraft(agentId(),backendProvider(100,true));h.workspace.edit(id,{instructions:'Report'});
 h.setHook(({path,init})=>init.method==='GET'&&path.endsWith(agentId(801))?new Response(null,{status:503}):undefined);
 assert.equal(await h.workspace.save(id),true);const state=h.workspace.getSnapshot();assert.equal(state.activeTaskId,agentId(801));assert.equal(state.tasks.find(t=>t.id===state.activeTaskId).local,false);assert.equal(state.notice,'savedReadFailed');
});
test('Execution stays global while navigating tasks; Stop targets its execution and permits another run only after termination',async t=>{
 const h=setup(t);await h.connect();h.workspace.selectTask(agentId(300));const pending=h.workspace.execute(agentId(300)),socket=h.sockets[0];socket.ready();socket.emit('execution.accepted',{status:'STARTING'});h.active.set(agentId(300),{executionId:agentId(500),status:'RUNNING'});h.executions.set(agentId(500),taskExecution());
 assert.equal(await h.workspace.execute(agentId(300)),false);h.workspace.selectTask(agentId(301));socket.emit('answer.delta',{round:1,messageId:agentId(700),text:'Partial report'});assert.equal(h.workspace.getSnapshot().activeTaskId,agentId(301));assert.equal(h.workspace.getSnapshot().streams[agentId(500)].messages[0].answer,'Partial report');
 h.workspace.selectTask(agentId(300));assert.equal(await h.workspace.cancel(agentId(300)),true);assert.equal(h.workspace.getSnapshot().active[agentId(300)].status,'CANCELLING');assert.equal(socket.commands[1].data.executionId,agentId(500));
 h.active.delete(agentId(300));h.executions.set(agentId(500),taskExecution(500,300,{status:'CANCELLED',error:{code:'CANCELLED',message:'Stopped'}}));socket.emit('execution.cancelled',{code:'CANCELLED',message:'Stopped'});assert.equal(await pending,true);await flush();assert.equal(h.workspace.getSnapshot().active[agentId(300)],null);
});
test('Authoritative activity detects another client and cancellation works without owning its WebSocket',async t=>{
 const h=setup(t);await h.connect();h.active.set(agentId(300),{executionId:agentId(500),status:'RUNNING'});h.executions.set(agentId(500),taskExecution());await h.refresh();
 assert.equal(await h.workspace.execute(agentId(300)),false);assert.equal(h.sockets.length,0);assert.equal(await h.workspace.cancel(agentId(300)),true);
 assert.equal(h.calls.find(c=>c.path.endsWith('/cancel')).path,`/api/agent/${agentId()}/tasks/${agentId(300)}/executions/${agentId(500)}/cancel`);assert.equal(h.workspace.getSnapshot().active[agentId(300)].status,'CANCELLING');
});
test('Socket interruption keeps a background task running and recovers its result without resubmitting',async t=>{
 const h=setup(t);await h.connect();const pending=h.workspace.execute(agentId(300)),socket=h.sockets[0];socket.ready();socket.emit('execution.accepted',{status:'STARTING'});h.active.set(agentId(300),{executionId:agentId(500),status:'RUNNING'});h.executions.set(agentId(500),taskExecution());socket.interrupt();assert.equal(await pending,false);await flush();
 assert.equal(h.workspace.getSnapshot().active[agentId(300)].executionId,agentId(500));assert.equal(socket.commands.length,1);assert.equal(await h.workspace.execute(agentId(300)),false);
 h.active.delete(agentId(300));h.executions.set(agentId(500),taskExecution(500,300,{status:'COMPLETED',result:taskReply()}));await h.refresh();h.workspace.selectTask(agentId(300));await flush();assert.equal(h.workspace.getSnapshot().details[agentId(500)].result.lines[0],'Task complete');assert.equal(h.workspace.getSnapshot().active[agentId(300)],null);
});
test('A busy WS handshake attaches authoritative state and never sends a second execution',async t=>{
 const h=setup(t);await h.connect();const pending=h.workspace.execute(agentId(300));h.active.set(agentId(300),{executionId:agentId(500),status:'RUNNING'});h.executions.set(agentId(500),taskExecution());h.sockets[0].ready({executionId:agentId(500),status:'RUNNING'});await pending;assert.equal(h.sockets[0].commands.length,0);assert.equal(h.workspace.getSnapshot().active[agentId(300)].executionId,agentId(500));
});

test('An unconfirmed create cannot be submitted again after refresh; discarding its local draft releases the write guard',async t=>{
 const h=setup(t);await h.connect();const id=h.workspace.startDraft(agentId(),backendProvider(100,true));h.workspace.edit(id,{instructions:'Report'});
 h.setHook(({path,init})=>init.method==='POST'&&path.endsWith('/tasks')?new Response(null,{status:503}):undefined);
 assert.equal(await h.workspace.save(id),false);assert.equal(h.workspace.getSnapshot().uncertain,true);h.setHook(null);await h.refresh();
 assert.equal(h.workspace.getSnapshot().uncertain,true);assert.equal(await h.workspace.save(id),false);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
 assert.equal(await h.workspace.remove(id),true);assert.equal(h.workspace.getSnapshot().uncertain,false);
});

test('An uncertain update is reconciled by refresh and retains the unsaved editor',async t=>{
 const h=setup(t);await h.connect();h.workspace.edit(agentId(300),{instructions:'Updated report'});
 h.setHook(({init})=>init.method==='PUT'?new Response(null,{status:503}):undefined);
 assert.equal(await h.workspace.save(agentId(300)),false);assert.equal(h.workspace.getSnapshot().uncertain,true);h.setHook(null);await h.refresh();
 assert.equal(h.workspace.getSnapshot().uncertain,false);assert.equal(h.workspace.getSnapshot().editors[agentId(300)].instructions,'Updated report');assert.equal(await h.workspace.save(agentId(300)),true);
});

test('A late activity response cannot override a newer stream event',async t=>{
 const h=setup(t);await h.connect();const wait=deferred();h.setHook(async({path})=>{if(path.endsWith(`${agentId(300)}/executions/active`)){await wait.promise;return Response.json({activeExecution:null});}});
 const refresh=h.workspace.refreshActive();await flush();const pending=h.workspace.execute(agentId(300)),socket=h.sockets[0];socket.ready();socket.emit('execution.accepted',{status:'STARTING'});wait.resolve();await refresh;
 assert.equal(h.workspace.getSnapshot().active[agentId(300)].executionId,agentId(500));h.active.delete(agentId(300));socket.emit('execution.completed',taskReply());await pending;
});

test('Network loss during create retains the unconfirmed draft across reconnect without allowing duplicate POST',async t=>{
 const h=setup(t);await h.connect();const id=h.workspace.startDraft(agentId(),backendProvider(100,true));h.workspace.edit(id,{instructions:'Report'});
 h.setHook(({path,init})=>{if(path.endsWith('/tasks')&&init.method==='POST')throw new TypeError('Connection lost');});
 assert.equal(await h.workspace.save(id),false);await flush();assert.equal(h.connection.getSnapshot().status,'disconnected');h.setHook(null);await h.connection.recheck();await flush();
 assert.equal(h.workspace.getSnapshot().tasks.find(task=>task.id===id).local,true);assert.equal(h.workspace.getSnapshot().uncertain,true);assert.equal(await h.workspace.save(id),false);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
});
