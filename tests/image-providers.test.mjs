import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImageProvider, parseImageProviders } from '../src/lib/image-providers.ts';
import { parseSessionDeliverables } from '../src/lib/session-deliverables.ts';
const id = '10000000-0000-4000-8000-000000000001';
const session = '20000000-0000-4000-8000-000000000001';
const version = '30000000-0000-4000-8000-000000000001';
const provider = { id, name:'image', providerName:'qwen', url:'https://workspace.example/images/generations', model:'qwen-image-3.0-pro',
  hasApiKey:true, defaultProvider:true, enabled:true, size:'1024x1024', promptExtend:true, timeoutMillis:180000,
  tested:true, testSuccess:true, testedAt:'2026-11-04T00:00:00Z', testLatencyMs:100, testMessage:'OK', version:0 };
test('image providers retain durable status and settings but discard API keys', () => {
  assert.deepEqual(parseImageProvider({...provider, apiKey:'private-key'}),provider);
  assert.deepEqual(parseImageProviders([provider]),[provider]);
  assert.deepEqual(parseImageProviders([]),[]);
  const failed = {...provider,testSuccess:false,testMessage:'Connection failed'};
  assert.equal(parseImageProvider(failed).testSuccess,false);
});
test('image provider parser rejects unsupported vendors and malformed status', () => {
  for(const change of [{providerName:'other'},{tested:'true'},{testSuccess:null},{id:'bad'},{timeoutMillis:1},{testLatencyMs:-1},{testedAt:'invalid'},{version:-1}]) {
    assert.throws(()=>parseImageProvider({...provider,...change}));
  }
  assert.throws(()=>parseImageProviders([provider,provider]));
});
const file={id,name:'generated.png',path:'generated.png',bytes:100,updatedAt:'2026-11-04T00:00:00Z',
  downloadUrl:`/api/asset-storage/sessions/${session}/deliverables/${id}/download`};
test('generated images restore stable asset metadata while old deliverables remain compatible',()=>{
  assert.deepEqual(parseSessionDeliverables([file],session),[file]);
  assert.deepEqual(parseSessionDeliverables([{...file,assetId:null,versionId:null,mediaType:null}],session),[file]);
  const image={...file,assetId:id,versionId:version,mediaType:'image/png'};
  assert.deepEqual(parseSessionDeliverables([image],session),[image]);
});
test('generated image metadata cannot introduce remote URLs, SVG content or another Session',()=>{
  const image={...file,assetId:id,versionId:version,mediaType:'image/png'};
  for (const change of [{mediaType:'image/svg+xml'},{versionId:'invalid'},{assetId:null},{downloadUrl:'https://vendor.example/image.png'}]) {
    assert.throws(()=>parseSessionDeliverables([{...image,...change}],session));
  }
  assert.throws(()=>parseSessionDeliverables([image],version));
});
