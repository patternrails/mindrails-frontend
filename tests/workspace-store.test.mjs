import assert from 'node:assert/strict';
import test from 'node:test';
import { loginSession } from '../src/lib/auth-session.ts';
import { createTestConnection } from './fixtures/backend-connection.mjs';
import { createBackendAgentsStore } from '../src/lib/backend-agents-store.ts';
import { createWorkspaceStore } from '../src/lib/workspace-store.ts';
import { backendSession,backendProvider,memoryStorage } from './fixtures/backend-session.mjs';
import { StreamSocket,messageData } from './fixtures/stream-socket.mjs';
import { sessionActivity } from '../src/lib/sidebar-sessions.ts';
import { agentId,backendAgent } from './fixtures/backend-agent.mjs';
const A='http://localhost:8080/', B='http://localhost:8081/';
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function setup(t,options={}){
 let nextId=50;
 const port=options.port??memoryStorage(),calls=[];
 const source=new Map([[agentId(),[backendSession(10),backendSession(11)]],[agentId(2),[backendSession(20,2),backendSession(21,2)]]]);
 const history=new Map();
 let chat=async()=>Response.json(['reply']),listHook=null;
 const connection=createTestConnection({
 fetch:async(url,init)=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):null;calls.push({url,path,...init,body});
  if(path==='/api/history') {const items=[...history.values()].filter(v=>v.sessionId===new URL(url).searchParams.get('sessionId'));return Response.json({items,total:items.length,visibleTotal:items.length,limit:1000,page:0,size:100,hasNext:false,recordingEnabled:true});}
  if(path.startsWith('/api/history/'))return Response.json(history.get(path.split('/').at(-1)));
  if(path.endsWith('/api/health'))return new Response(null,{status:200});
  const agents=()=>[...source.keys()].map(id=>({...backendAgent(id===agentId()?1:2),id,sessions:source.get(id).map(s=>({id:s.id,parentAgentId:id}))}));
  if(path.endsWith('/api/agent'))return Response.json(agents());
  const [a,s,action]=path.split('/api/agent/')[1].split('/sessions').flatMap((x,i)=>i===0?[x]:x.split('/').slice(1));
  if(!path.includes('/sessions')){
   const id=path.split('/api/agent/')[1];
   if(init.method==='DELETE'){source.delete(id);return new Response(null,{status:204});}
   return source.has(id)?Response.json(agents().find(v=>v.id===id)):new Response(null,{status:404});
  }
  if(!source.has(a))return new Response(null,{status:404});
  if(!s && init.method==='GET')return listHook?listHook(a):Response.json(source.get(a));
  if(!s && init.method==='POST'){
   const id=agentId(nextId++);source.get(a).push({...backendSession(50,a===agentId()?1:2),id,provider:backendProvider(Number(body.providerId.slice(-12))),createdAt:'2026-10-12T14:00:00Z'});
   return Response.json(id,{status:201});
  }
  const item=source.get(a).find(v=>v.id===s);
  if(!item)return new Response(null,{status:404});
  if(action==='fork'){
   const id=agentId(nextId++),memoryId=agentId(nextId++);
   source.get(a).push({...item,id,memoryId,createdAt:'2026-10-12T14:00:00Z'});
   for(const record of [...history.values()].filter(r=>r.sessionId===s)){
    const copy=structuredClone(record);copy.id=agentId(nextId++);copy.sessionId=id;copy.memoryId=memoryId;
    copy.metadata={...copy.metadata,originHistoryId:record.id,forkedFromSessionId:s};history.set(copy.id,copy);
   }
   return Response.json(id,{status:201});
  }
  if(init.method==='PUT'){Object.assign(item,body,{provider:backendProvider(Number(body.providerId.slice(-12))),updatedAt:'2026-10-12T14:00:00Z'});delete item.providerId;return new Response(null,{status:204});}
  if(init.method==='DELETE'){source.set(a,source.get(a).filter(v=>v.id!==s));return new Response(null,{status:204});}
  throw Error('Unexpected request '+url);
 }});
 const defaultSockets = [];
 const socketFactory = options.socketFactory ?? (address => {
  const parts = new URL(address).pathname.split('/'), a = parts[3], session = parts[5];
  const socket = new StreamSocket(a, session), originalSend = socket.send.bind(socket);
  socket.address = address; defaultSockets.push(socket);
  socket.send = raw => {
   originalSend(raw); const command = JSON.parse(raw);
   if (command.type !== 'chat') return;
   const body = {message:command.data.message}, path = `/api/agent/${a}/sessions/${session}/stream`;
   const init = {method:'POST',body:JSON.stringify(body)};
   calls.push({url:address,path,body,...init,transport:'websocket'});
   socket.emit('chat.accepted',{},command.requestId); socket.emit('run.started',{},command.requestId);
   void (async () => {
    try {
     const response = await chat({url:address,init,a,s:session,body});
     if (!response.ok) {socket.emit('run.failed',{error:{code:'INTERNAL_ERROR',message:'Chat failed'}},command.requestId);return;}
     const value=await response.json(), reply=Array.isArray(value)?{lines:value}:value;
     for(const [index,name] of (reply.executedTools??[]).entries()) {
      socket.emit('tool.started',{round:1,toolCallId:`tool-${index}`,toolName:name,arguments:{}},command.requestId);
      socket.emit('tool.completed',{round:1,toolCallId:`tool-${index}`,toolName:name,result:'done',durationMs:1},command.requestId);
     }
     const saved = {...archived(session), id:agentId(nextId++), agentId:a, requestId:command.requestId,
       metadata:{result:reply.lines.join('\n')}, messages:[{type:'USER',text:body.message},{type:'AI',text:reply.lines.join('\n')}]};
     history.set(saved.id,saved);
     const target = defaultSockets.findLast(item => item.address === address && !item.closed);
     target?.emit('run.completed',{answer:reply.lines.join('\n'),finalMessageId:agentId(600),usage:reply.usage},command.requestId);
    } catch {socket.emit('run.failed',{error:{code:'INTERNAL_ERROR',message:'Chat failed'}},command.requestId);}
   })();
  };
  queueMicrotask(()=>socket.ready()); return socket;
 });
 const agents=createBackendAgentsStore(connection);const workspace=createWorkspaceStore(connection,agents,{uuid:()=>agentId(nextId++),socketFactory,...options});
 agents.start();workspace.start();t.after(()=>{workspace.stop();agents.stop();connection.stop();});
 return {connection,agents,workspace,port,calls,source,history,sockets:defaultSockets,setChat:f=>{chat=f;},setList:f=>{listHook=f;},
  connect:async(base=A)=>{await loginSession(base,'test','password',async()=>Response.json({accessToken:'a'.repeat(43),accessExpiresAt:'2030-01-01T00:00:00Z',user:{id:'test-admin',language:'en',role:options.role??'SystemAdmin'}}));await connection.initialize();assert.equal((await connection.setConfig(base)).ok,true);await flush();assert.equal(workspace.getSnapshot().status,'ready');}};
}
const currentRecord=h=>{const s=h.workspace.getSnapshot();return s.records[`${s.agentId}/${s.sessionId}`];};
const archived=(sessionId=agentId(10))=>({id:agentId(900),agentId:agentId(),sessionId,providerId:agentId(100),transport:'STREAM',status:'COMPLETED',startedAt:'2026-10-12T13:00:00Z',finishedAt:'2026-10-12T13:00:01Z',metadata:{result:'server reply'},ownerId:null,memoryId:agentId(201),requestId:agentId(901),invocationId:null,schemaVersion:1,messages:[{type:'USER',text:'server question'},{type:'AI',text:'server reply',thinking:'server thinking'}]});
test('verified workspace restores backend History without reading or writing browser conversation records',async t=>{
 const h=setup(t);h.history.set(agentId(900),archived());await h.connect();assert.equal(currentRecord(h).turns[0].assistant,'server reply');assert.equal(currentRecord(h).turns[0].stream.messages[0].thinking,'server thinking');assert.equal(h.port.length,0);
 assert.deepEqual(sessionActivity(h.workspace.getSnapshot().records,{}),{});
 h.workspace.setDraft('transient');h.workspace.stop();const next=createWorkspaceStore(h.connection,h.agents);t.after(()=>next.stop());next.start();await flush();
 assert.equal(next.getSnapshot().records[`${agentId()}/${agentId(10)}`].draft,'');assert.equal(next.getSnapshot().records[`${agentId()}/${agentId(10)}`].turns[0].user,'server question');
});
test('drafts remain independent in memory while navigating Agents and Sessions',async t=>{
 const h=setup(t);await h.connect();h.workspace.setDraft('A');h.workspace.selectSession(agentId(11));await flush();h.workspace.setDraft('B');h.workspace.selectAgent(agentId(2));await flush();h.workspace.setDraft('C');h.workspace.selectAgent(agentId());await flush();assert.equal(currentRecord(h).draft,'B');h.workspace.selectSession(agentId(10));await flush();assert.equal(currentRecord(h).draft,'A');assert.equal(h.port.length,0);
});
test('WebSocket chat blocks duplicate sends and mutations, preserves multi-line reply and recovers input',async t=>{
 const h=setup(t);await h.connect();const reply=deferred();h.setChat(()=>reply.promise);h.workspace.setDraft('test');const pending=h.workspace.send();assert.equal(await h.workspace.send(),false);assert.equal(await h.workspace.forkSession(),false);assert.equal(await h.workspace.deleteSession(),false);h.workspace.setDraft('must not queue');assert.equal(currentRecord(h).draft,'');
 assert.deepEqual(sessionActivity(h.workspace.getSnapshot().records,{}),{});
 reply.resolve(Response.json(['one','two']));assert.equal(await pending,true);await flush();assert.equal(currentRecord(h).turns[0].assistant,'one\ntwo');assert.equal(h.workspace.getSnapshot().waiting,false);
 assert.equal(sessionActivity(h.workspace.getSnapshot().records,{})[agentId(10)],Date.parse(currentRecord(h).turns[0].firstFeedbackAt));
});
test('Session name edits preserve conversation and readonly resource identity',async t=>{
 const h=setup(t);await h.connect();h.workspace.setDraft('question');await h.workspace.send();await flush();
 assert.equal(await h.workspace.updateSession({name:'Renamed',providerId:agentId(100),systemMessage:'new',memoryId:agentId(201)}),true);await flush();
 assert.equal(h.workspace.getSnapshot().sessions[0].name,'Renamed');assert.equal(currentRecord(h).turns[0].user,'question');assert.equal(h.calls.find(c=>c.method==='PUT').body.name,'Renamed');
});
test('Session fork inherits history and selects an independent connection; deletion selects an owned remaining Session',async t=>{
 const h=setup(t);await h.connect();h.workspace.setDraft('test');await h.workspace.send();await flush();const source=h.workspace.getSnapshot().sessionId;assert.equal(await h.workspace.forkSession(),true);await flush();assert.equal(currentRecord(h).turns.length,1);const id=h.workspace.getSnapshot().sessionId;assert.notEqual(id,source);assert.equal(h.sockets.at(-1).session,id);assert.equal(await h.workspace.deleteSession(),true);await flush();assert.notEqual(h.workspace.getSnapshot().sessionId,id);
});
test('late Session list cannot overwrite another Agent',async t=>{
 const h=setup(t);await h.connect();const late=deferred();h.setList(a=>a===agentId()?late.promise:Promise.resolve(Response.json(h.source.get(a))));const old=h.workspace.refresh();h.workspace.selectAgent(agentId(2));await flush();late.resolve(Response.json([backendSession(10)]));assert.equal(await old,false);assert.equal(h.workspace.getSnapshot().agentId,agentId(2));
});
async function streaming(t,options={}){const sockets=[];const h=setup(t,{socketFactory:url=>{const parts=new URL(url).pathname.split('/');const s=new StreamSocket(parts[3],parts[5]);sockets.push(s);return s;},...options});await h.connect();h.source.get(agentId())[0].provider.streaming=true;await h.workspace.refresh();h.workspace.setDraft('stream');return {...h,sockets};}
test('attachments are accepted once; switching only detaches the observer', async t => {
 const h=await streaming(t);let accepted=0;
 const pending=h.workspace.send([agentId(700)],['report.pdf'],()=>accepted++), socket=h.sockets[0];socket.ready();
 socket.emit('run.started');socket.emit('chat.accepted');assert.equal(accepted,1);
 await h.workspace.openSession(agentId(2),agentId(20));
 assert.equal(await pending,false);assert.equal(socket.closed,true);
 assert.deepEqual(socket.commands.map(command=>command.type),['chat']);
 socket.emit('run.failed',{error:{code:'UNAVAILABLE',message:'late'}});assert.equal(accepted,1);
});

