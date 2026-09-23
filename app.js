const main=document.querySelector('#main'),toast=document.querySelector('#toast');
const dialog=document.querySelector('#rules');
document.querySelector('#rulesBtn').onclick=()=>dialog.showModal();
document.querySelector('#closeRules').onclick=()=>dialog.close();
let room=new URLSearchParams(location.search).get('room')?.toUpperCase()||'',state=null,selected={open:'',sealed:''};
const cloud=window.GAME_CLOUD_CONFIG;
if(cloud&&location.hash&&/(?:access_token|refresh_token|type=signup)/.test(location.hash))history.replaceState({},'',location.pathname+location.search);
let session=null;
if(cloud){try{session=JSON.parse(localStorage.getItem('treasure:session')||'null');}catch{localStorage.removeItem('treasure:session');}}
let refreshPromise=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>localStorage.getItem('treasure:'+room)||'';
function notice(s){toast.textContent=s;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3500);}
function saveSession(value){session=value; if(cloud){if(value)localStorage.setItem('treasure:session',JSON.stringify(value));else localStorage.removeItem('treasure:session');} renderAccount();}
async function auth(path,data){
 const r=await fetch(`${cloud.url}/auth/v1/${path}`,{method:'POST',headers:{apikey:cloud.key,'Content-Type':'application/json'},body:JSON.stringify(data)});
 const x=await r.json();if(!r.ok)throw Error(x.msg||x.error_description||x.message||'账户操作失败');return x;
}
async function ensureSession(){
 if(!cloud||!session)return session;
 if(session.expiresAt>Date.now()+60000)return session;
 if(!refreshPromise)refreshPromise=auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(x=>{
  saveSession({access_token:x.access_token,refresh_token:x.refresh_token,expiresAt:Date.now()+x.expires_in*1000,email:x.user?.email||session.email});return session;
 }).catch(()=>{saveSession(null);return null;}).finally(()=>{refreshPromise=null;});
 return refreshPromise;
}
function authForms(){return `<div class="home-grid auth-grid"><form id="signup" class="panel"><h2>注册玩家账号</h2><label>邮箱<input type="email" name="email" required autocomplete="email"></label><label>密码<input type="password" name="password" required minlength="6" autocomplete="new-password"></label><button class="primary">注册</button><p class="hint">如收到验证邮件，请先点击邮件中的链接。</p></form><form id="login" class="panel"><h2>已有账号登录</h2><label>邮箱<input type="email" name="email" required autocomplete="email"></label><label>密码<input type="password" name="password" required autocomplete="current-password"></label><button>登录</button></form></div>`;}
function renderAccount(){const el=document.querySelector('#account');if(!cloud){el.textContent='本地游戏';return;}el.innerHTML=session?`<span class="account-email">${esc(session.email)}</span> <button id="logout" class="ghost">退出</button>`:'<span class="account-email">云端对战 · 请登录</span>';}
async function api(path,data){
 const s=await ensureSession();
 const target=cloud?`${cloud.url}/functions/v1/game${path}`:path;
 const headers=data?{'Content-Type':'application/json'}:{};
 if(cloud){headers.apikey=cloud.key;if(s)headers.Authorization=`Bearer ${s.access_token}`;}
 const r=await fetch(target,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined});
 const x=await r.json();if(!r.ok)throw Error(x.error||'请求失败');return x;
}
async function refresh(){if(!room){render();return;}try{const editing=main.contains(document.activeElement)&&['INPUT','SELECT'].includes(document.activeElement.tagName),previous=state?.phase;state=await api(`/api/room/${room}${cloud?'':`?token=${encodeURIComponent(token())}`}`);if(!editing||state.phase!==previous)render();}catch(e){state=null;main.innerHTML=`<section class="panel narrow"><h1>房间暂时不可用</h1><p>${esc(e.message)}</p><a href="./">返回首页</a></section>`;}}
async function send(data){try{state=await api(`/api/room/${room}/act`,cloud?data:{...data,token:token()});selected={open:'',sealed:''};render();}catch(e){notice(e.message);}}
const who=id=>state?.players.find(p=>p.id===id)?.name||'藏家';
const stars=n=>'★'.repeat(n);
function card(c,extra=''){return `<div class="card ${c.red?'red':''} ${extra}" data-card="${esc(c.id)}"><div class="card-top"><span>${esc(c.era)}</span><span>${stars(c.star)}</span></div><div class="card-mark">${esc(c.era.slice(0,1))}</div><strong>${esc(c.name)}</strong><div class="card-foot"><span>${c.red?'传奇 · 红卡':'藏品'}</span><b>${c.base} 金</b></div><small class="card-id">编号 ${esc(c.id)}</small></div>`;}
function button(label,action,cls=''){return `<button class="${cls}" data-act="${action}">${label}</button>`;}
function phaseName(phase){return ({lobby:'等待入席',select:'主持人选品',open:'明拍竞价',sealed:'暗拍报价','secondary-choice':'二次交易','swap-response':'等待换卡回应',sell:'出售藏品','turn-end':'本回合结束',finished:'终局结算'})[phase]||phase;}
function renderHome(){renderAccount();main.innerHTML=`<section class="welcome"><div class="eyebrow">一场关于眼光与取舍的拍卖</div><h1>千年藏珍</h1><p>可与朋友联机，也可添加机器人独自开局。竞拍九大时代的藏品，凑齐套组，警惕红卡。</p>${cloud&&!session?authForms():''}<div class="home-grid">${!cloud||session?`<form id="create" class="panel"><h2>开启新拍卖</h2><label>你的称呼<input name="name" maxlength="16" placeholder="例如：老王" required></label><button class="primary">创建房间</button></form>`:''}<form id="enter" class="panel"><h2>加入已有房间</h2><label>六位房间码<input name="room" maxlength="6" placeholder="例如：A1B2C3" required></label><button>查看房间</button></form></div><p class="hint">总席位 3–6 位 · 每位主持 3 回合 · 支持单人对战机器人</p></section>`;}
function render(){if(!room){renderHome();return;}if(!state)return;
 renderAccount();
 const me=state.me,host=state.host===me?.id,phase=state.phase;
 const action=renderAction();
 main.innerHTML=`<div class="game-shell"><section class="game-head"><div><div class="eyebrow">房间 ${esc(room)} · ${state.maxTurns?`第 ${state.turn} / ${state.maxTurns} 回合`:'等待开局'}</div><h1>${phaseName(phase)}</h1><p>${phase==='lobby'?'邀请朋友入席，3–6 人即可开局。':phase==='finished'?'所有拍卖已经落槌。':`本回合主持：${esc(who(state.host))}`}</p></div><div class="head-actions">${button('复制房间链接','copy','ghost')}<span class="rate">低星 ${state.rates.low}%<br>高星 ${state.rates.high}%</span></div></section>
 <div class="columns"><div class="main-column"><section class="panel action-panel">${action}</section>${me&&phase!=='lobby'?`<section class="panel"><div class="section-heading"><h2>我的藏品</h2><span>${me.coins} 金 · ${me.hand.length} 张</span></div><div class="card-grid">${me.hand.length?me.hand.map(c=>card(c)).join(''):'<p class="empty">还没有藏品。竞拍或交换来扩充收藏。</p>'}</div></section>`:''}<section class="panel log"><h2>拍卖记录</h2><ol>${state.log.slice().reverse().map(s=>`<li>${esc(s)}</li>`).join('')}</ol></section></div>
 <aside><section class="panel"><h2>藏家席位</h2><div class="players">${state.players.map((p,i)=>`<div class="player"><div class="avatar">${p.isBot?'机':i+1}</div><div><strong>${esc(p.name)} ${p.id===state.host&&phase!=='lobby'?'✦':''}</strong><small>${p.isBot?'自动藏家 · ':''}${p.count} 张藏品 ${p.banned&&phase!=='lobby'?'· 本回合禁拍':''}</small>${p.reds.map(c=>`<small class="red-label">${esc(c.name)}</small>`).join('')}</div><b>${p.coins} 金</b></div>`).join('')}</div></section>${state.eras.length?`<section class="panel"><h2>本局时代</h2><div class="era-tags">${state.eras.map(e=>`<span>${esc(e)}</span>`).join('')}</div></section>`:''}<section class="panel mini-rules"><h2>计分提示</h2><p>金币 + 藏品估值 × 套组加成 − 红卡惩罚。</p><p>集齐同一时代 1、2、3 星：×1.5；再有红卡：×2。</p></section></aside></div></div>`;
}
function renderAction(){const s=state,m=s.me,h=s.host===m?.id,a=s.auction;
 if(s.phase==='lobby'){
  const humans=s.players.filter(p=>!p.isBot).length,bots=s.players.length-humans;
  return `<h2>等待藏家入席</h2><p>邀请朋友，或添加机器人。总席位达到 3 位即可开局；只有真人能操作自己的席位。</p>${m?`<div class="callout">你已入席：${esc(m.name)}。当前 ${humans} 位真人、${bots} 位机器人，共 ${s.players.length}/6 席。</div>${m.id===s.owner?`<div class="bot-setup"><label>机器人数量<select id="botCount">${Array.from({length:7-humans},(_,n)=>`<option value="${n}" ${n===bots?'selected':''}>${n} 位</option>`).join('')}</select></label>${button('更新机器人','setBots')}</div><p class="hint">独自玩时选择至少 2 位机器人，再点击开始游戏。</p>${button('开始游戏','start','primary')}`:''}`:s.players.length>=6?'<div class="callout">房间已满，可以旁观。房主可减少机器人席位。</div>':cloud&&!session?`<p>注册或登录后可加入房间。</p>${authForms()}`:`<form id="join"><label>你的称呼<input name="name" maxlength="16" required placeholder="输入称呼"></label><button class="primary">加入房间</button></form>`}`;
 }
 if(s.phase==='finished')return `<h2>终局榜单</h2><p>隐藏红卡：${esc(s.hiddenRed?.name)}。总分最高者获胜；同分先比金币、再比完整套数。</p><div class="ranking">${s.winner.map((p,i)=>`<div><b>${i+1}. ${esc(p.name)}</b><strong>${p.total} 分</strong><small>金币 ${p.coins} + 藏品 ${p.value} − 惩罚 ${p.penalty}</small></div>`).join('')}</div>`;
 if(!m)return `<h2>正在旁观</h2><p>你可以看到公开局面。游戏已开始，无法中途加入。</p>`;
 if(s.phase==='select')return h?`<h2>选出两件藏品</h2><p>先点明拍，再点暗拍。不同星级优先；若五张全同星，可选任意两张。</p><div class="selection-line"><span>明拍：${esc(s.selection.find(c=>c.id===selected.open)?.name||'未选择')}</span><span>暗拍：${esc(s.selection.find(c=>c.id===selected.sealed)?.name||'未选择')}</span></div><div class="card-grid select-grid">${s.selection.map(c=>card(c,selected.open===c.id?'chosen-open':selected.sealed===c.id?'chosen-sealed':'')).join('')}</div>${button('确认上拍','choose','primary')}`:`<h2>主持人正在选品</h2><p>请稍候。你可以查看自己的藏品，为竞拍准备预算。</p>`;
 if(s.phase==='open')return `<h2>明拍 · ${esc(a.card.name)}</h2><div class="auction-preview">${card(a.card)}<div><p>起拍价 <b>${Math.max(5,a.card.base/2)} 金</b></p><p>当前最高 <b>${a.highest?.amount??'暂无'} ${a.highest?'金':''}</b></p><p>每次加价至少 2 金。依次出价或退出，退出后不可返回。</p></div></div>${a.actor===m.id?`<div class="controls"><input id="bid" type="number" inputmode="numeric" min="${a.highest?a.highest.amount+2:Math.max(5,a.card.base/2)}" max="${m.coins}" value="${a.highest?a.highest.amount+2:Math.max(5,a.card.base/2)}"><button class="primary" data-act="bid">出价</button>${button('放弃','pass')}</div>`:`<div class="callout">${a.bidders.includes(m.id)?`等待 ${esc(who(a.actor))} 行动。`:'你本场不能竞拍。'}</div>`}`;
 if(s.phase==='sealed')return `<h2>暗拍 · ${esc(a.card.name)}</h2><div class="auction-preview">${card(a.card)}<div><p>秘密填写报价，0 表示放弃。</p><p>有效报价至少 ${Math.max(5,a.card.base/2)} 金；同价按入席顺序决定。</p><p>已提交 ${a.submitted.length}/${a.bidders.length} 人。</p></div></div>${a.bidders.includes(m.id)&&!a.submitted.includes(m.id)?`<div class="controls"><input id="sealedBid" type="number" inputmode="numeric" min="0" max="${m.coins}" value="0">${button('提交密封报价','sealedBid','primary')}</div>`:`<div class="callout">${a.submitted.includes(m.id)?'报价已密封，等待其他玩家。':'你本场不能竞拍。'}</div>`}`;
 if(s.phase==='secondary-choice')return h?`<h2>二次交易</h2><p>可跳过、提出一次换卡，或拿自己一张藏品举行二次暗拍。二次拍卖所得货款归你，佣金归拍卖行。</p>${m.hand.length?`<label>我的藏品<select id="ownCard">${m.hand.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${c.star} 星</option>`).join('')}</select></label><div class="controls">${button('二次暗拍','secondaryAuction','primary')}</div><div class="swap-controls"><label>换卡对象<select id="swapPlayer">${s.players.filter(p=>p.id!==m.id).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><label>对方藏品编号<input id="targetCard" placeholder="让对方从自己的卡上读出编号"></label>${button('提出换卡','secondarySwap')}</div>`:''}${button('跳过二次交易','secondarySkip','ghost')}`:`<h2>主持人正在安排二次交易</h2><p>随后轮到其他藏家决定是否出售藏品。</p>`;
 if(s.phase==='swap-response')return s.swap?.to===m.id?`<h2>有人向你提出换卡</h2><p>${esc(who(s.swap.from))} 希望用「${esc(s.swap.own?.name)}」换你的「${esc(s.swap.target?.name)}」。</p><div class="controls">${button('同意交换','swapYes','primary')}${button('拒绝','swapNo')}</div>`:`<h2>等待换卡回应</h2><p>对方有权拒绝。</p>`;
 if(s.phase==='sell')return m.id===s.host?`<h2>等待其他藏家出售</h2><p>非主持玩家各可向拍卖行出售最多一张牌。</p>`:s.sold[m.id]?`<h2>本回合已决定</h2><p>请等待其他藏家。</p>`:`<h2>向拍卖行出售</h2><p>自愿出售最多一张。1–2 星按低星倍率，3–4 星按高星倍率；出售卡进入流拍区。</p>${m.hand.length?`<label>选择藏品<select id="sellCard">${m.hand.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${c.base} 金基础价</option>`).join('')}</select></label>${button('确认出售','sell','primary')}`:''}${button('保留全部藏品','sellSkip','ghost')}`;
 if(s.phase==='turn-end')return h?`<h2>回合结束</h2><p>全部交易完成。进入下一位主持人的回合。</p>${button('下一回合','next','primary')}`:`<h2>回合结束</h2><p>等待主持人开启下一回合。</p>`;
 return '';
}
main.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;if(f.id==='signup'||f.id==='login'){
  if(!cloud)return;const data=Object.fromEntries(new FormData(f));
  try{if(f.id==='signup'){
   const x=await auth(`signup?redirect_to=${encodeURIComponent(location.origin+location.pathname)}`,data);
   if(x.access_token&&x.refresh_token){
    saveSession({access_token:x.access_token,refresh_token:x.refresh_token,expiresAt:Date.now()+x.expires_in*1000,email:x.user?.email||data.email});
    notice('注册成功，已登录');await refresh();
   }else notice('注册申请已提交；收到验证邮件后请点击链接再登录');
  }else{
   const x=await auth('token?grant_type=password',data);
   saveSession({access_token:x.access_token,refresh_token:x.refresh_token,expiresAt:Date.now()+x.expires_in*1000,email:x.user?.email||data.email});
   await refresh();
  }}catch(e){notice(e.message);}return;
 }
 if(f.id==='create'){try{const x=await api('/api/create',{name:new FormData(f).get('name')});room=x.room;if(!cloud)localStorage.setItem('treasure:'+room,x.token);history.pushState({},'',`?room=${room}`);await refresh();}catch(e){notice(e.message);}}
 if(f.id==='enter'){room=String(new FormData(f).get('room')).toUpperCase();history.pushState({},'',`?room=${room}`);await refresh();}
 if(f.id==='join'){try{const x=await api(`/api/room/${room}/join`,{name:new FormData(f).get('name')});if(!cloud)localStorage.setItem('treasure:'+room,x.token);await refresh();}catch(e){notice(e.message);}}});
