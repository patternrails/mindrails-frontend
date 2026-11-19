import test from 'node:test';
import assert from 'node:assert/strict';
import {BackendClient} from '../src/lib/backend-client.ts';
import {BackendTasksClient,parseTask,parseTaskExecution,parseActiveTask} from '../src/lib/backend-tasks.ts';
import {openTaskStream,updateTaskStream,taskExecutionStream,parseTaskEvent} from '../src/lib/task-stream.ts';
import {newSessionStream,streamAnswer} from '../src/lib/session-stream.ts';
import {parseTaskDeliverables} from '../src/lib/task-deliverables.ts';
import {outputHref} from '../src/lib/session-deliverables.ts';
import {backendTask,taskExecution,taskReply,TaskSocket,agentId} from './fixtures/backend-task.mjs';

test('Task parsers enforce independent ownership, execution identity and authoritative activity',()=>{
 const task=backendTask();assert.equal(parseTask(task,agentId()).instructions,task.instructions);
 assert.throws(()=>parseTask(task,agentId(2)));assert.throws(()=>parseTask({...task,instructions:null},agentId()));
 assert.equal(parseTaskExecution(taskExecution(),agentId(),task.id).status,'RUNNING');
 assert.throws(()=>parseTaskExecution(taskExecution(500,300,{result:taskReply(agentId(501))}),agentId(),task.id));
 assert.deepEqual(parseActiveTask({activeExecution:{executionId:agentId(500),status:'CANCELLING'}}),{executionId:agentId(500),status:'CANCELLING'});
 assert.throws(()=>parseActiveTask({activeExecution:{executionId:agentId(500),status:'COMPLETED'}}));
});
test('Task CRUD uses deployment prefixes and sends configuration without readonly execution or identity fields',async()=>{
 const calls=[];const client=new BackendClient('http://localhost:8080/deploy/',{fetch:async(url,init)=>{calls.push({url,...init});return init.method==='POST'?Response.json(agentId(301)):new Response(null,{status:204});}});
 const tasks=new BackendTasksClient(client),input={providerId:agentId(100),name:null,instructions:'Report',cronjob:'0 9 * * *',skillIds:[]};
 assert.equal(await tasks.create(agentId(),input,new AbortController().signal),agentId(301));
 await tasks.update(agentId(),agentId(301),input,new AbortController().signal);
 assert.equal(calls[0].url,'http://localhost:8080/deploy/api/agent/'+agentId()+'/tasks');assert.deepEqual(JSON.parse(calls[1].body),input);
 await assert.rejects(tasks.create(agentId(),{...input,instructions:' '},new AbortController().signal));assert.equal(calls.length,2);
});
test('Task stream adapts native model messages, tool records, partial answers and final usage without Session frames',()=>{
 const socket=new TaskSocket();socket.commands.push({requestId:agentId(600)});let stream=newSessionStream();
 const emit=(type,data)=>{const event={version:1,type,agentId:socket.agent,taskId:socket.task,executionId:socket.execution,requestId:agentId(600),seq:1,timestamp:'2026-10-23T02:00:00Z',data};stream=updateTaskStream(stream,parseTaskEvent(JSON.stringify(event)));};
 emit('execution.started',{});emit('thinking.delta',{round:1,messageId:agentId(700),text:'Think'});
 emit('model.response.completed',{round:1,messageId:agentId(700),message:JSON.stringify([{type:'AI',text:'Checking',toolExecutionRequests:[{id:'call-1',name:'ping',arguments:'{}'}]}])});
 emit('tool.started',{round:1,toolCallId:'call-1',toolName:'ping',arguments:'{}'});
 emit('tool.completed',{id:'call-1',name:'ping',arguments:'{}',result:'pong',failed:false,durationMs:5});
 emit('answer.delta',{round:2,messageId:agentId(701),text:'Task'});emit('execution.completed',taskReply());
 assert.equal(stream.tools.length,1);assert.equal(stream.tools[0].result,'pong');assert.equal(stream.tools[0].status,'completed');assert.equal(stream.messages[0].thinking,'Think');assert.equal(streamAnswer(stream),'Task complete');assert.equal(stream.usage.totalTokens,5);
 const terminal=stream;emit('answer.delta',{round:2,messageId:agentId(701),text:'late'});assert.equal(stream,terminal);
});
test('WS ready with an active execution never sends execute; closing a sent task never sends cancel',async()=>{
 const busy=new TaskSocket();let observed;const first=openTaskStream({baseUrl:'http://localhost:8080/',agentId:agentId(),taskId:agentId(300),requestId:agentId(600),signal:new AbortController().signal,onEvent:()=>{},onBusy:a=>{observed=a;},socketFactory:()=>busy});
 busy.ready({executionId:agentId(500),status:'RUNNING'});await first.result;assert.equal(busy.commands.length,0);assert.equal(observed.executionId,agentId(500));
 const socket=new TaskSocket();const second=openTaskStream({baseUrl:'http://localhost:8080/',agentId:agentId(),taskId:agentId(300),requestId:agentId(600),signal:new AbortController().signal,onEvent:()=>{},onBusy:()=>{},socketFactory:()=>socket});
 socket.ready();assert.equal(socket.commands[0].type,'execute');socket.interrupt();await assert.rejects(second.result);assert.equal(socket.commands.length,1);
});
test('Task cancellation targets the accepted execution and still waits for terminal confirmation',async()=>{
 const socket=new TaskSocket();let done=false;
 const run=openTaskStream({baseUrl:'http://localhost:8080/',agentId:agentId(),taskId:agentId(300),requestId:agentId(600),signal:new AbortController().signal,onEvent:()=>{},onBusy:()=>{},socketFactory:()=>socket,uuid:()=>agentId(601)});
 void run.result.then(()=>{done=true;});socket.ready();socket.emit('execution.accepted',{status:'STARTING'});run.cancel();run.cancel();
 assert.deepEqual(socket.commands[1],{version:1,type:'cancel',requestId:agentId(601),data:{executionId:agentId(500)}});assert.equal(socket.commands.length,2);assert.equal(done,false);
 socket.emit('execution.cancelled',{code:'CANCELLED',message:'Stopped'});await run.result;assert.equal(done,true);
});
test('Archived Task records restore final results and only use execution-scoped download URLs',()=>{
 const execution=taskExecution(500,300,{status:'COMPLETED',result:taskReply(),records:[{sequence:1,timestamp:'2026-10-23T02:00:00Z',type:'execution.completed',data:taskReply()}]});
 assert.equal(streamAnswer(taskExecutionStream(execution)),'Task complete');
 const url=`/api/asset-storage/task-executions/${execution.id}/deliverables/${agentId(900)}/download`;
 const file={id:agentId(900),name:'report.csv',path:'report.csv',bytes:20,updatedAt:'2026-10-23T02:00:00Z',downloadUrl:url};
 assert.equal(parseTaskDeliverables([file],execution.id).length,1);assert.equal(outputHref('http://localhost:8080/prefix/',url),'http://localhost:8080/prefix/'+url.slice(1));
 assert.throws(()=>parseTaskDeliverables([file],agentId(501)));assert.equal(outputHref('http://localhost:8080/','/api/asset-storage/task-executions/bad/deliverables/bad/download'),'/api/asset-storage/task-executions/bad/deliverables/bad/download');
});