test('rejected chats never accept attachments; non-streaming providers also use WebSocket', async t => {
 const h=await streaming(t);let accepted=0;
 const rejected=h.workspace.send([agentId(700)],['report.pdf'],()=>accepted++),socket=h.sockets[0];socket.ready();
 socket.emit('command.error',{code:'CONFLICT',message:'busy'});assert.equal(await rejected,false);assert.equal(accepted,0);await flush();
 await h.workspace.openSession(agentId(2),agentId(20));h.workspace.setDraft('non-streaming');
 const done=h.workspace.send([],[],()=>accepted++), next=h.sockets.at(-1);next.ready();next.emit('run.started');
 next.emit('tool.started',{round:1,toolCallId:'t',toolName:'write',arguments:{}});
 next.emit('tool.completed',{round:1,toolCallId:'t',toolName:'write',result:'done',durationMs:1});
 next.emit('run.completed',{answer:'done',finalMessageId:agentId(601),usage:{inputTokens:25,outputTokens:5,totalTokens:30}});
 assert.equal(await done,true);assert.equal(accepted,1);assert.equal(currentRecord(h).turns[0].usage.totalTokens,30);
 assert.deepEqual(currentRecord(h).turns[0].executedTools,['write']);
});

test('sidebar activity starts with received stream feedback and survives cancellation',async t=>{
 const h=await streaming(t);
 assert.deepEqual(sessionActivity(h.workspace.getSnapshot().records,{}),{});
 const pending=h.workspace.send(),s=h.sockets[0];s.ready();s.emit('chat.accepted');s.emit('run.started');
 assert.deepEqual(sessionActivity(h.workspace.getSnapshot().records,{}),{});
 const feedback=s.emit('thinking.delta',messageData('thinking'));
 assert.equal(sessionActivity(h.workspace.getSnapshot().records,{})[agentId(10)],Date.parse(feedback.timestamp));
 s.emit('answer.delta',messageData('later'));
 assert.equal(currentRecord(h).turns[0].firstFeedbackAt,feedback.timestamp);
 assert.equal(sessionActivity(h.workspace.getSnapshot().records,{})[agentId(10)],Date.parse(feedback.timestamp));
 h.workspace.cancelChat();s.emit('run.cancelled',{state:'CANCELLED'},s.commands[1].requestId);await pending;await flush();
 assert.equal(sessionActivity(h.workspace.getSnapshot().records,{})[agentId(10)],Date.parse(feedback.timestamp));
});
test('stream publishes thinking and tools incrementally, final snapshot replaces answer',async t=>{
 const h=await streaming(t),pending=h.workspace.send(),s=h.sockets[0];s.ready();s.emit('thinking.delta',messageData('thinking'));s.emit('tool.started',{round:1,toolCallId:'tool',toolName:'read',arguments:{}});assert.equal(currentRecord(h).turns[0].stream.tools[0].status,'running');s.emit('tool.completed',{round:1,toolCallId:'tool',toolName:'read',result:'file',durationMs:2});s.emit('answer.delta',messageData('partial'));assert.equal(currentRecord(h).turns[0].assistant,null);assert.equal(currentRecord(h).turns[0].stream.messages[0].answer,'partial');s.emit('run.completed',{answer:'final',finalMessageId:agentId(600)});assert.equal(await pending,true);await flush();assert.equal(currentRecord(h).turns[0].assistant,'final');assert.equal(h.port.length,0);
});
test('Stop sends cancel once, keeps received content and allows next chat only after terminal',async t=>{
 const h=await streaming(t),pending=h.workspace.send(),s=h.sockets[0];s.ready();s.emit('answer.delta',messageData('received'));h.workspace.cancelChat();h.workspace.cancelChat();assert.equal(h.workspace.getSnapshot().cancelling,true);assert.equal(s.commands.length,2);assert.equal(await h.workspace.send(),false);s.emit('run.cancelled',{state:'CANCELLED'},s.commands[1].requestId);assert.equal(await pending,false);await flush();assert.equal(currentRecord(h).turns[0].assistant,'received');assert.equal(currentRecord(h).turns[0].status,'stopped');h.workspace.setDraft('next');const next=h.workspace.send();assert.equal(h.sockets.length,1);s.emit('run.completed',{answer:'done',finalMessageId:agentId(601)},s.commands.at(-1).requestId);assert.equal(await next,true);
});
test('Stop timeout is unconfirmed and never claims cancellation success',async t=>{
 const h=await streaming(t,{cancelTimeoutMs:10}),pending=h.workspace.send(),s=h.sockets[0];s.ready();s.emit('answer.delta',messageData('partial'));h.workspace.cancelChat();assert.equal(await pending,false);assert.equal(currentRecord(h).turns[0].status,'unconfirmed');assert.equal(currentRecord(h).turns[0].error.code,'timeout');assert.equal(h.workspace.getSnapshot().error,null);
});
test('replaced connection isolates late stream data and loads only the new backend History',async t=>{
 const h=await streaming(t),pending=h.workspace.send(),s=h.sockets[0];s.ready();s.emit('answer.delta',messageData('old'));await h.connection.setConfig(B);await flush();assert.equal(await pending,false);s.emit('run.completed',{answer:'late',finalMessageId:agentId(600)});assert.equal(currentRecord(h).turns.length,0);
});

