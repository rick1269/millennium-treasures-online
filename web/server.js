import http from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createGame,joinGame,playerByToken,act,advanceBots,advanceIdle,publicView,normalizeRoom,voiceMessage} from './game.js';
import {loadCardAssets} from '../scripts/card-assets.js';

const root=dirname(fileURLToPath(import.meta.url));
const data=join(root,'data');mkdirSync(data,{recursive:true});
const db=join(data,'rooms.json');
const rooms=new Map();
if(existsSync(db)){
  try { for(const g of JSON.parse(readFileSync(db,'utf8'))){g.rng=Math.random;rooms.set(g.id,normalizeRoom(g));} }
  catch(e){console.error('存档读取失败，未覆盖原文件：',e);}
}
function save(){const tmp=db+'.tmp';writeFileSync(tmp,JSON.stringify([...rooms.values()]));renameSync(tmp,db);}
const send=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
const body=req=>new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>250000){reject(new Error('请求过大'));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'));}catch{reject(new Error('请求格式错误'));}});});
const assets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/cloud-config.js':['cloud-config.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml'],'/manual.html':['manual.html','text/html; charset=utf-8'],'/auction-flow-v2-revised.png':['auction-flow-v2-revised.png','image/png']};
let cardAssetCache=null,cardAssetTime=0;
function currentCardAssets(){
  const mtime=statSync(join(root,'../cards/assets.csv')).mtimeMs;
  if(!cardAssetCache||mtime!==cardAssetTime){cardAssetCache=loadCardAssets();cardAssetTime=mtime;}
  return cardAssetCache;
}
const imageTypes={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://local');
    if(req.method==='GET'&&assets[url.pathname]){const [file,type]=assets[url.pathname];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(readFileSync(join(root,file)));return;}
    if(req.method==='GET'&&url.pathname==='/card-assets.js'){
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(currentCardAssets().script);return;
    }
    if(req.method==='GET'&&url.pathname.startsWith('/assets/')){
      const match=url.pathname.match(/^\/assets\/(v\d+\.\d+\.\d+)\/([a-zA-Z0-9.-]+)$/);
      const selected=currentCardAssets();
      const source=match&&match[1]===selected.manifest.version?selected.files.get(match[2]):null;
      if(!source)return send(res,404,{error:'素材不存在'});
      res.writeHead(200,{'Content-Type':imageTypes[source.slice(source.lastIndexOf('.')).toLowerCase()],'Cache-Control':'no-cache'});
      res.end(readFileSync(source));return;
    }
    if(req.method==='GET'&&/^\/api\/room\/[A-F0-9]{6}\/voice\/[a-f0-9]{8}$/.test(url.pathname)){
      const id=url.pathname.split('/')[3],g=rooms.get(id),p=g&&playerByToken(g,url.searchParams.get('token'));
      if(!g||!p)return send(res,403,{error:'请先加入房间'});
      const voice=voiceMessage(g,url.pathname.split('/')[5]);if(!voice)return send(res,404,{error:'语音消息已过期'});
      const audio=Buffer.from(voice.audio,'base64');res.writeHead(200,{'Content-Type':voice.mime,'Content-Length':audio.length,'Cache-Control':'no-store'});res.end(audio);return;
    }
    if(req.method==='GET'&&url.pathname.startsWith('/api/room/')){
      const id=url.pathname.split('/')[3]?.toUpperCase(),g=rooms.get(id);if(!g)return send(res,404,{error:'房间不存在'});if(g.version!==2)return send(res,400,{error:'此房间由旧版规则创建，请返回首页新建 v2.0 房间'});
      const botSteps=advanceBots(g),idleChanged=advanceIdle(g);if(botSteps>0||idleChanged)save();
      return send(res,200,publicView(g,playerByToken(g,url.searchParams.get('token'))));
    }
    if(req.method==='POST'&&url.pathname==='/api/create'){
      const b=await body(req),g=createGame(b.name,Math.random,b.avatar);rooms.set(g.id,g);save();return send(res,200,{room:g.id,token:g.players[0].token});
    }
    if(req.method==='POST'&&url.pathname.match(/^\/api\/room\/[A-F0-9]{6}\/join$/)){
      const id=url.pathname.split('/')[3],g=rooms.get(id);if(!g)return send(res,404,{error:'房间不存在'});if(g.version!==2)return send(res,400,{error:'此房间由旧版规则创建，请返回首页新建 v2.0 房间'});
      const b=await body(req),p=joinGame(g,b.name,{spectate:true,avatar:b.avatar});save();return send(res,200,{room:id,token:p.token});
    }
    if(req.method==='POST'&&url.pathname.match(/^\/api\/room\/[A-F0-9]{6}\/act$/)){
      const id=url.pathname.split('/')[3],g=rooms.get(id);if(!g)return send(res,404,{error:'房间不存在'});if(g.version!==2)return send(res,400,{error:'此房间由旧版规则创建，请返回首页新建 v2.0 房间'});
      const b=await body(req),p=playerByToken(g,b.token);act(g,p,b);advanceBots(g);advanceIdle(g);save();return send(res,200,publicView(g,p));
    }
    send(res,404,{error:'页面不存在'});
  }catch(e){send(res,400,{error:e.message||'操作失败'});}
});
const port=Number(process.env.PORT||8787),host=process.env.HOST||'0.0.0.0';
server.listen(port,host,()=>console.log(`千年藏珍运行中：http://localhost:${port}`));
