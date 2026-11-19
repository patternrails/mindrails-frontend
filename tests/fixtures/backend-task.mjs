import { agentId, backendAgent } from './backend-agent.mjs';
import { backendProvider } from './backend-session.mjs';
export const backendTask=(n=300,agent=1,overrides={})=>({id:agentId(n),ownerId:agentId(99),parentAgentId:agentId(agent),name:null,provider:backendProvider(100,true),instructions:'Write a daily report',cronjob:null,skillIds:[],createdAt:'2026-10-23T01:00:00Z',updatedAt:'2026-10-23T01:00:00Z',...overrides});
export const taskExecution=(n=500,task=300,overrides={})=>({id:agentId(n),ownerId:agentId(99),agentId:agentId(),taskId:agentId(task),requestId:agentId(n+100),status:'RUNNING',createdAt:'2026-10-23T02:00:00Z',startedAt:'2026-10-23T02:00:00Z',finishedAt:null,durationMs:null,parameters:{},trigger:{type:'API',scheduledAt:null},taskSnapshot:{version:0,name:null,instructions:'Write a daily report',agentSystemMessage:'Policy',providerId:agentId(100),providerName:'Provider 100',modelName:'test-model',cronjob:null,skillIds:[]},records:[],usage:null,toolExecutions:[],result:null,error:null,...overrides});
export const taskReply=(id=agentId(500))=>({executionId:id,lines:['Task complete'],sources:[],usage:{inputTokens:2,outputTokens:3,totalTokens:5},executedTools:[]});
export class TaskSocket extends EventTarget {
 readyState=1;commands=[];seq=0;closed=false;
 constructor(task=agentId(300),agent=agentId()){super();this.task=task;this.agent=agent;this.execution=agentId(500);}
 send(raw){this.commands.push(JSON.parse(raw));}
 close(){this.closed=true;this.readyState=3;}
 emit(type,data={},overrides={}){const event={version:1,type,agentId:this.agent,taskId:this.task,executionId:this.execution,requestId:this.commands[0]?.requestId??null,seq:++this.seq,timestamp:'2026-10-23T02:00:00Z',data,...overrides};this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(event)}));return event;}
 ready(active=null){this.emit('connection.ready',{activeExecution:active},{executionId:null,requestId:null});}
 interrupt(){this.dispatchEvent(new Event('close'));}
}
export {agentId,backendAgent,backendProvider};