test('sidebar opens the exact Session across Agents in one navigation operation',async t=>{
 const h=setup(t);await h.connect();h.workspace.setDraft('Keep draft A');
 assert.equal(await h.workspace.openSession(agentId(2),agentId(20)),true);
 assert.equal(h.workspace.getSnapshot().agentId,agentId(2));assert.equal(h.workspace.getSnapshot().sessionId,agentId(20));
 assert.equal(await h.workspace.openSession(agentId(),agentId(10)),true);assert.equal(currentRecord(h).draft,'Keep draft A');
 assert.equal(await h.workspace.openSession(agentId(),agentId(999)),false);assert.equal(h.workspace.getSnapshot().sessionId,agentId(10));
});

test('opens a backend-created Session under the already selected Builder Agent', async t => {
 const h=setup(t); await h.connect();
 h.workspace.setDraft('Keep existing conversation draft');
 const previous=h.workspace.getSnapshot().sessionId;
 const created=backendSession(99);
 h.source.get(agentId()).push(created);
 assert.equal(await h.workspace.openSession(agentId(),created.id),true);
 assert.equal(h.workspace.getSnapshot().sessionId,created.id);
 assert.equal(currentRecord(h).draft,'');
 assert.equal(await h.workspace.openSession(agentId(),previous),true);
 assert.equal(currentRecord(h).draft,'Keep existing conversation draft');
});

