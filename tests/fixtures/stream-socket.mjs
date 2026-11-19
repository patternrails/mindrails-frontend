import { agentId } from './backend-agent.mjs';
export class StreamSocket extends EventTarget {
 readyState=1; commands=[]; seq=0; closed=false;
 constructor(agent=agentId(),session=agentId(10)){super();this.agent=agent;this.session=session;}
 send(raw){this.commands.push(JSON.parse(raw));}
 close(){this.closed=true;this.readyState=3;}
 emit(type,data={},requestId=this.commands[0]?.requestId??null,overrides={}){
  const event={version:1,type,agentId:this.agent,sessionId:this.session,requestId,seq:++this.seq,timestamp:'2026-10-18T02:00:00Z',data,...overrides};
  this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(event)}));return event;
 }
 ready(){this.emit('connection.ready',{activeRun:null},null);}
 interrupt(){this.dispatchEvent(new Event('close'));}
}
export const messageData=(text,round=1,id=agentId(600))=>({text,round,messageId:id});
