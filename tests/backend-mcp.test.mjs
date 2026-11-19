import test from 'node:test';
import assert from 'node:assert/strict';
import { BackendClient } from '../src/lib/backend-client.ts';
import { importMcp, mcpPath, parseMcpConfig, parseMcpPage, parseMcpTools } from '../src/lib/backend-mcp.ts';
const id='00000000-0000-4000-8000-000000000001';
const server={id,ownerId:id,name:'mock',transport:'stdio',config:{command:'python3'},enabled:true,version:0,createdAt:'2026-10-14T00:00:00Z',updatedAt:'2026-10-14T00:00:00Z',status:{state:'UNKNOWN',errorCode:null,message:null},toolCount:0,discoveredAt:null,stale:true,hasSecrets:false};
test('MCP parsers validate identities, versions, pagination and catalog data',()=>{
 const page={items:[server],total:1,page:0,size:100,hasNext:false};assert.deepEqual(parseMcpPage(page),page);
 for(const patch of [{items:[{...server,id:'bad'}]},{items:[{...server,version:-1}]},{hasNext:true},{items:[server,server]}])assert.throws(()=>parseMcpPage({...page,...patch}),{code:'invalid-response'});
 const tools={configVersion:0,discoveredAt:null,stale:true,items:[{name:'echo',modelName:'mcp_echo',description:'Echo',inputSchema:{type:'object'}}]};
 assert.deepEqual(parseMcpTools(tools),tools);assert.throws(()=>parseMcpTools({...tools,items:[{name:1}]}),{code:'invalid-response'});
 assert.throws(()=>mcpPath('bad'),{code:'invalid-request'});
});
test('JSON import checks syntax/size and sends explicit create/upsert versions',async()=>{
 assert.deepEqual(parseMcpConfig('{"servers":{}}'),{servers:{}});
 for(const v of ['{bad','[]','"'+'x'.repeat(1048577)+'"'])assert.throws(()=>parseMcpConfig(v),{code:'invalid-request'});
 const requests=[];const client=new BackendClient('http://localhost:8080/prefix',{fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return Response.json({items:[server],warnings:['extension preserved']});}});
 const signal=new AbortController().signal;
 await importMcp(client,{mcpServers:{}},signal);await importMcp(client,{servers:{}},signal,[server]);
 assert.equal(requests[0].url,'http://localhost:8080/prefix/api/mcp/servers/import');assert.equal(requests[0].body.mode,'CREATE_ONLY');
 assert.equal(requests[1].body.mode,'UPSERT');assert.deepEqual(requests[1].body.expectedVersions,{mock:0});
});
test('backend disposal aborts a pending MCP import without retrying',async()=>{
 let count=0;const client=new BackendClient('http://localhost:8080',{fetch:async()=>{count++;return new Promise(()=>{});}});
 const pending=importMcp(client,{mcpServers:{}},new AbortController().signal);client.dispose();
 await assert.rejects(pending,{code:'cancelled'});assert.equal(count,1);
});