test('switching agents detaches without stopping; reopening restores the backend result', async t => {
 const h=setup(t);await h.connect();const reply=deferred();h.setChat(()=>reply.promise);
 h.workspace.setDraft('background');const pending=h.workspace.send();
 await h.workspace.openSession(agentId(2),agentId(20));assert.equal(await pending,false);
 assert.equal(h.workspace.getSnapshot().waiting,true);assert.equal((await h.agents.remove(agentId())).ok,false);
 reply.resolve(Response.json(['background answer']));await flush();
 assert.equal(h.workspace.getSnapshot().sessionId,agentId(20));assert.equal(currentRecord(h).turns.length,0);
 await h.workspace.openSession(agentId(),agentId(10));await flush();
 assert.equal(currentRecord(h).turns[0].assistant,'background answer');assert.equal(h.workspace.getSnapshot().waiting,false);
 assert.deepEqual(h.sockets[0].commands.map(command=>command.type),['chat']);
});

test('switching unbinds old feedback; reopening can observe and stop the original run', async t => {
 const h=await streaming(t),pending=h.workspace.send(),old=h.sockets[0];old.ready();old.emit('answer.delta',messageData('before switch'));
 const requestId=old.commands[0].requestId;await h.workspace.openSession(agentId(),agentId(11));
 assert.equal(await pending,false);assert.equal(old.closed,true);old.emit('answer.delta',messageData('ignored'));
 assert.equal(h.workspace.getSnapshot().records[`${agentId()}/${agentId(10)}`].turns[0].assistant,'before switch');
 await h.workspace.openSession(agentId(),agentId(10));const rebound=h.sockets.at(-1);rebound.ready();
 rebound.emit('answer.delta',messageData(' resumed'),requestId);h.workspace.cancelChat();
 assert.deepEqual(rebound.commands.map(command=>command.type),['cancel']);
 rebound.emit('run.cancelled',{state:'CANCELLED'},requestId);await flush();
 assert.equal(currentRecord(h).turns[0].status,'stopped');assert.equal(currentRecord(h).turns[0].assistant,'before switch resumed');
 assert.equal(h.workspace.getSnapshot().waiting,false);
});

