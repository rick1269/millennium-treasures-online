import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/game/handler.js';

function fixture(){
  const rooms=new Map();
  const presence=new Map();
  let nowMs=Date.UTC(2026,8,24);
  const requests=[];
  const fetchImpl=async (target,options={})=>{
    requests.push({target,options});
    const url=new URL(target),auth=options.headers?.authorization||'';
    if(url.pathname==='/auth/v1/user')return Response.json(auth==='Bearer alice'?{id:'alice'}:auth==='Bearer bob'?{id:'bob'}:{},{status:auth==='Bearer alice'||auth==='Bearer bob'?200:401});
    assert.equal(options.headers?.apikey,'server-secret');
    if(url.pathname==='/rest/v1/game_presence'){
      if(!options.method||options.method==='GET')return Response.json([...presence.values()].filter(p=>p.room_id===url.searchParams.get('room_id')?.slice(3)));
      if(options.method==='POST'){
        const row=JSON.parse(options.body);
        presence.set(`${row.room_id}:${row.player_id}`,row);
        return new Response(null,{status:201});
      }
      if(options.method==='PATCH'){
        const key=`${url.searchParams.get('room_id')?.slice(3)}:${url.searchParams.get('player_id')?.slice(3)}`;
        const row=presence.get(key);
        if(row&&row.client_id===url.searchParams.get('client_id')?.slice(3))Object.assign(row,JSON.parse(options.body));
        return new Response(null,{status:204});
      }
      throw Error('unexpected presence method');
    }
    if(url.pathname!=='/rest/v1/game_rooms')throw Error('unexpected endpoint');
    const id=url.searchParams.get('id')?.slice(3);
    if(!options.method||options.method==='GET'){
      const row=rooms.get(id);
      return Response.json(row?[structuredClone(row)]:[]);
    }
    if(options.method==='POST'){
      const row=JSON.parse(options.body);
      if(rooms.has(row.id))return Response.json({message:'duplicate'},{status:409});
      rooms.set(row.id,{...row,revision:0});
      return new Response(null,{status:201});
    }
    if(options.method==='PATCH'){
      const row=rooms.get(id),revision=Number(url.searchParams.get('revision')?.slice(3));
      if(!row||row.revision!==revision)return Response.json([]);
      Object.assign(row,JSON.parse(options.body));
      return Response.json([{revision:row.revision}]);
    }
    throw Error('unexpected method');
  };
  const handler=createHandler({supabaseUrl:'https://example.supabase.co',publishableKey:'public-key',secretKey:'server-secret',fetchImpl,now:()=>nowMs});
  const call=async (path,method='GET',body,who,prefix='/functions/v1/game',guestToken,clientId='11111111-1111-4111-8111-111111111111')=>{
    const result=await handler(new Request(`https://example.supabase.co${prefix}${path}`,{
      method,headers:{...(who?{Authorization:`Bearer ${who}`}:{}),...(guestToken?{'X-Guest-Token':guestToken}:{}),'X-Client-Id':clientId},body:body?JSON.stringify(body):undefined,
    }));
    return {status:result.status,body:result.status===204?null:await result.json(),headers:result.headers};
  };
  return {rooms,presence,requests,call,handler,advance:ms=>{nowMs+=ms;}};
}

test('房间成员可播放语音，未加入者不能获取录音',async()=>{
  const {call,handler}=fixture();
  const room=(await call('/api/create','POST',{name:'房主'},'alice')).body.room;
  const watcher=(await call(`/api/room/${room}/join`,'POST',{name:'观众'},'bob')).body;
  assert.equal(watcher.me.seat,null);
  const audio=Buffer.alloc(90,4).toString('base64');
  const sent=await call(`/api/room/${room}/act`,'POST',{kind:'chatVoice',audio,mime:'audio/webm',duration:2},'bob');
  assert.equal(sent.status,200);
  const messageId=sent.body.chat.at(-1).id;
  assert.equal(sent.body.chat.at(-1).audio,undefined);
  const path=`https://example.supabase.co/functions/v1/game/api/room/${room}/voice/${messageId}`;
  const anonymous=await handler(new Request(path));
  assert.equal(anonymous.status,403);
  const response=await handler(new Request(path,{headers:{Authorization:'Bearer bob'}}));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'audio/webm');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.alloc(90,4));
});

