import test from 'node:test';
import assert from 'node:assert/strict';
import { toolRounds, toolArgumentsPreview, toolPreview, parseToolActivity } from '../src/lib/tool-presentation.ts';
import { newSessionStream, updateSessionStream } from '../src/lib/session-stream.ts';
import { archivedTurn } from '../src/lib/session-history.ts';
import { backendSession } from './fixtures/backend-session.mjs';
const tool=(id,round,status,startedOrder)=>({id,round,name:'bash',status,startedOrder,argumentText:'',arguments:null,argumentsOmitted:false,result:null,error:null,durationMs:null,truncated:false});
test('rounds and latest started calls sort first; completion preserves position and parallel status',()=>{
 const calls=[tool('old',1,'completed',10),tool('a',2,'running',11),tool('b',2,'running',12)];
 const before=toolRounds(calls);assert.deepEqual(before.map(g=>g.round),[2,1]);assert.deepEqual(before[0].tools.map(t=>t.id),['b','a']);assert.equal(before[0].status,'running');
 const after=toolRounds(calls.map(t=>t.id==='b'?{...t,status:'completed'}:t));assert.deepEqual(after[0].tools.map(t=>t.id),['b','a']);assert.equal(after[0].active.id,'a');assert.equal(after[0].status,'running');
 assert.equal(toolRounds(calls.map(t=>({...t,status:'stopped'})))[0].status,'stopped');
});
test('state-only starts preserve arguments and the terminal transition releases running status',()=>{
 let s=newSessionStream();
 s=updateSessionStream(s,{type:'model.response.completed',seq:1,data:{round:1,messageId:'m',toolCalls:[{toolCallId:'w',toolName:'write',arguments:{path:'/tmp/report'}}]}});
 s=updateSessionStream(s,{type:'tool.started',seq:2,data:{round:1,toolCallId:'w',toolName:'write',arguments:null}});
 assert.deepEqual(s.tools[0].arguments,{path:'/tmp/report'});assert.equal(s.tools[0].startedOrder,2);
 s=updateSessionStream(s,{type:'run.cancelled',data:{}});assert.equal(toolRounds(s.tools)[0].status,'stopped');
});
test('previews bound unicode and file writes reveal only their target',()=>{
 const body='🌏'.repeat(500);assert.equal(Array.from(toolPreview(body)).length,201);assert.ok(toolPreview(body).endsWith('…'));
 const summary=toolArgumentsPreview({...tool('w',1,'completed'),name:'write',arguments:{path:'/tmp/a',content:'hidden body'}});assert.match(summary,/\/tmp\/a/);assert.doesNotMatch(summary,/hidden body/);
 const longPath=toolArgumentsPreview({...tool('w',1,'completed'),name:'write',arguments:{preview:'{\"path\":\"/very/long/path…'}});assert.match(longPath,/very\/long/);
});
test('sync activity validates diagnostics and uses the same rounds; synchronous archives restore tools',()=>{
 const raw={id:'w',round:2,name:'write',arguments:{path:'/tmp/a'},result:null,error:null,durationMs:12,status:'completed'};
 const activity=parseToolActivity([raw]);assert.equal(activity[0].round,2);assert.equal(activity[0].executed,true);
 assert.throws(()=>parseToolActivity([{...raw,round:0}]));assert.throws(()=>parseToolActivity([{...raw,result:{huge:'body'}}]));
 const archived=archivedTurn({id:'history',requestId:'request',transport:'SYNC',status:'COMPLETED',startedAt:'2026-10-31T00:00:00Z',finishedAt:'2026-10-31T00:00:01Z',metadata:{result:'done'},messages:[{type:'USER',text:'write'},{type:'AI',toolExecutionRequests:[{id:'w',name:'write',arguments:'{"path":"/tmp/a"}'}]},{type:'TOOL_EXECUTION_RESULT',id:'w',toolName:'write',text:''}]},backendSession());
 assert.equal(archived.stream.tools.length,1);assert.equal(archived.stream.tools[0].status,'completed');
});