test('a detached completion cannot redirect an in-flight switch to another agent',async t=>{
 const h=await streaming(t),pending=h.workspace.send(),socket=h.sockets[0];socket.ready();
 const list=deferred();h.setList(a=>a===agentId(2)?list.promise:Response.json(h.source.get(a)));
 const selected=h.workspace.openSession(agentId(2),agentId(20));socket.emit('run.completed',{answer:'late',finalMessageId:agentId(600)});
 list.resolve(Response.json(h.source.get(agentId(2))));await selected;assert.equal(await pending,false);
 assert.equal(h.workspace.getSnapshot().agentId,agentId(2));assert.equal(h.workspace.getSnapshot().sessionId,agentId(20));
 assert.equal(currentRecord(h).turns.length,0);assert.equal(socket.commands.length,1);
});

test('detached Session work stays isolated while another Session sends over WebSocket', async t => {
 const h=setup(t);await h.connect();const first=deferred(),second=deferred();h.setChat(({s})=>s===agentId(10)?first.promise:second.promise);
 h.workspace.setDraft('first');const a=h.workspace.send();await h.workspace.openSession(agentId(),agentId(11));
 h.workspace.setDraft('second');const b=h.workspace.send();assert.equal(await a,false);
 second.resolve(Response.json(['second result']));assert.equal(await b,true);await flush();
 first.resolve(Response.json(['first result']));await flush();assert.equal(currentRecord(h).turns[0].assistant,'second result');
 await h.workspace.openSession(agentId(),agentId(10));await flush();assert.equal(currentRecord(h).turns[0].assistant,'first result');
 assert.equal(h.calls.filter(call=>call.transport==='websocket').length,2);
});

