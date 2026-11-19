import test from 'node:test';
import assert from 'node:assert/strict';
import { historyMessageView, historyPartial, historyUsage } from '../src/lib/history-messages.ts';

test('native USER content, assistant thinking, and tool requests are interpreted in the frontend', () => {
  const user = { type:'USER',contents:[{type:'TEXT',text:'first'},{type:'IMAGE',image:{url:'https://example.invalid/image'}},{type:'TEXT',text:'second'}] };
  assert.equal(historyMessageView(user).text, 'first\nsecond');
  assert.equal(user.contents[1].type, 'IMAGE');
  const ai = { type:'AI',text:'answer',thinking:'reasoning',toolExecutionRequests:[{name:'lookup',arguments:'{"q":"hello"}'}] };
  assert.deepEqual(historyMessageView(ai), {text:'answer',thinking:'reasoning',toolCalls:[{name:'lookup',arguments:'{"q":"hello"}'}]});
  assert.equal(historyMessageView({type:'TOOL_EXECUTION_RESULT',text:'tool output'}).text, 'tool output');
  assert.equal(historyMessageView({type:'FUTURE_MESSAGE',custom:{text:'preserved'}}).text, '');
});

test('partial responses and unknown token usage remain separate from message bodies', () => {
  assert.deepEqual(historyPartial({partial:{answer:'partial answer',thinking:'partial thinking'}}),{answer:'partial answer',thinking:'partial thinking'});
  assert.deepEqual(historyPartial({partial:{answer:123}}),{answer:'',thinking:''});
  assert.deepEqual(historyUsage({usage:{inputTokens:0,outputTokens:4,totalTokens:4}}),{input:0,output:4,total:4});
  assert.deepEqual(historyUsage({usage:{inputTokens:-1,outputTokens:'unknown'}}),{input:null,output:null,total:null});
});