test('在线但未操作的玩家超时后托管，账号可主动接管',async()=>{
  const {call,rooms,advance}=fixture();
  const id=(await call('/api/create','POST',{name:'甲'},'alice')).body.room;
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'setBots',count:2},'alice')).status,200);
  const started=await call(`/api/room/${id}/act`,'POST',{kind:'start'},'alice');
  assert.ok(started.body.idleDeadlineAt);
  advance(45000);
  await call(`/api/room/${id}`,'GET',null,'alice');
  advance(46000);
  const timed=await call(`/api/room/${id}`,'GET',null,'alice');
  const human=rooms.get(id).state.players.find(p=>p.userId==='alice');
  assert.equal(timed.status,200);
  assert.equal(human.autoPilot,undefined);
  assert.equal(human.idlePilot,true);
  const resumed=await call(`/api/room/${id}/act`,'POST',{kind:'resume'},'alice');
  assert.equal(resumed.status,200);
  assert.equal(rooms.get(id).state.players.find(p=>p.userId==='alice').idlePilot,false);
});

test('云端房间要求登录，身份绑定后才能操作，旁观时不泄露牌与密钥',async()=>{
  const {call,rooms,requests}=fixture();
  assert.equal((await call('/api/create','POST',{name:'甲'})).status,401);
  const created=await call('/api/create','POST',{name:'甲'},'alice');
  assert.equal(created.status,200);
  const id=created.body.room;
  assert.match(id,/^[A-F0-9]{6}$/);
  const view=(await call(`/api/room/${id}`)).body;
  assert.equal(view.me,null);
  assert.equal(JSON.stringify(view).includes('token'),false);
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'setBots',count:2},'bob')).status,403);
  assert.equal((await call(`/api/room/${id}/join`,'POST',{name:'甲'},'bob')).status,400);
  const joined=await call(`/api/room/${id}/join`,'POST',{name:'乙'},'bob');
  assert.equal(joined.status,200);
  assert.equal(joined.body.me.name,'乙');
  assert.equal(JSON.stringify(joined.body).includes('token'),false);
  assert.equal((await call(`/api/room/${id}/join`,'POST',{name:'冒名'},'bob')).body.me.name,'乙');
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'setBots',count:1},'bob')).status,400);
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'setBots',count:1},'alice')).status,200);
  assert.equal(rooms.get(id).state.players.length,2);
  assert.equal(rooms.get(id).state.spectators.length,1);
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'sit',seat:2},'bob')).status,200);
  assert.equal(rooms.get(id).state.players.length,3);
  assert.ok(requests.filter(r=>r.target.includes('/rest/v1/')).every(r=>r.options.headers.apikey==='server-secret'));
});

test('跨域预检允许网页携带玩家令牌调用云端函数',async()=>{
  const {call}=fixture();
  const result=await call('/api/create','OPTIONS');
  assert.equal(result.status,204);
  assert.match(result.headers.get('access-control-allow-headers'),/authorization/);
  assert.match(result.headers.get('access-control-allow-headers'),/x-guest-token/);
  assert.match(result.headers.get('access-control-allow-headers'),/x-client-id/);
});

test('游客可建房入席和操作，但无凭证者只能旁观',async()=>{
  const {call,rooms}=fixture();
  const created=await call('/api/create','POST',{name:'游客甲',guest:true});
  assert.equal(created.status,200);
  const {room:id,guestToken:ownerToken}=created.body;
  assert.match(ownerToken,/^[a-f0-9]{48}$/);
  assert.equal(rooms.get(id).owner_user_id,null);
  assert.equal(rooms.get(id).state.players[0].isGuest,true);
  assert.equal(JSON.stringify(rooms.get(id).state).includes(ownerToken),false);
  const publicRoom=(await call(`/api/room/${id}`)).body;
  assert.equal(publicRoom.me,null);
  assert.equal(JSON.stringify(publicRoom).includes(ownerToken),false);
  assert.equal(JSON.stringify(publicRoom).includes('guestTokenHash'),false);
  const myRoom=await call(`/api/room/${id}`,'GET',null,null,'/functions/v1/game',ownerToken);
  assert.equal(myRoom.body.me.name,'游客甲');
  assert.equal(myRoom.body.me.isGuest,true);
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'setBots',count:2})).status,403);
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'setBots',count:2},null,'/functions/v1/game','0'.repeat(48))).status,403);
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'setBots',count:2},null,'/functions/v1/game',ownerToken)).status,200);
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'start'},null,'/functions/v1/game',ownerToken)).status,200);
});