test('Stop targets the selected subscription and never sends on detached sockets', async t => {
 const h=await streaming(t),a=h.workspace.send(),old=h.sockets[0];old.ready();const firstId=old.commands[0].requestId;
 await h.workspace.openSession(agentId(2),agentId(20));h.workspace.setDraft('second');const b=h.workspace.send(),second=h.sockets.at(-1);second.ready();
 h.workspace.cancelChat();assert.equal(old.commands.length,1);assert.equal(second.commands.at(-1).type,'cancel');
 second.emit('run.cancelled',{state:'CANCELLED'},second.commands[0].requestId);assert.equal(await b,false);assert.equal(await a,false);
 await h.workspace.openSession(agentId(),agentId(10));const rebound=h.sockets.at(-1);rebound.ready();h.workspace.cancelChat();
 assert.deepEqual(rebound.commands.map(command=>command.type),['cancel']);rebound.emit('run.cancelled',{state:'CANCELLED'},firstId);await flush();
 assert.equal(h.workspace.getSnapshot().waiting,false);assert.equal(old.commands.length,1);
});

test('a detached observation does not report a late backend failure in another Session', async t => {
 const h=setup(t);await h.connect();const first=deferred(),second=deferred();h.setChat(({s})=>s===agentId(10)?first.promise:second.promise);
 h.workspace.setDraft('first');const a=h.workspace.send();await h.workspace.openSession(agentId(),agentId(11));
 h.workspace.setDraft('second');const b=h.workspace.send();first.resolve(new Response(null,{status:500}));assert.equal(await a,false);
 assert.equal(currentRecord(h).turns[0].status,'waiting');assert.equal(h.workspace.getSnapshot().error,null);
 second.resolve(Response.json(['second succeeded']));assert.equal(await b,true);assert.equal(currentRecord(h).turns[0].assistant,'second succeeded');
});

test('connection replacement aborts all concurrent runs and rejects every stale response',async t=>{
 const h=await streaming(t),a=h.workspace.send(),one=h.sockets[0];one.ready();
 h.source.get(agentId(2))[0].provider.streaming=true;
 await h.workspace.openSession(agentId(2),agentId(20));h.workspace.setDraft('second stream');
 const b=h.workspace.send(),two=h.sockets[1];two.ready();
 await h.connection.setConfig(B);await flush();assert.equal(await a,false);assert.equal(await b,false);
 assert.equal(one.closed,true);assert.equal(two.closed,true);assert.equal(h.agents.getSnapshot().paused,false);
 one.emit('run.completed',{answer:'late one',finalMessageId:agentId(600)});two.emit('run.completed',{answer:'late two',finalMessageId:agentId(601)});
 const state=h.workspace.getSnapshot();assert.equal(state.waiting,false);assert.deepEqual(state.cancellingSessionIds,[]);
 assert.ok(Object.values(state.records).every(record=>record.turns.length===0));
});

