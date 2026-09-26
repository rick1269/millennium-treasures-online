import { randomBytes } from 'node:crypto';
import { ERAS, deckFor } from './catalog.js';

const fail = message => { throw new Error(message); };
const die = rng => 1 + Math.floor(rng() * 6);
const shuffle = (cards, rng) => { const a = [...cards]; for (let i=a.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const id = () => randomBytes(4).toString('hex');
const name = value => String(value||'').trim().replace(/[<>]/g,'').slice(0,16)||'藏家';
const note = (g,message) => { g.log.push(message); if(g.log.length>120)g.log.shift(); };
const host = g => g.players[g.host];
const player = (g,pid) => g.players.find(p=>p.id===pid);
const member = (g,pid) => [...g.players,...(g.spectators||[])].find(p=>p.id===pid);
const seated = (g,pid) => g.players.some(p=>p.id===pid);
const avatar = value => ['🦊','🐼','🐯','🐱','🐻','🐰','🦁','🐨','🐸','🐵','🐺','🦉'].includes(value)?value:'🦊';
const card = (p,cid) => p.hand.find(c=>c.id===cid);
const take = (p,cid) => {const i=p.hand.findIndex(c=>c.id===cid);if(i<0)fail('你没有这张卡');return p.hand.splice(i,1)[0];};
const validCoins = n => Number.isSafeInteger(n)&&n>=0;
const has123 = (hand,era) => [1,2,3].every(star=>hand.some(c=>c.era===era&&c.star===star));
const rate = (g,c) => Math.max(0,100+(g.rates[c.star]||0));
const bankPrice = (g,c) => Math.floor(c.base*rate(g,c)/100);
const redCount = p => p.hand.filter(c=>c.red).length;
const taxRate = p => redCount(p)===0?0:redCount(p)===1?0.5:1;
const idleLimitMs=90000;

export function createGame(rawName,rng=Math.random,rawAvatar){
 const p={id:id(),token:randomBytes(24).toString('hex'),name:name(rawName),avatar:avatar(rawAvatar),seat:0,coins:150,hand:[],banRemaining:0};
 return {version:2,id:randomBytes(3).toString('hex').toUpperCase(),players:[p],spectators:[],chat:[],owner:p.id,phase:'lobby',turn:0,maxTurns:0,host:0,direction:null,deck:[],discard:[],bank:[],hiddenRed:null,eras:[],rates:{1:0,2:0,3:0,4:0},selection:[],blind:null,blindPosition:null,firstMode:null,lotIndex:0,auction:null,lastSettlement:null,ready:{},trade:null,log:['房间已创建。'],winner:null,rng};
}
export function joinGame(g,rawName,{spectate=false,avatar:rawAvatar}={}){
 g.spectators??=[];g.chat??=[];
 const n=name(rawName);if([...g.players,...g.spectators].some(p=>p.name===n))fail('房间内已有这个称呼，请换一个');
 if(g.players.length+g.spectators.length>=24)fail('房间人数已达上限');
 const p={id:id(),token:randomBytes(24).toString('hex'),name:n,avatar:avatar(rawAvatar),seat:null,coins:150,hand:[],banRemaining:0};
 if(spectate||g.phase!=='lobby'){g.spectators.push(p);note(g,`${n} 进入房间旁观。`);}
 else{const taken=new Set(g.players.map(x=>x.seat));const seat=[0,1,2,3,4,5].find(x=>!taken.has(x));if(seat===undefined)fail('座位已满');p.seat=seat;g.players.push(p);g.players.sort((a,b)=>a.seat-b.seat);note(g,`${n} 在 ${seat+1} 号位入席。`);}
 return p;
}
export const playerByToken=(g,token)=>[...g.players,...(g.spectators||[])].find(p=>!p.isBot&&p.token===token);
export function normalizeRoom(g){
 g.spectators??=[];g.chat??=[];
 g.players.forEach((p,i)=>{if(!Number.isInteger(p.seat))p.seat=i;p.avatar??=p.isBot?'🤖':'🦊';});
 g.players.sort((a,b)=>a.seat-b.seat);
 return g;
}
function sit(g,p,seat){
 if(g.phase!=='lobby')fail('开局后不能再入席');
 if(!Number.isInteger(seat)||seat<0||seat>5)fail('请选择 1 至 6 号座位');
 if(g.players.some(x=>x.seat===seat))fail('这个座位已有人');
 if(seated(g,p.id))fail('你已经入席');
 const index=g.spectators.findIndex(x=>x.id===p.id);if(index<0)fail('请先加入房间');
 g.spectators.splice(index,1);p.seat=seat;g.players.push(p);g.players.sort((a,b)=>a.seat-b.seat);note(g,`${p.name} 在 ${seat+1} 号位入席。`);
}
function stand(g,p){
 if(g.phase!=='lobby'||!seated(g,p.id))fail('当前不能离开座位');
 g.players.splice(g.players.findIndex(x=>x.id===p.id),1);p.seat=null;g.spectators.push(p);note(g,`${p.name} 离开座位，改为旁观。`);
}
function setSeatBot(g,p,seat){
 if(g.phase!=='lobby'||p.id!==g.owner)fail('只有房主能安排机器人');
 if(!Number.isInteger(seat)||seat<0||seat>5)fail('座位无效');
 const occupant=g.players.find(x=>x.seat===seat);
 if(occupant){if(!occupant.isBot)fail('不能替换真人座位');g.players.splice(g.players.indexOf(occupant),1);note(g,`房主移除了 ${seat+1} 号位机器人。`);return;}
 let i=1;while([...g.players,...g.spectators].some(x=>x.name===`机器人 ${i}`))i++;
 g.players.push({id:id(),name:`机器人 ${i}`,avatar:'🤖',seat,isBot:true,coins:150,hand:[],banRemaining:0});g.players.sort((a,b)=>a.seat-b.seat);note(g,`房主安排机器人坐在 ${seat+1} 号位。`);
}
function setBots(g,p,count){
 if(g.phase!=='lobby'||p.id!==g.owner)fail('只有房主能在开局前设置机器人');
 const humans=g.players.filter(x=>!x.isBot).length;
 if(!Number.isSafeInteger(count)||count<0||count>6-humans)fail(`机器人数量须为 0 至 ${6-humans}`);
 while(g.players.filter(x=>x.isBot).length<count){let i=1;while(g.players.some(x=>x.name===`机器人 ${i}`))i++;const seat=[0,1,2,3,4,5].find(x=>!g.players.some(p=>p.seat===x));g.players.push({id:id(),token:randomBytes(24).toString('hex'),name:`机器人 ${i}`,avatar:'🤖',seat,isBot:true,coins:150,hand:[],banRemaining:0});}
 while(g.players.filter(x=>x.isBot).length>count)g.players.splice(g.players.findLastIndex(x=>x.isBot),1);
 g.players.sort((a,b)=>a.seat-b.seat);
 note(g,`机器人数量设为 ${count}。`);
}
function firstHost(g){
 let candidates=g.players.map((_,i)=>i),round=0;
 while(candidates.length>1){const rolls=candidates.map(i=>({i,roll:die(g.rng)}));const high=Math.max(...rolls.map(x=>x.roll));note(g,`首位起始玩家掷骰${round?'重投':''}：${rolls.map(x=>`${g.players[x.i].name} ${x.roll}点`).join('、')}。`);candidates=rolls.filter(x=>x.roll===high).map(x=>x.i);round++;}
 return candidates[0];
}
function replenish(g){if(!g.deck.length&&g.discard.length){g.deck=shuffle(g.discard,g.rng);g.discard=[];note(g,'主牌堆已空，流拍区洗回。');}}
function draw(g,count){const cards=[];for(let i=0;i<count;i++){replenish(g);if(!g.deck.length)break;cards.push(g.deck.pop());}return cards;}
function income(g){for(const p of g.players)for(const c of p.hand.filter(c=>c.red)){const n=p.hand.filter(x=>x.era===c.era).length,amount=n*(has123(p.hand,c.era)?4:2);p.coins+=amount;note(g,`${p.name} 的红卡「${c.name}」产金 ${amount}。`);}}
function updateRates(g){const rolls=[];for(let star=1;star<=4;star++){const d=die(g.rng),add=Math.ceil(d/2)*10;g.rates[star]=Math.min(30,g.rates[star]+add);rolls.push(`${star}星 ${d}点→${rate(g,{star})}%`);}note(g,`拍卖行议价：${rolls.join('，')}。`);}
function beginTurn(g){
 if(g.turn>=g.maxTurns){finish(g);return;}
 if(g.turn>0){g.host=(g.host+g.direction+g.players.length)%g.players.length;for(const p of g.players)p.banRemaining=0;}
 g.selection=draw(g,g.players.length-1);g.blind=null;g.blindPosition=null;g.firstMode=null;g.lotIndex=0;g.auction=null;g.lastSettlement=null;g.trade=null;
 income(g);updateRates(g);g.phase='select';
 note(g,`第 ${g.turn+1}/${g.maxTurns} 轮：${host(g).name} 为起始玩家，抽出 ${g.selection.length} 张背面卡。`);
 if(!g.selection.length)g.phase='turn-end';
}
export function startGame(g,p){
 if(g.phase!=='lobby'||p.id!==g.owner)fail('只有房主可以开局');if(g.players.length<3)fail('至少需要 3 人');
 g.eras=shuffle(ERAS.map(e=>e[0]),g.rng).slice(0,g.players.length);g.deck=shuffle(deckFor(g.eras),g.rng);
 const reds=g.deck.filter(c=>c.red);g.hiddenRed=reds[Math.floor(g.rng()*reds.length)];g.deck=g.deck.filter(c=>c.id!==g.hiddenRed.id);
 g.maxTurns=g.players.length*2;g.host=firstHost(g);note(g,`游戏开始：${g.players.length} 人，${g.maxTurns} 轮；一个时代的红卡已藏起。`);beginTurn(g);
}
function nextLot(g){
 g.auction=null;
 if(g.lotIndex>=g.selection.length){g.phase='trade-request';note(g,'本轮公开拍卖结束，进入私下交易。');return;}
 g.phase='pre-auction';g.ready={};
}
function bidders(g){const list=g.players.filter(p=>p.banRemaining<=0).map(p=>p.id);for(const p of g.players)if(p.banRemaining>0)p.banRemaining--;return list;}
function startAuction(g){
 const c=g.selection[g.lotIndex],type=(g.lotIndex%2===0?g.firstMode:g.firstMode==='open'?'sealed':'open');
 const eligible=bidders(g);g.auction={card:c,type,bidders:eligible,offers:{},passed:[],order:eligible,actorIndex:0,highest:null,tieRound:0,tied:null};
 g.phase=type;note(g,`第 ${g.lotIndex+1} 张翻开：「${c.name}」，${type==='open'?'明拍':'暗拍'}。`);
 if(!eligible.length)settle(g);
}
function bidOrder(g,a){return Object.entries(a.offers).filter(([,v])=>v>0).sort((x,y)=>y[1]-x[1]||g.players.findIndex(p=>p.id===x[0])-g.players.findIndex(p=>p.id===y[0]));}
function settle(g){
 const a=g.auction,ranked=bidOrder(g,a),c=a.card;
 if(a.type==='sealed'&&ranked.length>1&&ranked[0][1]===ranked[1][1]){
  const max=ranked[0][1],tied=ranked.filter(x=>x[1]===max).map(x=>x[0]);
  if(a.tieRound>=3){note(g,`「${c.name}」同价重拍三次仍平局，流拍。`);g.lastSettlement={turn:g.turn+1,lot:g.lotIndex+1,card:c.name,status:'unsold',reason:'最高价同价重拍三次仍平局'};g.discard.push(c);g.selection[g.lotIndex]=null;g.lotIndex++;nextLot(g);return;}
  a.tieRound++;a.tied=tied;a.bidders=tied;a.offers={};note(g,`「${c.name}」最高价并列，${tied.length} 人第 ${a.tieRound} 次重拍。`);return;
 }
 const roll=ranked.length?die(g.rng):null,delta=roll===null?0:(roll<=3?roll:-roll+3)*c.star;
 let bought=false,failed=[],receipt=null;
 for(let i=0;i<Math.min(3,ranked.length);i++){
  const [pid,bid]=ranked[i],p=player(g,pid),gross=Math.max(0,bid+delta);
  const discount=pid===host(g).id&&g.blind===c.id?0.8:1;
  const afterDiscount=Math.ceil(gross*discount);
  const surcharge=c.red?Math.ceil(afterDiscount*taxRate(p)):0;
  const total=afterDiscount+surcharge;
  if(total>p.coins){failed.push(p.name);if(i===0){p.banRemaining=2;note(g,`${p.name} 出价 ${bid}，同骰 ${roll} 点修正后需 ${total} 金，超支禁拍 2 场。`);}else note(g,`${p.name} 顺延接手仍超支。`);continue;}
  p.coins-=total;p.hand.push(c);note(g,`${p.name} 以 ${bid} 金报价获得「${c.name}」；骰 ${roll} 点，修正 ${delta>=0?'+':''}${delta}${discount<1?'，盲标八折':''}${surcharge?`，红卡税 ${surcharge}`:''}，实付 ${total} 金。`);bought=true;receipt={winner:p.name,bid,roll,delta,discount:discount<1,tax:surcharge,total};break;
 }
 if(!bought){g.discard.push(c);note(g,`「${c.name}」流拍，进入流拍区。`);}
 g.lastSettlement={turn:g.turn+1,lot:g.lotIndex+1,card:c.name,status:bought?'sold':'unsold',...receipt,failed,reason:!bought?(ranked.length?'全部报价者超支':'无人出价'):null};
 g.selection[g.lotIndex]=null;g.lotIndex++;nextLot(g);
}
function advanceOpen(g){const a=g.auction,live=a.order.filter(pid=>!a.passed.includes(pid));if(!live.length||(a.highest&&live.length<=1)){settle(g);return;}let i=a.actorIndex;do{i=(i+1)%a.order.length;}while(a.passed.includes(a.order[i]));a.actorIndex=i;}
function transfer(g,from,to,cid,coins){
 if(!cid)return;if(!card(from,cid))fail('交易卡牌已不在手中');
 const c=take(from,cid);to.hand.push(c);
 if(c.red&&coins>0){const tax=Math.ceil(coins*0.2);from.coins-=tax;note(g,`${from.name} 交易红卡，承担 ${tax} 金税款。`);}
}
function deal(g,t){
 const from=player(g,t.from),to=player(g,t.to);
 if(!from||!to||from.id===to.id)fail('交易对象无效');
 if(from.coins<t.fromCoins||to.coins<t.toCoins)fail('交易金币不足');
 if(t.fromCard&&!card(from,t.fromCard))fail('发起者的卡牌已不在手中');
 if(t.toCard&&!card(to,t.toCard))fail('对方的卡牌已不在手中');
 const fromTax=t.fromCard&&card(from,t.fromCard).red?Math.ceil(t.toCoins*0.2):0;
 const toTax=t.toCard&&card(to,t.toCard).red?Math.ceil(t.fromCoins*0.2):0;
 if(from.coins+t.toCoins-t.fromCoins-fromTax<0||to.coins+t.fromCoins-t.toCoins-toTax<0)fail('交易后金币不足以支付红卡税');
 from.coins+=t.toCoins-t.fromCoins;to.coins+=t.fromCoins-t.toCoins;
 transfer(g,from,to,t.fromCard,t.toCoins);transfer(g,to,from,t.toCard,t.fromCoins);
 note(g,`${from.name} 与 ${to.name} 完成私下交易。`);
}
function afterTrade(g){g.trade=null;g.phase='turn-end';note(g,'私下交易结束，本轮完成。');}
export function act(g,p,action){
 if(!p)fail('请先加入房间');const k=String(action.kind||'');
 if(k==='chatText'){
  const message=String(action.text||'').trim();if(!message||message.length>300)fail('文字消息须为 1 至 300 字');
  g.chat??=[];g.chat.push({id:id(),sender:p.id,name:p.name,avatar:p.avatar||'🦊',kind:'text',text:message,at:Date.now()});
  g.chat=g.chat.slice(-50);return;
 }
 if(k==='chatVoice'){
  const audio=String(action.audio||''),mime=String(action.mime||'');
  if(!['audio/webm','audio/mp4','audio/ogg'].includes(mime)||!/^[A-Za-z0-9+/]+={0,2}$/.test(audio)||audio.length>180000||audio.length<100)fail('语音格式无效或超过大小限制');
  const duration=Number(action.duration);if(!Number.isInteger(duration)||duration<1||duration>15)fail('语音时长须为 1 至 15 秒');
  g.chat??=[];g.chat.push({id:id(),sender:p.id,name:p.name,avatar:p.avatar||'🦊',kind:'voice',audio,mime,duration,at:Date.now()});
  g.chat=g.chat.slice(-50);while(g.chat.filter(x=>x.kind==='voice').length>8)g.chat.splice(g.chat.findIndex(x=>x.kind==='voice'),1);return;
 }
 if(k==='setIdleMode'){if(!seated(g,p.id))fail('请先入席');if(!['auto','pass'].includes(action.mode))fail('超时处理方式无效');p.idleMode=action.mode;return;}
 if(k==='resume'){if(!seated(g,p.id)||!p.idlePilot)fail('当前无需接管');p.idlePilot=false;g.idle=null;note(g,`${p.name} 已接管操作。`);return;}
 if(k==='sit'){sit(g,p,Number(action.seat));return;}
 if(k==='stand'){stand(g,p);return;}
 if(k==='setSeatBot'){setSeatBot(g,p,Number(action.seat));return;}
 if(k==='setBots'){setBots(g,p,Number(action.count));return;}
 if(k==='start'){startGame(g,p);return;}
 if(!seated(g,p.id))fail('旁观者不能操作拍卖，开局前可点击空座位入席');
 if(g.phase==='lobby'||g.phase==='finished')fail('当前不能操作');
 if(g.phase==='select'&&k==='choose'){
  if(p.id!==host(g).id)fail('只有起始玩家可以盲标和定序');
  const pos=Number(action.position);if(!Number.isInteger(pos)||pos<0||pos>=g.selection.length)fail('盲标位置无效');
  if(!['open','sealed'].includes(action.mode))fail('请选择第一张的拍卖模式');
  if(g.direction===null){if(![1,-1].includes(Number(action.direction)))fail('请选择轮换方向');g.direction=Number(action.direction);}
  const [favorite]=g.selection.splice(pos,1);g.selection.unshift(favorite);
  g.blind=favorite.id;g.blindPosition=0;g.firstMode=action.mode;note(g,`${p.name} 盲标原第 ${pos+1} 张并移至首拍；第一张${action.mode==='open'?'明拍':'暗拍'}；方向${g.direction===1?'顺时针':'逆时针'}。`);
  nextLot(g);return;
 }
 if(g.phase==='trade-request'&&k==='request'){
  if(p.id!==host(g).id)fail('只有起始玩家可以求购');
  const wanted=String(action.wanted||'').trim().slice(0,40),offer=Number(action.coins);
  if(!wanted||!validCoins(offer)||offer>p.coins)fail('请填写卡名和可支付金币');
  g.trade={kind:'request',wanted,coins:offer,from:p.id};g.phase='request-response';note(g,`${p.name} 求购「${wanted}」，报价 ${offer} 金。`);return;
 }
 if(g.phase==='trade-request'&&k==='skipRequest'){if(p.id!==host(g).id)fail('只有起始玩家可以跳过求购');g.phase='trade-free';return;}
 if(g.phase==='request-response'&&k==='respondRequest'){
  if(p.id===host(g).id||g.trade.responses?.[p.id])fail('不能重复回应');
  const c=action.card?card(p,action.card):null;
  if(c&&c.name!==g.trade.wanted)fail('卡名与求购需求不符');
  g.trade.responses??={};g.trade.responses[p.id]=c?.id||null;
  if(g.players.filter(x=>x.id!==host(g).id).every(x=>Object.hasOwn(g.trade.responses,x.id)))g.phase='request-choice';return;
 }
 if(g.phase==='request-choice'&&k==='chooseRequest'){
  if(p.id!==host(g).id)fail('只有起始玩家可以决定求购');
  const cid=g.trade.responses?.[action.target];
  if(action.target&&cid){const seller=player(g,action.target),price=g.trade.coins;if(p.coins<price)fail('金币不足');deal(g,{from:p.id,to:seller.id,fromCoins:price,toCoins:0,fromCard:null,toCard:cid});afterTrade(g);}else g.phase='trade-free';return;
 }
 if(g.phase==='trade-free'&&k==='freeTrade'){
  if(p.id!==host(g).id)fail('只有起始玩家可以发起自由交易');
  const to=player(g,action.target),own=card(p,action.card),fromCoins=Number(action.fromCoins||0),toCoins=Number(action.toCoins||0),requested=String(action.wanted||'').trim();
  if(!to||to.id===p.id||!own||!validCoins(fromCoins)||!validCoins(toCoins)||fromCoins>p.coins||toCoins>to.coins)fail('自由交易内容无效');
  g.trade={kind:'free',from:p.id,to:to.id,fromCard:own.id,fromCoins,toCoins,wanted:requested};g.phase='trade-response';note(g,`${p.name} 向 ${to.name} 发起自由交易。`);return;
 }
 if(g.phase==='trade-free'&&k==='skipTrade'){if(p.id!==host(g).id)fail('只有起始玩家可以跳过交易');afterTrade(g);return;}
 if(g.phase==='trade-response'&&k==='respondTrade'){
  const t=g.trade;if(p.id!==t.to)fail('只有交易对象可以回应');
  if(action.accept){const requested=String(t.wanted||'');const chosen=action.card?card(p,action.card):null;if(requested&&(!chosen||chosen.name!==requested))fail('请选择符合要求的卡牌');deal(g,{...t,toCard:chosen?.id||null});}else note(g,`${p.name} 拒绝自由交易。`);
  afterTrade(g);return;
 }
 if(g.phase==='pre-auction'&&k==='bankSell'){
  if(g.ready[p.id])fail('你已结束本张卡的出售');
  const c=card(p,action.card);if(!c)fail('请选择自己持有的卡牌');const gross=bankPrice(g,c),tax=c.red?Math.ceil(gross*0.2):0,gain=gross-tax;take(p,c.id);p.coins+=gain;g.bank.push(c);g.rates[c.star]-=10;note(g,`${p.name} 将「${c.name}」卖给拍卖行，成交价 ${gross} 金${tax?`，红卡税 ${tax} 金`:''}，实收 ${gain} 金；${c.star} 星议价降至 ${rate(g,c)}%。`);return;
 }
 if(g.phase==='pre-auction'&&k==='ready'){g.ready[p.id]=true;return;}
 if(g.phase==='pre-auction'&&k==='unready'){delete g.ready[p.id];return;}
 if(g.phase==='pre-auction'&&k==='beginAuction'){if(p.id!==host(g).id)fail('只有起始玩家可以翻牌');if(!g.players.every(x=>g.ready[x.id]))fail('请等待所有玩家结束出售');startAuction(g);return;}
 if(g.phase==='open'&&(k==='bid'||k==='pass')){
  const a=g.auction;if(a.order[a.actorIndex]!==p.id)fail('尚未轮到你');
  if(k==='pass'){a.passed.push(p.id);note(g,`${p.name} 退出明拍。`);}else{
   const amount=Number(action.amount),min=a.highest?a.highest.amount+2:Math.max(5,a.card.base/2);
   if(!Number.isSafeInteger(amount)||amount<min||amount>p.coins)fail(`出价须在 ${min} 至现有金币之间`);
   a.offers[p.id]=amount;a.highest={id:p.id,amount};note(g,`${p.name} 出价 ${amount} 金。`);
  }advanceOpen(g);return;
 }
 if(g.phase==='sealed'&&k==='sealedBid'){
  const a=g.auction;if(!a.bidders.includes(p.id)||Object.hasOwn(a.offers,p.id))fail('不能重复出价');
  const amount=Number(action.amount);if(!Number.isSafeInteger(amount)||amount<0||amount>p.coins)fail('暗拍报价须为 0 至现有金币的整数');
  a.offers[p.id]=amount;note(g,`${p.name} 已提交密封报价。`);
  if(Object.keys(a.offers).length===a.bidders.length)settle(g);return;
 }
 if(g.phase==='turn-end'&&k==='next'){if(p.id!==host(g).id)fail('只有起始玩家可以轮换');g.turn++;beginTurn(g);return;}
 fail('当前阶段不支持此操作');
}
export function scoreByEra(p){
 return ERAS.map(([era])=>{
  const cards=p.hand.filter(c=>c.era===era);if(!cards.length)return null;
  const stars=[1,2,3].filter(star=>cards.some(c=>c.star===star));
  const red=cards.some(c=>c.red),complete=stars.length===3,factor=complete?(red?2:1.5):1;
  const base=cards.reduce((sum,c)=>sum+c.base,0),value=base*factor;
  const penalty=red&&!complete?cards.filter(c=>c.red).reduce((sum,c)=>sum+c.base,0):0;
  return {era,stars,red,base,factor,value,penalty,net:value-penalty};
 }).filter(Boolean);
}
export function score(p){
 let value=0,penalty=0,full=0;
 for(const part of scoreByEra(p)){
  value+=part.value;penalty+=part.penalty;if(part.red&&part.factor===2)full++;
 }
 return {coins:p.coins,value,penalty,total:p.coins+value-penalty,full};
}
function botBidCap(p,c){const own=p.hand.filter(x=>x.era===c.era),missing=!own.some(x=>x.star===c.star);return Math.max(0,Math.min(p.coins-c.star*3,c.base+(missing?10:0)+(c.red&&has123(p.hand,c.era)?35:0)));}
function botAction(g){
 const controlled=p=>p?.isBot||p?.autoPilot||p?.idlePilot,h=host(g),a=g.auction;
 if(g.phase==='select'&&controlled(h))return [h,{kind:'choose',position:0,mode:'open',direction:g.direction??1}];
 if(g.phase==='trade-request'&&controlled(h))return [h,{kind:'skipRequest'}];
 if(g.phase==='request-response'){const p=g.players.find(x=>controlled(x)&&x.id!==h.id&&!Object.hasOwn(g.trade.responses||{},x.id));if(p)return [p,{kind:'respondRequest',card:p.hand.find(c=>c.name===g.trade.wanted)?.id}];}
 if(g.phase==='request-choice'&&controlled(h)){const first=Object.entries(g.trade.responses||{}).find(([,cid])=>cid);return [h,{kind:'chooseRequest',target:first?.[0]}];}
 if(g.phase==='trade-free'&&controlled(h))return [h,{kind:'skipTrade'}];
 if(g.phase==='trade-response'){const p=player(g,g.trade.to);if(controlled(p))return [p,{kind:'respondTrade',accept:false}];}
 if(g.phase==='pre-auction'){const p=g.players.find(x=>controlled(x)&&!g.ready[x.id]);if(p)return [p,{kind:'ready'}];if(controlled(h)&&g.players.every(x=>g.ready[x.id]))return [h,{kind:'beginAuction'}];}
 if(g.phase==='open'){const p=player(g,a.order[a.actorIndex]);if(!controlled(p))return null;const min=a.highest?a.highest.amount+2:Math.max(5,a.card.base/2);return [p,p.idlePilot&&p.idleMode==='pass'?{kind:'pass'}:min<=botBidCap(p,a.card)?{kind:'bid',amount:min}:{kind:'pass'}];}
 if(g.phase==='sealed'){const p=g.players.find(x=>controlled(x)&&a.bidders.includes(x.id)&&!Object.hasOwn(a.offers,x.id));if(p){const cap=botBidCap(p,a.card);return [p,{kind:'sealedBid',amount:p.idlePilot&&p.idleMode==='pass'?0:Math.max(0,Math.min(cap,a.card.base/2+3))}];}}
 if(g.phase==='turn-end'&&controlled(h))return [h,{kind:'next'}];return null;
}
export function advanceBots(g){for(let i=0;i<2000;i++){const next=botAction(g);if(!next)return i;act(g,...next);}fail('机器人决策循环过长');}
function waitingActors(g){
 const h=host(g),a=g.auction;
 switch(g.phase){
  case 'select':case 'trade-request':case 'request-choice':case 'trade-free':case 'turn-end':return [h];
  case 'pre-auction':return g.players.every(p=>g.ready?.[p.id])?[h]:g.players.filter(p=>!g.ready?.[p.id]);
  case 'open':return [player(g,a?.order[a.actorIndex])].filter(Boolean);
  case 'sealed':return g.players.filter(p=>a?.bidders.includes(p.id)&&!Object.hasOwn(a.offers,p.id));
  case 'request-response':return g.players.filter(p=>p.id!==h.id&&!Object.hasOwn(g.trade?.responses||{},p.id));
  case 'trade-response':return [player(g,g.trade?.to)].filter(Boolean);
  default:return [];
 }
}
export function advanceIdle(g,now=Date.now()){
 const waiting=waitingActors(g).filter(p=>!p.isBot&&!p.autoPilot&&!p.idlePilot);
 const key=`${g.turn}:${g.lotIndex}:${g.phase}:${waiting.map(p=>p.id).join(',')}:${g.auction?.highest?.amount??''}:${g.auction?.tieRound??''}`;
 if(!waiting.length){if(!g.idle)return false;g.idle=null;return true;}
 if(g.idle?.key!==key){g.idle={key,deadline:now+idleLimitMs};return true;}
 if(now<g.idle.deadline)return false;
 for(const p of waiting){p.idlePilot=true;note(g,`${p.name} 长时间未操作，机器人开始托管。`);}
 advanceBots(g);
 g.idle=null;
 advanceIdle(g,now);
 return true;
}
function finish(g){g.phase='finished';g.winner=g.players.map(p=>({id:p.id,name:p.name,isGuest:!!p.isGuest,...score(p),byEra:scoreByEra(p)})).sort((a,b)=>b.total-a.total||b.coins-a.coins||b.full-a.full||g.players.findIndex(p=>p.id===a.id)-g.players.findIndex(p=>p.id===b.id));note(g,`游戏结束：${g.winner[0].name} 获胜。隐藏红卡是「${g.hiddenRed.name}」。`);}
export function publicView(g,p){
 const h=host(g),isPlayer=p&&seated(g,p.id);return {id:g.id,version:g.version,phase:g.phase,turn:g.phase==='finished'?g.maxTurns:g.turn+1,maxTurns:g.maxTurns,host:h?.id,owner:g.owner,direction:g.direction,eras:g.eras,rates:g.rates,ready:g.ready,lotIndex:g.lotIndex,lotCount:g.selection.length,blindPosition:g.blindPosition??undefined,
  players:g.players.map(x=>({id:x.id,name:x.name,avatar:x.avatar||'🦊',seat:x.seat,isBot:!!x.isBot,isGuest:!!x.isGuest,autoPilot:!!x.autoPilot,idlePilot:!!x.idlePilot,coins:x.coins,count:x.hand.length,reds:x.hand.filter(c=>c.red),banned:x.banRemaining>0,score:g.phase==='finished'?score(x):undefined,hand:g.phase==='finished'?x.hand:undefined})),
  spectators:(g.spectators||[]).map(x=>({id:x.id,name:x.name,avatar:x.avatar||'🦊',isGuest:!!x.isGuest})),
  chat:(g.chat||[]).map(({id,sender,name,avatar,kind,text,duration,at})=>({id,sender,name,avatar,kind,text,duration,at})),
  me:p?{id:p.id,name:p.name,avatar:p.avatar||'🦊',seat:isPlayer?p.seat:null,isGuest:!!p.isGuest,idlePilot:!!p.idlePilot,idleMode:p.idleMode||'auto',coins:isPlayer?p.coins:null,hand:isPlayer?p.hand:[],score:isPlayer?score(p):null,byEra:isPlayer?scoreByEra(p):[],token:p.token}:null,
  selection:g.phase==='select'?g.selection.map((_,i)=>({position:i+1})):undefined,
  auction:g.auction?{card:g.auction.card,type:g.auction.type,bidders:g.auction.bidders,actor:g.auction.type==='open'?g.auction.order[g.auction.actorIndex]:null,highest:g.auction.highest,passed:g.auction.passed,submitted:Object.keys(g.auction.offers),tieRound:g.auction.tieRound}:null,
  trade:g.trade?{kind:g.trade.kind,wanted:g.trade.wanted,coins:g.trade.coins,from:g.trade.from,to:g.trade.to,fromCard:g.trade.fromCard,fromCardName:player(g,g.trade.from)?.hand.find(c=>c.id===g.trade.fromCard)?.name,fromCardRed:!!player(g,g.trade.from)?.hand.find(c=>c.id===g.trade.fromCard)?.red,fromCoins:g.trade.fromCoins,toCoins:g.trade.toCoins,responses:g.trade.responses?Object.fromEntries(Object.entries(g.trade.responses).map(([pid,cid])=>[pid,!!cid])):undefined}:null,
  idleDeadlineAt:g.idle?.deadline??null,idleActors:g.idle?waitingActors(g).filter(x=>!x.isBot&&!x.autoPilot&&!x.idlePilot).map(x=>x.name):[],lastSettlement:g.lastSettlement,log:g.log.slice(-20),winner:g.winner,hiddenRed:g.phase==='finished'?g.hiddenRed:undefined};
}
export function voiceMessage(g,messageId){return (g.chat||[]).find(x=>x.id===messageId&&x.kind==='voice')||null;}
