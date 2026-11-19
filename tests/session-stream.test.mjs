import assert from 'node:assert/strict';
import test from 'node:test';
import { newSessionStream,parseStreamEvent,updateSessionStream,streamAnswer,streamIntermediateMessages } from '../src/lib/session-stream.ts';
import { connectSessionStream, openSessionStream } from '../src/lib/backend-session-stream.ts';
import { StreamSocket,messageData } from './fixtures/stream-socket.mjs';
import { agentId } from './fixtures/backend-agent.mjs';
const event=(type,data)=>parseStreamEvent(JSON.stringify({version:1,type,agentId:agentId(),sessionId:agentId(10),requestId:agentId(500),seq:1,timestamp:'2026-10-18T02:00:00Z',data}));
function setup(t,overrides={}){
 const socket=new StreamSocket(),controller=new AbortController(),events=[];
 const run=openSessionStream({baseUrl:'https://example.test/prefix/',agentId:agentId(),sessionId:agentId(10),requestId:agentId(500),message:'你好',signal:controller.signal,
  socketFactory:url=>{assert.equal(url,`wss://example.test/prefix/api/agent/${agentId()}/sessions/${agentId(10)}/stream`);return socket;},uuid:()=>agentId(501),onEvent:e=>events.push(e),...overrides});
 t.after(()=>controller.abort());return {socket,controller,events,...run};
}
test('rounds stay separate; final snapshot replaces deltas; model completion does not complete a run',()=>{
 let s=newSessionStream();
 for(const [type,data] of [['thinking.delta',messageData('分析')],['answer.delta',messageData('先检查文件')],['tool.arguments.delta',{round:1,toolCallId:'t',toolName:'read_file',text:'{"path":'}],
  ['tool.started',{round:1,toolCallId:'t',toolName:'read_file',arguments:{path:'README.md'}}],
  ['model.response.completed',{round:1,messageId:agentId(600),toolCalls:[{toolCallId:'t',toolName:'read_file',arguments:{path:'README.md'}}]}]])s=updateSessionStream(s,event(type,data));
 assert.equal(s.phase,'working');assert.equal(s.tools[0].status,'running');
 s=updateSessionStream(s,event('tool.completed',{round:1,toolCallId:'t',toolName:'read_file',result:'done',durationMs:10,truncated:true}));
 s=updateSessionStream(s,event('answer.delta',messageData('部分答案',2,agentId(601))));assert.equal(streamAnswer(s),'部分答案');
 s=updateSessionStream(s,event('run.completed',{finalMessageId:agentId(601),answer:'最终答案'}));
 assert.equal(streamAnswer(s),'最终答案');assert.equal(s.messages[0].answer,'先检查文件');assert.equal(s.messages[0].thinking,'分析');assert.equal(s.tools[0].truncated,true);assert.equal(s.phase,'completed');
 assert.strictEqual(updateSessionStream(s,event('answer.delta',messageData('late'))),s);
});
test('tool identities include round and cancellation preserves partial output without claiming running tools succeeded',()=>{
 let s=newSessionStream();
 for(const round of [1,2])s=updateSessionStream(s,event('tool.started',{round,toolCallId:'same',toolName:'shell',arguments:{}}));
 s=updateSessionStream(s,event('answer.delta',messageData('部分')));s=updateSessionStream(s,event('run.cancelling',{state:'CANCELLING'}));
 s=updateSessionStream(s,event('chat.accepted',{state:'STARTING'}));assert.equal(s.phase,'cancelling');
 s=updateSessionStream(s,event('run.cancelled',{state:'CANCELLED'}));assert.equal(s.tools.length,2);assert.ok(s.tools.every(t=>t.status==='stopped'));assert.equal(streamAnswer(s),'部分');
});
test('tool-bound responses move into the intermediate section before the next model round arrives',()=>{
 let s=newSessionStream();
 s=updateSessionStream(s,event('thinking.delta',messageData('Internal reasoning')));
 assert.deepEqual(streamIntermediateMessages(s),[]);
 s=updateSessionStream(s,event('answer.delta',messageData('I will verify **this** first.')));
 assert.equal(streamAnswer(s),'I will verify **this** first.');
 assert.deepEqual(streamIntermediateMessages(s),[]);
 s=updateSessionStream(s,event('model.response.completed',{round:1,messageId:agentId(600),toolCalls:[{toolCallId:'verify',toolName:'bash',arguments:{command:'java --version'}}]}));
 assert.equal(streamAnswer(s),null);
 assert.deepEqual(streamIntermediateMessages(s).map(m=>m.answer),['I will verify **this** first.']);
 s=updateSessionStream(s,event('answer.delta',messageData('Final response',2,agentId(601))));
 assert.equal(streamAnswer(s),'Final response');
 s=updateSessionStream(s,event('run.completed',{finalMessageId:agentId(601),answer:'Final response'}));
 assert.deepEqual(streamIntermediateMessages(s).map(m=>m.answer),['I will verify **this** first.']);
 assert.equal(streamAnswer(s),'Final response');
});
test('payload validation rejects broken used fields while accepting unknown future events',()=>{
 for(const [type,data] of [['answer.delta',{round:1,messageId:agentId(600),text:4}],['model.response.completed',{round:1,messageId:agentId(600),toolCalls:[{}]}],['tool.started',{round:1,toolCallId:'t',toolName:'shell',arguments:[]}],['run.completed',{answer:null,finalMessageId:agentId(600)}],['run.failed',{error:{}}]])assert.throws(()=>event(type,data),/Invalid streaming/);
 assert.equal(event('future.event',{anything:true}).type,'future.event');
});
test('chat waits for connection.ready and supports terminal events before chat.accepted',async t=>{
 const h=setup(t);assert.equal(h.socket.commands.length,0);h.socket.ready();
 assert.deepEqual(h.socket.commands,[{version:1,type:'chat',requestId:agentId(500),data:{message:'你好'}}]);
 h.socket.emit('run.started',{state:'RUNNING'});h.socket.emit('answer.delta',messageData('hi'));h.socket.emit('run.completed',{answer:'hi',finalMessageId:agentId(600)});
 h.socket.emit('chat.accepted',{state:'STARTING'});assert.equal((await h.result).status,'completed');assert.equal(h.socket.closed,true);assert.equal(h.events.length,3);
});
test('cancel sends an independent UUID and waits for confirmed cancellation on cancel requestId',async t=>{
 const h=setup(t);h.socket.ready();h.cancel();h.cancel();assert.equal(h.socket.commands.length,2);
 assert.deepEqual(h.socket.commands[1],{version:1,type:'cancel',requestId:agentId(501),data:{}});
 h.socket.emit('run.cancelling',{state:'CANCELLING'},agentId(501));h.socket.emit('run.cancelled',{state:'CANCELLED'},agentId(501));
 assert.equal((await h.result).status,'stopped');
});
test('cancellation also accepts original chat terminal; completion may win a Stop race',async t=>{
 for(const terminal of ['run.completed','run.cancelled']){
  const h=setup(t);h.socket.ready();h.cancel();h.socket.emit('command.error',{code:'NOT_FOUND',message:'already done'},agentId(501));
  h.socket.emit(terminal,terminal==='run.completed'?{answer:'done',finalMessageId:agentId(600)}:{state:'CANCELLED'});
  assert.equal((await h.result).status,terminal==='run.completed'?'completed':'stopped');
 }
});
test('Stop before ready never sends chat, and ignores delayed frames after cleanup',async t=>{
 const h=setup(t);h.cancel();h.socket.ready();assert.equal((await h.result).status,'stopped');assert.equal(h.socket.commands.length,0);assert.equal(h.events.length,0);
});
test('duplicates and unrelated request events cannot update this run; missing sequence fails safely',async t=>{
 const h=setup(t);h.socket.ready();h.socket.emit('answer.delta',messageData('other'),agentId(700));
 const e=h.socket.emit('answer.delta',messageData('ours'));h.socket.emit('answer.delta',messageData('duplicate'),agentId(500),{seq:e.seq});
 assert.equal(h.events.length,1);h.socket.emit('answer.delta',messageData('missing'),agentId(500),{seq:10});await assert.rejects(h.result,{code:'invalid-response'});
});
test('cancel acknowledgement without a terminal times out as unknown; disconnect is never success',async t=>{
 const h=setup(t,{cancelTimeoutMs:10});h.socket.ready();h.cancel();h.socket.emit('run.cancelling',{state:'CANCELLING'},agentId(501));
 await assert.rejects(h.result,{code:'timeout'});
 const other=setup(t);other.socket.ready();other.socket.interrupt();await assert.rejects(other.result,{code:'network'});
});
test('chat rejection and execution failure produce explicit failed outcomes',async t=>{
 for(const type of ['command.error','run.failed']){
  const h=setup(t);h.socket.ready();h.socket.emit(type,type==='command.error'?{code:'CONFLICT',message:'busy'}:{error:{code:'INTERNAL_ERROR',message:'failed'}});
  const result=await h.result;assert.equal(result.status,'failed');assert.equal(result.error.code,'remote');
  assert.equal(result.error.serverCode,type==='command.error'?'CONFLICT':'INTERNAL_ERROR');assert.equal(result.error.status,undefined);
 }
});
test('aborting only detaches observation; there is no automatic replay',async t=>{
 const h=setup(t);h.socket.ready();h.controller.abort();await assert.rejects(h.result,{code:'cancelled'});
 h.socket.emit('run.completed',{answer:'late',finalMessageId:agentId(600)});assert.equal(h.events.length,0);assert.deepEqual(h.socket.commands.map(c=>c.type),['chat']);
});
test('name-only tool fragments accept null argument text from providers',()=>{
 const e=event('tool.arguments.delta',{round:1,toolCallId:'tool',toolName:'read_file',text:null});
 const s=updateSessionStream(newSessionStream(),e);assert.equal(s.tools[0].argumentText,'');assert.equal(s.tools[0].name,'read_file');
});
test('uncorrelated null requestId cannot terminate or update the current chat',async t=>{
 const h=setup(t);h.socket.ready();h.socket.emit('run.cancelled',{state:'CANCELLED'},null);h.socket.emit('answer.delta',messageData('wrong'),null);
 assert.equal(h.events.length,0);h.socket.emit('run.completed',{answer:'done',finalMessageId:agentId(600)});assert.equal((await h.result).status,'completed');
});