test('F1 protects only the running session and its agent while other sessions can be managed',async t=>{
 const h=setup(t);await h.connect();const reply=deferred();h.setChat(()=>reply.promise);
 h.workspace.setDraft('background');const pending=h.workspace.send();
 const edit={name:'Rename',providerId:agentId(100),systemMessage:null,memoryId:agentId(201)};
 assert.equal(await h.workspace.updateSession(edit),false);
 assert.equal(await h.workspace.forkSession(),false);assert.equal(await h.workspace.deleteSession(),false);
 assert.equal((await h.agents.remove(agentId())).ok,false);
 assert.equal((await h.agents.update(agentId(),{name:'Blocked'})).ok,false);
 assert.equal(await h.workspace.startSession(agentId(100)),true);await flush();
 const created=h.workspace.getSnapshot().sessionId;assert.notEqual(created,agentId(10));
 assert.equal(await h.workspace.updateSession(edit),true);await flush();
 assert.equal(await h.workspace.forkSession(),true);await flush();
 assert.equal(await h.workspace.deleteSession(),true);await flush();
 assert.equal(await h.workspace.openSession(agentId(),agentId(11)),true);
 assert.equal(await h.workspace.deleteSession(),true);await flush();
 assert.equal(h.workspace.getSnapshot().waiting,true);
 assert.equal((await h.agents.remove(agentId(2))).ok,true);await flush();
 reply.resolve(Response.json(['still the original session']));assert.equal(await pending,false);await flush();await h.workspace.openSession(agentId(),agentId(10));await flush();
 assert.equal(h.workspace.getSnapshot().records[`${agentId()}/${agentId(10)}`].turns[0].assistant,'still the original session');
 assert.deepEqual(h.agents.getSnapshot().runningAgentIds,[]);
});

test('a rebound subscription preserves failure details and its partial reply', async t => {
 const h=await streaming(t),pending=h.workspace.send(),socket=h.sockets[0];socket.ready();const requestId=socket.commands[0].requestId;
 socket.emit('answer.delta',messageData('Partial reply'));await h.workspace.openSession(agentId(2),agentId(20));assert.equal(await pending,false);
 await h.workspace.openSession(agentId(),agentId(10));const rebound=h.sockets.at(-1);rebound.ready();
 rebound.emit('run.failed',{error:{code:'UNAVAILABLE',message:'Secure connection failed',reason:'TLS_HANDSHAKE_FAILED',detail:'SSLHandshakeException: Remote host terminated the handshake'}},requestId);
 const turn=currentRecord(h).turns[0];assert.equal(turn.status,'failed');assert.equal(turn.assistant,'Partial reply');
 assert.equal(turn.error.reason,'TLS_HANDSHAKE_FAILED');assert.equal(turn.error.requestId,turn.id);assert.equal(h.workspace.getSnapshot().error,null);
});

test('Normal users restore archived conversation history and can continue chatting', async t => {
 const h=setup(t,{language:'en',role:'Normal'});h.history.set(agentId(900),archived());await h.connect();
 assert.ok(h.calls.some(call=>call.path==='/api/history'));
 assert.ok(h.calls.some(call=>call.path===`/api/history/${agentId(900)}`));
 assert.equal(currentRecord(h).turns[0].user,'server question');
 assert.equal(currentRecord(h).turns[0].assistant,'server reply');
 h.workspace.setDraft('normal user message');assert.equal(await h.workspace.send(),true);
 assert.equal(currentRecord(h).turns.at(-1).assistant,'reply');
 assert.equal(h.workspace.getSnapshot().error,null);
});


