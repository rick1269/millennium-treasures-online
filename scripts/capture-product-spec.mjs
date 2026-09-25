import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createGame,joinGame,startGame,act,advanceBots,publicView} from '../web/game.js';
import {deckFor} from '../web/catalog.js';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'docs','product-spec-assets');
mkdirSync(out,{recursive:true});
const bundled='/Users/rickqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const {chromium}=await import(process.env.PRODUCT_SPEC_PLAYWRIGHT||pathToFileURL(bundled).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox']});

function seeded(seed){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
const room='A3B6C9';
function makeGame(){const g=createGame('甲',seeded(77));joinGame(g,'乙');joinGame(g,'丙');g.id=room;return g;}
const shots=[];
function save(name,g,p,view='action',caption=''){
 const state=JSON.parse(JSON.stringify(publicView(g,p)));
 shots.push({name,state,view,caption,phase:g.phase,turn:state.turn});
}
function auction(g){for(const p of g.players)if(!g.ready[p.id])act(g,p,{kind:'ready'});act(g,g.players[g.host],{kind:'beginAuction'});}
const lobby=makeGame();
save('01-lobby',lobby,lobby.players[0],'table','3 人入席与开局');
startGame(lobby,lobby.players[0]);
const host=lobby.players[lobby.host];
save('02-select',lobby,host,'action','起始玩家背面选择心仪卡、拍卖模式与方向');
act(lobby,host,{kind:'choose',position:1,mode:'open',direction:1});
save('03-pre-auction',lobby,host,'action','第 1 张翻面前的出售窗口');
auction(lobby);
save('04-open',lobby,lobby.players.find(p=>p.id===lobby.auction.order[lobby.auction.actorIndex]),'action','明拍出价与实付区间');
const first=lobby.players.find(p=>p.id===lobby.auction.order[lobby.auction.actorIndex]);
act(lobby,first,{kind:'bid',amount:Math.max(5,lobby.auction.card.base/2)});
while(lobby.phase==='open'){
 const current=lobby.players.find(p=>p.id===lobby.auction.order[lobby.auction.actorIndex]);
 act(lobby,current,{kind:'pass'});
}
save('05-settlement',lobby,first,'action','落槌后的结算单与下一张出售窗口');
save('05b-sale-confirm',lobby,first,'action','卖给拍卖行前的金额确认弹窗');
auction(lobby);
save('06-sealed',lobby,lobby.players.find(p=>lobby.auction.bidders.includes(p.id)),'action','暗拍密封报价');
for(const p of [...lobby.players])act(lobby,p,{kind:'sealedBid',amount:10});
save('07-tie',lobby,lobby.players[0],'action','最高价并列后的重拍');
for(const pid of [...lobby.auction.bidders])act(lobby,lobby.players.find(p=>p.id===pid),{kind:'sealedBid',amount:0});
save('08-request',lobby,host,'action','两张正式拍卖结束后发起求购');
const seller=lobby.players.find(p=>p.id!==host.id);
const other=lobby.players.find(p=>p.id!==host.id&&p.id!==seller.id);
const wanted=lobby.deck.find(c=>!c.red)||deckFor(lobby.eras).find(c=>!c.red);
lobby.deck=lobby.deck.filter(c=>c.id!==wanted.id);
seller.hand.push(wanted);
act(lobby,host,{kind:'request',wanted:wanted.name,coins:12});
save('09-request-response',lobby,seller,'action','持卡人回应求购与红卡税预览');
act(lobby,seller,{kind:'respondRequest',card:wanted.id});
act(lobby,other,{kind:'respondRequest'});
save('10-request-choice',lobby,host,'action','起始玩家选择求购对象或放弃');
act(lobby,host,{kind:'chooseRequest'});
const own=lobby.deck.find(c=>c.id!==wanted.id)||deckFor(lobby.eras).find(c=>c.id!==wanted.id);
lobby.deck=lobby.deck.filter(c=>c.id!==own.id);
host.hand.push(own);
save('11-free-trade',lobby,host,'action','自由交易填写卡牌与双向金币');
act(lobby,host,{kind:'freeTrade',card:own.id,target:seller.id,wanted:wanted.name,fromCoins:3,toCoins:5});
save('12-trade-response',lobby,seller,'action','对方同意或拒绝自由交易');
act(lobby,seller,{kind:'respondTrade',accept:false});
save('13-collection',lobby,host,'collection','个人藏品、时代估值与套组缺口');
save('14-turn-end',lobby,host,'action','本轮结束与轮换');
save('15-info',lobby,host,'info','房间信息、超时偏好、拍卖记录');
const complete=makeGame();startGame(complete,complete.players[0]);
for(const p of complete.players)p.autoPilot=true;
advanceBots(complete);
if(complete.phase!=='finished')throw Error(`演示局未结束：${complete.phase}`);
save('16-finished',complete,complete.players[0],'action','6 轮后的终局排名与逐时代计分');

const map={
 '/':'web/index.html','/app.js':'web/app.js','/style.css':'web/style.css','/cloud-config.js':'web/cloud-config.js',
 '/card-assets.js':'cloud-site/card-assets.js','/favicon.svg':'web/favicon.svg',
 '/manual.html':'web/manual.html','/auction-flow-v2-revised.png':'web/auction-flow-v2-revised.png',
};
const mime=file=>file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.jpg')?'image/jpeg':'text/html';
const manifest=[];
const tracked=['web/game.js','web/app.js','web/style.css','web/catalog.js','web/index.html','cloud-site/card-assets.js'];
const sha=file=>createHash('sha256').update(readFileSync(join(root,file))).digest('hex');
try{
 for(const shot of shots){
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),path=url.pathname;
   if(path===`/api/room/${room}`)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(shot.state)});
   let rel=map[path];
   if(path.startsWith('/assets/'))rel=join('cloud-site',path.slice(1));
   if(!rel)return route.fulfill({status:404,body:'Not found'});
   const file=join(root,rel);
   try{return route.fulfill({status:200,contentType:mime(file),body:readFileSync(file)});}catch{return route.fulfill({status:404,body:'Missing asset'});}
  });
  await page.goto(`http://product-spec.local/?room=${room}`,{waitUntil:'domcontentloaded'});
  await page.locator('.game-shell').waitFor();
  if(shot.view!=='table')await page.locator(`[data-view="${shot.view}"]`).last().click();
  if(shot.name==='02-select')await page.locator('[data-position="1"]').click();
  if(shot.name==='04-open'){
   const bid=page.locator('#bid'),base=Number(await bid.inputValue());
   await page.locator('[data-bid-step="5"]').click();
   if(Number(await bid.inputValue())!==base+5)throw Error('明拍 +5 快捷加价没有更新报价');
  }
  if(shot.name==='09-request-response')await page.locator('#requestCard').selectOption(wanted.id);
  if(shot.name==='10-request-choice')await page.locator('#requestTarget').selectOption(seller.id);
  if(shot.name==='11-free-trade'){
   await page.locator('#freeWanted').fill(wanted.name);
   await page.locator('#fromCoins').fill('3');
   await page.locator('#toCoins').fill('5');
  }
  if(shot.name==='16-finished')await page.locator('.ranking details').first().locator('summary').click();
  if(shot.name==='05b-sale-confirm'){
   await page.locator('[data-act="bankSell"]').click();
   if(!await page.locator('#bankSellConfirm').isVisible())throw Error('出售确认弹窗未打开');
  }
  await page.locator('img').evaluateAll(images=>images.forEach(img=>{img.loading='eager';}));
  await page.waitForFunction(()=>[...document.querySelectorAll('img')].every(img=>img.complete),{timeout:10000}).catch(()=>{});
  await page.screenshot({path:join(out,`${shot.name}.png`),animations:'disabled'});
  manifest.push({name:shot.name,caption:shot.caption,phase:shot.phase,turn:shot.turn,file:`product-spec-assets/${shot.name}.png`});
  await page.close();
 }
}finally{await browser.close();}
writeFileSync(join(out,'manifest.json'),JSON.stringify({sourceHashes:Object.fromEntries(tracked.map(file=>[file,sha(file)])),shots:manifest},null,2)+'\n');
console.log(`Captured ${manifest.length} current-UI screenshots in ${out}`);
