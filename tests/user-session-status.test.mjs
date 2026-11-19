import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserSessionStatusStore, parseUserSessionStatus } from '../src/lib/user-session-status-store.ts';
import { loginSession, clearAuth } from '../src/lib/auth-session.ts';
import { agentId } from './fixtures/backend-agent.mjs';
const base='http://user-status.test/';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class Socket extends EventTarget {
 readyState=1;closed=false;commands=[];
 send(value){this.commands.push(value);} close(){this.closed=true;this.readyState=3;}
 emit(type,data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({version:1,type,data})}));}
 interrupt(){this.dispatchEvent(new Event('close'));}
}
const status=(revision=1, extra={})=>({agentId:agentId(1),sessionId:agentId(2),revision,state:'running',activeRequestId:agentId(3),queuedCount:2,lastFinished:null,...extra});
async function setup(t,options={}) {
 const listeners=new Set(),sockets=[],tickets=[];
 const connection={getSnapshot:()=>({client:{BASE_URL:base}}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
 const login=async(id=agentId(100))=>loginSession(base,'test','password',async()=>Response.json({accessToken:'a'.repeat(43),accessExpiresAt:'2030-01-01T00:00:00Z',user:{id,language:'en',role:'Normal'}}));
 await login();
 const store=createUserSessionStatusStore(connection,{ticket:async(b,path)=>{tickets.push({b,path});return 'a'.repeat(43);},socketFactory:url=>{const s=new Socket();s.url=url;sockets.push(s);return s;},retryDelays:[1],...options});
 store.start();await flush();t.after(()=>{store.stop();clearAuth(base);});
 return {store,sockets,tickets,login,publish:()=>listeners.forEach(fn=>fn())};
}
test('snapshot establishes a baseline; only new completions create hints; stale revisions are ignored',async t=>{
 const h=await setup(t),socket=h.sockets[0],finished={requestId:agentId(4),outcome:'completed'};
 socket.emit('user.status.snapshot',{sessions:[status(8,{state:'idle',activeRequestId:null,queuedCount:0,lastFinished:finished})]});
 assert.equal(h.store.getSnapshot().synced,true);assert.deepEqual(h.store.getSnapshot().newResults,{});
 socket.emit('user.session.status',status(9));socket.emit('user.session.status',status(7,{state:'doomed'}));
 assert.equal(h.store.getSnapshot().sessions[agentId(2)].state,'running');
 const next={requestId:agentId(5),outcome:'completed'};
 socket.emit('user.session.status',status(10,{lastFinished:next}));
 assert.equal(h.store.getSnapshot().newResults[agentId(2)],agentId(5));
 socket.emit('user.session.removed',{agentId:agentId(1),sessionId:agentId(2)});
 assert.deepEqual(h.store.getSnapshot().sessions,{});assert.deepEqual(h.store.getSnapshot().newResults,{});
 assert.equal(socket.commands.length,0);assert.equal(h.tickets[0].path,'/api/user/status/stream');
});
test('disconnect is unsynced; reconnect resets revision baseline and ignores the old socket',async t=>{
 const h=await setup(t),old=h.sockets[0];old.emit('user.status.snapshot',{sessions:[status(99)]});old.interrupt();
 assert.equal(h.store.getSnapshot().synced,false);assert.equal(h.store.getSnapshot().sessions[agentId(2)].state,'running');
 await new Promise(resolve=>setTimeout(resolve,10));await flush();assert.equal(h.sockets.length,2);
 const current=h.sockets[1];current.emit('user.status.snapshot',{sessions:[status(1,{state:'idle',activeRequestId:null,queuedCount:0})]});
 old.emit('user.session.status',status(100,{state:'doomed'}));
 assert.equal(h.store.getSnapshot().sessions[agentId(2)].revision,1);assert.equal(h.store.getSnapshot().synced,true);
 assert.equal(h.tickets.length,2);
});
test('same user keeps one connection; logout and a new owner clear state and replace it',async t=>{
 const h=await setup(t),old=h.sockets[0];old.emit('user.status.snapshot',{sessions:[status()]});h.publish();h.store.start();await flush();assert.equal(h.sockets.length,1);
 clearAuth(base);assert.equal(old.closed,true);assert.deepEqual(h.store.getSnapshot().sessions,{});assert.equal(h.store.getSnapshot().scope,'');
 await h.login(agentId(101));await flush();assert.equal(h.sockets.length,2);
 h.sockets[1].emit('user.status.snapshot',{sessions:[]});old.emit('user.session.status',status(8));
 assert.deepEqual(h.store.getSnapshot().sessions,{});
});
test('a delta before the snapshot is rejected and never treated as authoritative',async t=>{
 const h=await setup(t);h.sockets[0].emit('user.session.status',status());
 assert.equal(h.store.getSnapshot().synced,false);assert.deepEqual(h.store.getSnapshot().sessions,{});assert.equal(h.sockets[0].closed,true);
});
test('only expected fields survive parsing and malformed runtime identities are rejected',()=>{
 const parsed=parseUserSessionStatus({...status(),message:'must not enter state',answer:'private'});
 assert.equal('message' in parsed,false);assert.equal('answer' in parsed,false);
 assert.throws(()=>parseUserSessionStatus(status(0)));assert.throws(()=>parseUserSessionStatus(status(1,{sessionId:'bad'})));
 assert.throws(()=>parseUserSessionStatus(status(1,{queuedCount:-1})));assert.throws(()=>parseUserSessionStatus(status(1,{lastFinished:{requestId:agentId(3),outcome:'unknown'}})));
});
