import test from "node:test";
import assert from "node:assert/strict";
import { loginSession, refreshSession, clearAuth, authState, authorizedFetch, websocketTicket } from "../src/lib/auth-session.ts";
import { BackendClient } from "../src/lib/backend-client.ts";
const token = letter => letter.repeat(43);
const session = letter => ({ accessToken: token(letter), refreshToken: null, accessExpiresAt: "2030-01-01T00:00:00Z",
  user: { id: "user-id", loginId: "alice", name: "Alice", email: "", bio: "", avatarUrl: "", language: "en", role: "Normal", configuredAdmin: false, createdAt: "2026-10-23T00:00:00Z" } });
const json = value => Response.json(value);

test("login keeps only the access token in memory and asks for an HttpOnly refresh cookie", async () => {
  const base = "https://auth-one.example/prefix/";
  await loginSession(base, "alice", "password", async (url, init) => {
    assert.equal(url, base + "api/auth/login"); assert.equal(init.credentials, "include");
    assert.equal(init.headers["X-MindRails-Auth"], "1"); return json({ ...session("a"), refreshToken: "should-never-be-stored" });
  });
  assert.equal(authState(base).session.accessToken, token("a")); assert.equal("refreshToken" in authState(base).session, false);
});
test("concurrent 401 responses share one refresh and retry with the new access token", async () => {
  const base = "https://auth-two.example/"; await loginSession(base,"alice","password",async () => json(session("a")));
  let refreshes = 0, calls = 0; let release;
  const pending = new Promise(resolve => { release = resolve; });
  const fetcher = async (url, init) => {
    if (url.endsWith("auth/refresh")) { refreshes++; await pending; return json(session("b")); }
    calls++; return new Headers(init.headers).get("Authorization") === `Bearer ${token("b")}` ? json({ ok: true }) : new Response(null, { status: 401 });
  };
  const a = authorizedFetch(base, base+"api/users", {}, fetcher), b = authorizedFetch(base, base+"api/agent", {}, fetcher);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(refreshes,1); release();
  assert.equal((await a).status,200); assert.equal((await b).status,200); assert.equal(calls,4);
});
test("late 401 uses an already-refreshed access token without rotating a second time", async () => {
  const base = "https://auth-three.example/"; await loginSession(base,"alice","password",async () => json(session("a")));
  let first = true, refreshes = 0;
  const response = await authorizedFetch(base,base+"api/users",{},async (url,init) => {
    if (url.endsWith("auth/refresh")) { refreshes++; return json(session("c")); }
    if (first) {first=false;await refreshSession(base,async () => json(session("b")));return new Response(null,{status:401});}
    assert.equal(new Headers(init.headers).get("Authorization"),`Bearer ${token("b")}`);return json({ok:true});
  });
  assert.equal(response.status,200);assert.equal(refreshes,0);
});
test("expired refresh logs out while permission denials and server errors never trigger retries", async () => {
  const base = "https://auth-four.example/"; await loginSession(base,"alice","password",async () => json(session("a")));
  let count=0;
  const response=await authorizedFetch(base,base+"api/users",{},async () => {count++;return new Response(null,{status:401});});
  assert.equal(response.status,401);assert.equal(count,2);assert.equal(authState(base).session,null);
  for(const status of [403,500]) {
    count=0;await authorizedFetch(base,base+"api/users",{},async () => {count++;return new Response(null,{status});});assert.equal(count,1);
  }
});
test("logout while refresh is pending cannot restore a stale identity", async () => {
  const base = "https://auth-five.example/"; await loginSession(base,"alice","password",async () => json(session("a")));
  let release; const response = new Promise(resolve => {release=resolve;});
  const operation = refreshSession(base,async () => response);clearAuth(base);release(json(session("b")));
  await assert.rejects(operation,/session changed/);assert.equal(authState(base).session,null);
});
test("BackendClient applies authentication and never repeats a successful write", async () => {
  const base = "https://auth-six.example/";await loginSession(base,"alice","password",async () => json(session("a")));
  let count=0;const client=new BackendClient(base,{fetch:async (url,init) => {
    count++;assert.equal(new Headers(init.headers).get("Authorization"),`Bearer ${token("a")}`);return json({id:"new"});
  }});
  assert.deepEqual(await client.request("api/users",{method:"POST",json:{name:"Alice"}}),{id:"new"});assert.equal(count,1);
});

test("initial cookie restoration cannot race a successful explicit login", async () => {
  const base="https://auth-seven.example/";let release;
  const restore=refreshSession(base,async () => new Promise(resolve => {release=resolve;}));
  const login=loginSession(base,"alice","password",async () => json(session("b")));
  assert.equal(refreshSession(base),login);
  release(new Response(null,{status:401}));await assert.rejects(restore);await login;
  assert.equal(authState(base).session.accessToken,token("b"));
});
test("a request from a previous login never retries under a different account", async () => {
  const base="https://auth-eight.example/";await loginSession(base,"alice","password",async () => json(session("a")));
  let release,calls=0;
  const request=authorizedFetch(base,base+"api/users",{method:"PUT"},async () => {calls++;return new Promise(resolve => {release=resolve;});});
  await loginSession(base,"bob","password",async () => json({...session("b"),user:{...session("b").user,id:"bob-id"}}));
  release(new Response(null,{status:401}));assert.equal((await request).status,401);assert.equal(calls,1);
});
test("upload refreshes rejected credentials and retries once with the new access token", async () => {
  const base="https://auth-nine.example/";await loginSession(base,"alice","password",async () => json(session("a")));
  const original=globalThis.XMLHttpRequest;const sent=[];
  globalThis.XMLHttpRequest=class {
    upload={};headers={};open(){}setRequestHeader(k,v){this.headers[k]=v;}
    send(){sent.push(this.headers.Authorization);this.status=sent.length===1?401:200;this.responseText=this.status===401?'{}':'{"ok":true}';queueMicrotask(() => this.onload());}
    abort(){this.onabort?.();}
  };
  try {
    const client=new BackendClient(base,{fetch:async () => json(session("b"))});
    assert.deepEqual(await client.upload("api/users/id/avatar",new FormData(),{signal:new AbortController().signal,onProgress(){}}),{ok:true});
    assert.deepEqual(sent,[`Bearer ${token("a")}`,`Bearer ${token("b")}`]);
  } finally {globalThis.XMLHttpRequest=original;}
});
test("WebSocket authorization uses a short-lived ticket and preserves deployment paths", async () => {
  const base="https://auth-ten.example/backend/";await loginSession(base,"alice","password",async () => json(session("a")));
  const original=globalThis.fetch;
  globalThis.fetch=async (url,init) => {
    assert.equal(url,base+"api/auth/ws-ticket");assert.equal(new Headers(init.headers).get("Authorization"),`Bearer ${token("a")}`);
    assert.equal(JSON.parse(init.body).path,"/api/agent/id/sessions/id/stream");return json({ticket:token("t"),expiresIn:30});
  };
  try {assert.equal(await websocketTicket(base,"/api/agent/id/sessions/id/stream",new AbortController().signal),token("t"));}
  finally {globalThis.fetch=original;}
});
