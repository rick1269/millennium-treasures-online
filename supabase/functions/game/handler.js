import {createGame,joinGame,act,advanceBots,advanceIdle,publicView,normalizeRoom,voiceMessage} from '../_shared/game.js';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-guest-token, x-client-id',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const view=(game,player)=>{
  const result=publicView(game,player);
  if(result.me)delete result.me.token;
  return result;
};
const validRoom=id=>/^[A-F0-9]{6}$/.test(id);
const presenceTimeoutMs=60000;
const closeGraceMs=8000;
const validClientId=id=>/^[a-f0-9-]{36}$/i.test(id);
const guestHash=token=>createHash('sha256').update(token).digest('hex');
function markGuest(player) {
  const token=player.token;
  player.isGuest=true;
  player.guestTokenHash=guestHash(token);
  delete player.token;
  return token;
}

export function createHandler({supabaseUrl,publishableKey,secretKey,fetchImpl=fetch,now=Date.now}) {
  const base=String(supabaseUrl||'').replace(/\/$/,'');
  async function table(name,path,options={}) {
    const response=await fetchImpl(`${base}/rest/v1/${name}${path}`,{
      ...options,
      headers:{apikey:secretKey,'Content-Type':'application/json',...(options.headers||{})},
    });
    if(!response.ok)throw new Error(`数据库请求失败 (${response.status})`);
    const raw=await response.text();
    return raw?JSON.parse(raw):null;
  }
  const db=(path,options)=>table('game_rooms',path,options);
  const presenceDb=(path,options)=>table('game_presence',path,options);
  async function seen(id,playerId,clientId) {
    await presenceDb('?on_conflict=room_id,player_id',{
      method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({room_id:id,player_id:playerId,client_id:validClientId(clientId)?clientId:null,last_seen_at:new Date(now()).toISOString()}),
    });
  }
  async function leaving(id,playerId,clientId) {
    if(!validClientId(clientId))return;
    await presenceDb(`?room_id=eq.${id}&player_id=eq.${playerId}&client_id=eq.${clientId}`,{
      method:'PATCH',headers:{Prefer:'return=minimal'},
      body:JSON.stringify({last_seen_at:new Date(now()-presenceTimeoutMs+closeGraceMs).toISOString()}),
    });
  }
  async function user(req) {
    const authorization=req.headers.get('authorization')||'';
    if(!/^Bearer\s+\S+$/i.test(authorization))return null;
    const response=await fetchImpl(`${base}/auth/v1/user`,{
      headers:{apikey:publishableKey,authorization},
    });
    if(!response.ok)return null;
    const result=await response.json();
    return typeof result.id==='string'?result:null;
  }
  async function getRoom(id) {
    const rows=await db(`?id=eq.${id}&select=id,revision,state&limit=1`);
    return rows[0]||null;
  }
  async function saveRoom(row,game) {
    const rows=await db(`?id=eq.${row.id}&revision=eq.${row.revision}&select=revision`,{
      method:'PATCH',headers:{Prefer:'return=representation'},
      body:JSON.stringify({state:game,revision:row.revision+1,updated_at:new Date().toISOString()}),
    });
    return rows.length===1;
  }
  async function prepareRoom(id,currentUser,rawGuestToken,clientId) {
    for(let attempt=0;attempt<3;attempt++){
      const row=await getRoom(id);
      if(!row)return null;
      const game=row.state;
      if(game.version!==2)throw new Error('此房间由旧版规则创建，请返回首页新建 v2.0 房间');
      const needsNormalization=!game.spectators||!game.chat||game.players.some(p=>!Number.isInteger(p.seat)||!p.avatar);
      normalizeRoom(game);
      game.rng=Math.random;
      const presence=await presenceDb(`?room_id=eq.${id}&select=player_id,last_seen_at`);
      const lastSeen=new Map(presence.map(p=>[p.player_id,Date.parse(p.last_seen_at)]));
      let changed=needsNormalization;
      for(const p of [...game.players,...game.spectators].filter(p=>!p.isBot)){
        if(!p.autoPilot&&now()-(lastSeen.get(p.id)||0)>presenceTimeoutMs){
          p.autoPilot=true;
          if(p.isGuest)delete p.guestTokenHash;
          changed=true;
          game.log.push(`${p.name} 暂时离线，机器人开始托管。`);
        }
      }
      const hash=!currentUser&&/^[a-f0-9]{48}$/i.test(rawGuestToken)?guestHash(rawGuestToken):null;
      const members=[...game.players,...game.spectators];
      const player=currentUser
        ?members.find(p=>!p.isBot&&p.userId===currentUser.id)
        :hash&&members.find(p=>p.isGuest&&p.guestTokenHash===hash);
      if(currentUser&&player?.autoPilot){
        player.autoPilot=false;changed=true;
        game.log.push(`${player.name} 重新接管了席位。`);
      }
      if(game.phase==='lobby'){
        const owner=members.find(p=>p.id===game.owner);
        if(owner?.isGuest&&owner.autoPilot){
          const successor=members.find(p=>!p.isBot&&!p.autoPilot);
          if(successor){game.owner=successor.id;changed=true;game.log.push(`${successor.name} 接任房主。`);}
        }
      }else if(game.phase!=='finished'&&advanceBots(game)>0)changed=true;
      if(game.phase!=='finished'&&advanceIdle(game,now()))changed=true;
      if(changed){
        if(!await saveRoom(row,game))continue;
        row.revision++;
      }
      if(player)await seen(id,player.id,clientId);
      return {row,game,player,changed};
    }
    throw new Error('房间刚刚发生变化，请重试');
  }
  return async function handler(req) {
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(!base||!publishableKey||!secretKey)return json({error:'云端服务尚未配置'},503);
    try {
      const rawPath=new URL(req.url).pathname;
      const apiIndex=rawPath.indexOf('/api/');
      const path=apiIndex>=0?rawPath.slice(apiIndex):rawPath;
      const currentUser=await user(req);
      const clientId=req.headers.get('x-client-id')||'';
      if(path==='/api/create'&&req.method==='POST'){
        const input=await readJson(req);
        if(!currentUser&&input.guest!==true)return json({error:'请先登录或选择游客模式'},401);
        const game=createGame(input.name,Math.random,input.avatar);
        const guestToken=currentUser?null:markGuest(game.players[0]);
        if(currentUser)game.players[0].userId=currentUser.id;
        for(let i=0;i<5;i++){
          try {
            await db('',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:game.id,owner_user_id:currentUser?.id||null,state:game})});
            await seen(game.id,game.players[0].id,clientId);
            return json({room:game.id,...(guestToken?{guestToken}:{})});
          } catch(e) {
            if(!String(e.message).includes('409'))throw e;
            game.id=createGame(input.name).id;
          }
        }
        return json({error:'房间码暂时不可用，请重试'},503);
      }
      const match=path.match(/^\/api\/room\/([A-Fa-f0-9]{6})(?:\/(join|act|leave|voice\/[a-f0-9]{8}))?$/);
      if(!match)return json({error:'接口不存在'},404);
      const id=match[1].toUpperCase();
      if(!validRoom(id))return json({error:'房间码无效'},400);
      const rawGuestToken=req.headers.get('x-guest-token')||'';
      if(match[2]==='leave'&&req.method==='POST'){
        const row=await getRoom(id);
        if(!row)return json({error:'房间不存在'},404);
        const hash=!currentUser&&/^[a-f0-9]{48}$/i.test(rawGuestToken)?guestHash(rawGuestToken):null;
        const player=currentUser
          ?[...row.state.players,...(row.state.spectators||[])].find(p=>!p.isBot&&p.userId===currentUser.id)
          :hash&&[...row.state.players,...(row.state.spectators||[])].find(p=>p.isGuest&&p.guestTokenHash===hash);
        if(player)await leaving(id,player.id,clientId);
        return json({ok:true});
      }
      const prepared=await prepareRoom(id,currentUser,rawGuestToken,clientId);
      if(!prepared)return json({error:'房间不存在'},404);
      const {row,game,player}=prepared;
      if(!match[2]&&req.method==='GET')return json(view(game,player));
      if(match[2]?.startsWith('voice/')&&req.method==='GET'){
        if(!player)return json({error:'请先加入房间'},403);
        const voice=voiceMessage(game,match[2].slice(6));if(!voice)return json({error:'语音消息已过期'},404);
        const bytes=Buffer.from(voice.audio,'base64');
        return new Response(bytes,{status:200,headers:{...cors,'Content-Type':voice.mime,'Content-Length':String(bytes.length)}});
      }
      if(req.method!=='POST')return json({error:'请求方式无效'},405);
      const input=await readJson(req);
      if(match[2]==='join'){
        if(player)return json(view(game,player));
        if(!currentUser&&input.guest!==true)return json({error:'请先登录或选择游客模式'},401);
        const joined=joinGame(game,input.name,{spectate:true,avatar:input.avatar});
        const guestToken=currentUser?null:markGuest(joined);
        if(currentUser)joined.userId=currentUser.id;
        const owner=[...game.players,...game.spectators].find(p=>p.id===game.owner);
        if(owner?.isGuest&&owner.autoPilot)game.owner=joined.id;
        if(!await saveRoom(row,game))return json({error:'房间刚刚发生变化，请重试'},409);
        await seen(id,joined.id,clientId);
        return json({...view(game,joined),...(guestToken?{guestToken}:{})});
      }
      if(match[2]==='act'){
        if(!player)return json({error:'你还没有加入这个房间，或游客凭证已失效'},403);
        act(game,player,input);
        advanceBots(game);
        advanceIdle(game,now());
        if(!await saveRoom(row,game))return json({error:'房间刚刚发生变化，请重试'},409);
        return json(view(game,player));
      }
      return json({error:'接口不存在'},404);
    } catch(e) {
      const message=e instanceof Error?e.message:'操作失败';
      return json({error:message},message==='房间刚刚发生变化，请重试'?409:400);
    }
  };
}

async function readJson(req) {
  const raw=await req.text();
  if(raw.length>250000)throw new Error('请求过大');
  try {return JSON.parse(raw||'{}');}
  catch {throw new Error('请求格式错误');}
}