test('游客与登录玩家分别绑定自己的席位',async()=>{
  const {call}=fixture();
  const id=(await call('/api/create','POST',{name:'账号甲'},'alice')).body.room;
  const joined=await call(`/api/room/${id}/join`,'POST',{name:'游客乙',guest:true});
  assert.equal(joined.status,200);
  const guestToken=joined.body.guestToken;
  assert.equal(joined.body.me.isGuest,true);
  assert.equal((await call(`/api/room/${id}/join`,'POST',{name:'冒名游客',guest:true},null,'/functions/v1/game',guestToken)).body.me.name,'游客乙');
  assert.equal((await call(`/api/room/${id}/join`,'POST',{name:'账号丙'},'bob')).body.me.isGuest,false);
  assert.equal((await call(`/api/room/${id}`,'GET',null,'bob','/functions/v1/game',guestToken)).body.me.name,'账号丙');
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'setBots',count:0},null,'/functions/v1/game',guestToken)).status,400);
});

test('游客失联后机器人托管且原凭证不能接管，账号玩家仍可继续',async()=>{
  const {call,rooms,advance}=fixture();
  const created=await call('/api/create','POST',{name:'游客房主',guest:true});
  const id=created.body.room,guestToken=created.body.guestToken;
  await call(`/api/room/${id}/join`,'POST',{name:'账号玩家'},'alice');
  await call(`/api/room/${id}/act`,'POST',{kind:'sit',seat:1},'alice');
  await call(`/api/room/${id}/act`,'POST',{kind:'setBots',count:1},null,'/functions/v1/game',guestToken);
  await call(`/api/room/${id}/act`,'POST',{kind:'start'},null,'/functions/v1/game',guestToken);
  await call(`/api/room/${id}/leave`,'POST',{},null,'/functions/v1/game',guestToken);
  await call(`/api/room/${id}`,'GET',null,'alice');
  advance(9000);
  const after=(await call(`/api/room/${id}`,'GET',null,'alice')).body;
  assert.equal(after.players[0].autoPilot,true);
  if(after.host===after.players[0].id)assert.notEqual(after.phase,'select','托管机器人应继续完成盲标');
  assert.equal(after.me.name,'账号玩家');
  assert.equal(rooms.get(id).state.players[0].guestTokenHash,undefined);
  assert.equal((await call(`/api/room/${id}`,'GET',null,null,'/functions/v1/game',guestToken)).body.me,null);
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'pass'},null,'/functions/v1/game',guestToken)).status,403);
});

test('账号玩家失联后由机器人代打，重新访问可接管原席位',async()=>{
  const {call,advance}=fixture();
  const id=(await call('/api/create','POST',{name:'账号房主'},'alice')).body.room;
  const guestToken=(await call(`/api/room/${id}/join`,'POST',{name:'游客玩家',guest:true})).body.guestToken;
  await call(`/api/room/${id}/act`,'POST',{kind:'sit',seat:1},null,'/functions/v1/game',guestToken);
  await call(`/api/room/${id}/act`,'POST',{kind:'setBots',count:1},'alice');
  await call(`/api/room/${id}/act`,'POST',{kind:'start'},'alice');
  await call(`/api/room/${id}/leave`,'POST',{},'alice');
  await call(`/api/room/${id}`,'GET',null,null,'/functions/v1/game',guestToken);
  advance(9000);
  const watching=await call(`/api/room/${id}`,'GET',null,null,'/functions/v1/game',guestToken);
  assert.equal(watching.body.players[0].autoPilot,true);
  if(watching.body.host===watching.body.players[0].id)assert.notEqual(watching.body.phase,'select');
  const returned=await call(`/api/room/${id}`,'GET',null,'alice');
  assert.equal(returned.body.me.name,'账号房主');
  assert.equal(returned.body.players[0].autoPilot,false);
});

test('刷新页面的游客可在缓冲期内回来，旧页面关闭通知不会覆盖新连接',async()=>{
  const {call,advance}=fixture();
  const oldClient='11111111-1111-4111-8111-111111111111';
  const newClient='22222222-2222-4222-8222-222222222222';
  const created=await call('/api/create','POST',{name:'游客',guest:true},null,'/functions/v1/game',null,oldClient);
  const id=created.body.room,token=created.body.guestToken;
  await call(`/api/room/${id}/leave`,'POST',{},null,'/functions/v1/game',token,oldClient);
  advance(5000);
  assert.equal((await call(`/api/room/${id}`,'GET',null,null,'/functions/v1/game',token,newClient)).body.me.name,'游客');
  await call(`/api/room/${id}/leave`,'POST',{},null,'/functions/v1/game',token,oldClient);
  advance(9000);
  const returned=await call(`/api/room/${id}`,'GET',null,null,'/functions/v1/game',token,newClient);
  assert.equal(returned.body.me.name,'游客');
  assert.equal(returned.body.players[0].autoPilot,false);
});