test('Tool argument fragments reconcile to real call IDs and interrupted first-round text survives archive reload',()=>{
 const event=(type,data)=>({version:1,type,agentId:agentId(),taskId:agentId(300),executionId:agentId(500),requestId:agentId(600),seq:1,timestamp:'2026-10-23T02:00:00Z',data});
 let stream=updateTaskStream(newSessionStream(),event('tool.arguments.delta',{round:1,index:0,toolName:'ping',text:'{'}));
 stream=updateTaskStream(stream,event('model.response.completed',{round:1,messageId:agentId(700),message:JSON.stringify([{type:'AI',text:'',toolExecutionRequests:[{id:'real-id',name:'ping',arguments:'{}'}]}])}));
 assert.equal(stream.tools.length,1);assert.equal(stream.tools[0].id,'real-id');
 const execution=taskExecution(500,300,{status:'CANCELLED',records:[
  {sequence:1,timestamp:'2026-10-23T02:00:00Z',type:'model.requested',data:{round:1}},
  {sequence:2,timestamp:'2026-10-23T02:00:00Z',type:'answer.partial',data:'Interrupted output'},
  {sequence:3,timestamp:'2026-10-23T02:00:00Z',type:'thinking.partial',data:'Incomplete thought'}]});
 const restored=taskExecutionStream(execution);assert.equal(streamAnswer(restored),'Interrupted output');assert.equal(restored.messages[0].thinking,'Incomplete thought');assert.equal(restored.phase,'stopped');
});