test('TLS failure keeps safe cause details and request identity without becoming HTTP 500', async t => {
 const h = setup(t); h.socket.ready();
 const requestId = h.socket.commands[0].requestId;
 h.socket.emit('run.failed', { error: { code: 'UNAVAILABLE', message: 'Secure connection failed',
  reason: 'TLS_HANDSHAKE_FAILED', detail: 'SSLHandshakeException: Remote host terminated the handshake' } });
 const outcome = await h.result;
 assert.equal(outcome.status, 'failed'); assert.equal(outcome.error.status, undefined);
 assert.equal(outcome.error.reason, 'TLS_HANDSHAKE_FAILED'); assert.equal(outcome.error.requestId, requestId);
 assert.match(outcome.error.detail, /SSLHandshakeException/);
});

test('provider rejection preserves the original message and exception details', async t => {
 const h = setup(t); h.socket.ready();
 const message = 'The image requires 58806 patches, exceeding the limit of 30000.';
 const detail = 'com.openai.errors.BadRequestException (HTTP 400)';
 h.socket.emit('run.failed', { error: { code: 'INVALID_ARGUMENT', message, reason: 'PROVIDER_ERROR', detail } });
 const outcome = await h.result;
 assert.equal(outcome.status, 'failed');
 assert.equal(outcome.error.serverCode, 'INVALID_ARGUMENT');
 assert.equal(outcome.error.message, message);
 assert.equal(outcome.error.detail, detail);
});