test('浏览器未送达关闭通知时，长时间无心跳仍会触发托管',async()=>{
  const {call,advance}=fixture();
  const created=await call('/api/create','POST',{name:'游客',guest:true});
  const id=created.body.room,token=created.body.guestToken;
  advance(61000);
  const returned=await call(`/api/room/${id}`,'GET',null,null,'/functions/v1/game',token);
  assert.equal(returned.body.me,null);
  assert.equal(returned.body.players[0].autoPilot,true);
});

test('游客房主在等待页离开后，在线玩家接任房主并可开局',async()=>{
  const {call,advance}=fixture();
  const created=await call('/api/create','POST',{name:'游客房主',guest:true});
  const id=created.body.room,token=created.body.guestToken;
  const joined=await call(`/api/room/${id}/join`,'POST',{name:'在线玩家'},'alice');
  await call(`/api/room/${id}/leave`,'POST',{},null,'/functions/v1/game',token);
  advance(9000);
  const room=(await call(`/api/room/${id}`,'GET',null,'alice')).body;
  assert.equal(room.owner,joined.body.me.id);
  assert.equal(room.players[0].autoPilot,true);
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'setBots',count:1},'alice')).status,200);
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'sit',seat:2},'alice')).status,200);
  assert.equal((await call(`/api/room/${id}/act`,'POST',{kind:'start'},'alice')).status,200);
});

test('网关保留或去掉函数前缀时都能识别建房路径',async()=>{
  const {call}=fixture();
  assert.equal((await call('/api/create','POST',{name:'甲'},'alice')).status,200);
  assert.equal((await call('/api/create','POST',{name:'乙'},'bob','')).status,200);
  assert.equal((await call('/api/create','POST',{name:'丙'},'alice','/game')).status,200);
});

test('云端操作使用 revision 防止并发覆盖',async()=>{
  const {call,rooms}=fixture();
  const id=(await call('/api/create','POST',{name:'甲'},'alice')).body.room;
  const results=await Promise.all([
    call(`/api/room/${id}/join`,'POST',{name:'乙'},'bob'),
    call(`/api/room/${id}/join`,'POST',{name:'乙'},'bob'),
  ]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
  assert.equal(rooms.get(id).state.players.length,1);
  assert.equal(rooms.get(id).state.spectators.length,1);
});

test('云端存取每回合 JSON 后，单人和两名机器人能完成整局',async()=>{
  const {call}=fixture();
  const id=(await call('/api/create','POST',{name:'甲'},'alice')).body.room;
  await call(`/api/room/${id}/act`,'POST',{kind:'setBots',count:2},'alice');
  await call(`/api/room/${id}/act`,'POST',{kind:'start'},'alice');
  for(let step=0;step<300;step++){
    const state=(await call(`/api/room/${id}`,'GET',null,'alice')).body;
    if(state.phase==='finished'){
      assert.equal(state.winner.length,3);
      assert.equal(state.turn,state.maxTurns);
      return;
    }
    let action;
    if(state.phase==='select')action={kind:'choose',position:0,mode:'open',direction:state.direction??1};
    else if(state.phase==='pre-auction'&&!state.ready?.[state.me.id])action={kind:'ready'};
    else if(state.phase==='pre-auction'&&state.host===state.me.id)action={kind:'beginAuction'};
    else if(state.phase==='open'&&state.auction.actor===state.me.id)action={kind:'pass'};
    else if(state.phase==='sealed'&&state.auction.bidders.includes(state.me.id)&&!state.auction.submitted.includes(state.me.id))action={kind:'sealedBid',amount:0};
    else if(state.phase==='trade-request'&&state.host===state.me.id)action={kind:'skipRequest'};
    else if(state.phase==='request-response'&&state.host!==state.me.id&&!Object.hasOwn(state.trade.responses||{},state.me.id))action={kind:'respondRequest'};
    else if(state.phase==='request-choice'&&state.host===state.me.id)action={kind:'chooseRequest'};
    else if(state.phase==='trade-free'&&state.host===state.me.id)action={kind:'skipTrade'};
    else if(state.phase==='trade-response'&&state.trade.to===state.me.id)action={kind:'respondTrade',accept:false};
    else if(state.phase==='turn-end'&&state.host===state.me.id)action={kind:'next'};
    assert.ok(action,`无法推进阶段 ${state.phase}`);
    const result=await call(`/api/room/${id}/act`,'POST',action,'alice');
    assert.equal(result.status,200,result.body.error);
  }
  assert.fail('整局没有在 300 步内结束');
});
