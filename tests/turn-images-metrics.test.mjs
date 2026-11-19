import test from 'node:test';
import assert from 'node:assert/strict';
import { imagesByTurn } from '../src/lib/turn-images.ts';
import { roundMetrics } from '../src/lib/session-summary.ts';
const turns=[
 {id:'first',sentAt:'2026-11-04T01:00:00Z',assistant:'Done',elapsedMs:52200,usage:{inputTokens:10,outputTokens:20,totalTokens:30}},
 {id:'second',sentAt:'2026-11-04T01:01:00Z',assistant:'Next answer',elapsedMs:500,usage:{inputTokens:40,outputTokens:50,totalTokens:90}},
];
const file={id:'image',versionId:'v1',downloadUrl:'/download/image',updatedAt:'2026-11-04T01:00:30Z'};
test('a new user round never moves an earlier generated image to the end of the transcript',()=>{
 assert.deepEqual(imagesByTurn(turns,[{...file,requestId:'first'}]).get('first'),[{...file,requestId:'first'}]);
 assert.equal(imagesByTurn(turns,[{...file,requestId:'first'}]).has('second'),false);
 assert.equal(imagesByTurn(turns,[{...file,requestId:'expired-history'}]).size,0);
});
test('legacy images restore to result links or their original turn interval',()=>{
 assert.equal(imagesByTurn(turns,[file]).get('first')[0],file);
 const legacy={...file,updatedAt:'2026-11-04T01:04:00Z'};
 assert.equal(imagesByTurn([{...turns[0],assistant:'Download /api/asset-storage/versions/v1/download'},turns[1]],[legacy]).get('first')[0],legacy);
});
test('round metrics count cumulative tokens only through that user round and keep unknown data explicit',()=>{
 assert.deepEqual(roundMetrics(turns,0),{waitMs:52200,tokens:30,allTokens:30});
 assert.deepEqual(roundMetrics(turns,1),{waitMs:500,tokens:90,allTokens:120});
 assert.equal(roundMetrics([{...turns[0],priorUsageUnknown:true},turns[1]],1).allTokens,null);
 assert.equal(roundMetrics([{...turns[0],usage:null},turns[1]],1).allTokens,null);
 assert.equal(roundMetrics([{...turns[0],usage:{inputTokens:10,outputTokens:20,totalTokens:null}}],0).tokens,30);
});