main.addEventListener('click',async e=>{
 const c=e.target.closest('.select-grid .card');if(c){if(!selected.open)selected.open=c.dataset.card;else if(!selected.sealed&&c.dataset.card!==selected.open)selected.sealed=c.dataset.card;else if(c.dataset.card===selected.open){selected.open=selected.sealed;selected.sealed='';}else selected.sealed=c.dataset.card;render();return;}
 const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
 if(a==='copy'){try{const link=new URL(location.href);link.hash='';await navigator.clipboard.writeText(link.toString());notice('房间链接已复制');}catch{notice('请复制浏览器地址栏里的链接');}return;}
 if(a==='start')return send({kind:'start'});
 if(a==='setBots')return send({kind:'setBots',count:Number(document.querySelector('#botCount').value)});
 if(a==='choose')return send({kind:'choose',open:selected.open,sealed:selected.sealed});
 if(a==='bid')return send({kind:'bid',amount:Number(document.querySelector('#bid').value)});
 if(a==='pass')return send({kind:'pass'});
 if(a==='sealedBid')return send({kind:'sealedBid',amount:Number(document.querySelector('#sealedBid').value)});
 if(a==='secondarySkip')return send({kind:'secondary',mode:'skip'});
 if(a==='secondaryAuction')return send({kind:'secondary',mode:'auction',card:document.querySelector('#ownCard').value});
 if(a==='secondarySwap')return send({kind:'secondary',mode:'swap',card:document.querySelector('#ownCard').value,target:document.querySelector('#swapPlayer').value,targetCard:document.querySelector('#targetCard').value.trim()});
 if(a==='swapYes'||a==='swapNo')return send({kind:'swapResponse',accept:a==='swapYes'});
 if(a==='sell')return send({kind:'sell',card:document.querySelector('#sellCard').value});
 if(a==='sellSkip')return send({kind:'sell'});
 if(a==='next')return send({kind:'next'});
});
document.querySelector('#account').addEventListener('click',e=>{if(e.target.id==='logout'){saveSession(null);refresh();}});
setInterval(()=>{if(room&&document.visibilityState==='visible')refresh();},cloud?4000:1800);
window.addEventListener('popstate',()=>{room=new URLSearchParams(location.search).get('room')?.toUpperCase()||'';refresh();});
refresh();