test('restoring an old completed turn cannot release the lock for a different detached run', async t => {
 const h=await streaming(t);
 h.history.set(agentId(900), archived());
 h.workspace.setDraft('still working');
 const pending=h.workspace.send(), socket=h.sockets[0];socket.ready();socket.emit('run.started');
 const requestId=socket.commands[0].requestId;
 await h.workspace.openSession(agentId(2),agentId(20));
 assert.equal(await pending,false);
 await h.workspace.openSession(agentId(),agentId(10));
 const rebound=h.sockets.at(-1);rebound.ready();
 assert.equal(currentRecord(h).turns.find(turn=>turn.id===requestId).status,'waiting');
 assert.equal(await h.workspace.deleteSession(),false);
 assert.equal(await h.workspace.send(),false);
 rebound.emit('run.completed',{answer:'done',finalMessageId:agentId(600)},requestId);
 assert.equal(currentRecord(h).turns.find(turn=>turn.id===requestId).status,'completed');
 assert.equal(h.workspace.getSnapshot().waiting,false);
});

const communicationSource = () => ({sourceSessionId:agentId(21),sourceAgentId:agentId(2),sourceRunId:agentId(950),inReplyTo:null,sentAt:'2026-11-07T08:00:00Z',hops:1});
const incomingInput = (id, message='A message from another Session') => ({requestId:id,message,submittedAt:'2026-11-07T08:00:00Z',source:communicationSource()});
test('external queued inputs create turns, run serially and preserve provenance without sending browser commands',async t=>{
 const h=setup(t);await h.connect();const socket=h.sockets.at(-1),a=agentId(960),b=agentId(961);
 socket.emit('message.enqueued',incomingInput(a),a);socket.emit('message.enqueued',incomingInput(b,'second message'),b);
 assert.equal(currentRecord(h).turns.length,2);assert.equal(currentRecord(h).turns[0].stream.phase,'queued');
 assert.equal(currentRecord(h).turns[0].communication.sourceSessionId,agentId(21));
 assert.equal((await h.agents.remove(agentId())).ok,false);assert.equal(await h.workspace.forkSession(),false);
 socket.emit('run.started',{input:incomingInput(a)},a);socket.emit('answer.delta',messageData('partial'),a);
 socket.emit('message.enqueued',incomingInput(a),a);
 assert.equal(currentRecord(h).turns[0].stream.phase,'answering');assert.equal(currentRecord(h).turns[0].assistant,'partial');
 socket.emit('run.completed',{answer:'first done',finalMessageId:agentId(970)},a);
 assert.equal(h.workspace.getSnapshot().waiting,true);assert.equal(currentRecord(h).turns[1].stream.phase,'queued');
 socket.emit('run.started',{input:incomingInput(b,'second message')},b);
 socket.emit('run.completed',{answer:'second done',finalMessageId:agentId(971)},b);
 assert.deepEqual(currentRecord(h).turns.map(turn=>turn.assistant),['first done','second done']);
 assert.equal(h.workspace.getSnapshot().waiting,false);assert.equal(socket.commands.length,0);
});
test('late subscription startup input creates an unknown turn and stop cancels all queued external inputs',async t=>{
 const h=setup(t);await h.connect();const socket=h.sockets.at(-1),a=agentId(962),b=agentId(963);
 socket.emit('run.started',{input:incomingInput(a)},a);socket.emit('message.enqueued',incomingInput(b),b);
 assert.equal(currentRecord(h).turns[0].stream.phase,'working');
 h.workspace.cancelChat();assert.equal(socket.commands.at(-1).type,'cancel');
 socket.emit('run.cancelled',{reason:'USER_CANCELLED'},a);socket.emit('run.cancelled',{reason:'USER_CANCELLED'},b);
 assert.deepEqual(currentRecord(h).turns.map(turn=>turn.status),['stopped','stopped']);assert.equal(h.workspace.getSnapshot().waiting,false);
});
test('communication history and a live completion merge into one turn across refresh',async t=>{
 const h=setup(t);await h.connect();const id=agentId(964),socket=h.sockets.at(-1);
 socket.emit('run.started',{input:incomingInput(id)},id);
 socket.emit('run.completed',{answer:'result',finalMessageId:agentId(972)},id);
 h.history.set(agentId(900),{...archived(),requestId:id,metadata:{result:'result',input:'original body',communication:communicationSource()}});
 h.workspace.selectSession(agentId(11));await flush();h.workspace.selectSession(agentId(10));await flush();
 assert.equal(currentRecord(h).turns.length,1);assert.equal(currentRecord(h).turns[0].user,'original body');
 assert.equal(currentRecord(h).turns[0].communication.sourceAgentId,agentId(2));assert.equal(currentRecord(h).turns[0].status,'completed');
});