test('Session subscription accepts queued requests, stays open after completion and closes without stopping', async t => {
 const socket = new StreamSocket(), controller = new AbortController(), events = [];
 const connection = connectSessionStream({baseUrl:'https://example.test/',agentId:agentId(),sessionId:agentId(10),
  signal:controller.signal,socketFactory:()=>socket,onEvent:event=>events.push(event)});
 t.after(()=>controller.abort());
 const first = connection.chat({requestId:agentId(500),message:'A',signal:new AbortController().signal});
 const second = connection.chat({requestId:agentId(501),message:'B',signal:new AbortController().signal});
 assert.equal(socket.commands.length,0);
 socket.ready(); await connection.ready;
 assert.deepEqual(socket.commands.map(command=>command.data.message),['A','B']);
 socket.emit('run.completed',{answer:'A done',finalMessageId:agentId(600)},agentId(500));
 assert.equal((await first.result).status,'completed');
 assert.equal(socket.closed,false);
 socket.emit('run.cancelled',{state:'CANCELLED'},agentId(501));
 assert.equal((await second.result).status,'stopped');
 assert.equal(socket.closed,false);
 socket.emit('run.started',{state:'RUNNING'},agentId(502));
 assert.equal(events.length,3);
 connection.close();
 assert.equal(socket.closed,true);
 assert.deepEqual(socket.commands.map(command=>command.type),['chat','chat']);
});

test('communication input validates identities and moves from queued to running without accepting a mismatched ID',()=>{
 const id=agentId(500),input={requestId:id,message:'check this',submittedAt:'2026-11-07T08:00:00Z',source:{sourceSessionId:agentId(21),sourceAgentId:agentId(2),sourceRunId:agentId(950),inReplyTo:null,sentAt:'2026-11-07T08:00:00Z',hops:1}};
 let stream=updateSessionStream(newSessionStream(),event('message.enqueued',input));assert.equal(stream.phase,'queued');
 stream=updateSessionStream(stream,event('run.started',{input}));assert.equal(stream.phase,'working');
 assert.throws(()=>event('message.enqueued',{...input,requestId:agentId(501)}));
 assert.throws(()=>event('message.enqueued',{...input,source:{...input.source,sourceSessionId:'someone'}}));
 assert.throws(()=>event('run.started',{input:{...input,source:{...input.source,hops:0}}}));
});
