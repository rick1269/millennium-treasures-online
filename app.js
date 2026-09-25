const main=document.querySelector('#main'),toast=document.querySelector('#toast');
const dialog=document.querySelector('#rules');
document.querySelector('#rulesBtn').onclick=()=>dialog.showModal();
document.querySelector('#closeRules').onclick=()=>dialog.close();
let room=new URLSearchParams(location.search).get('room')?.toUpperCase()||'',state=null,selectedPosition=0;
const cloud=window.GAME_CLOUD_CONFIG;
const cardAssets=window.GAME_CARD_ASSETS||{version:'v1.0.0',cards:{}};
const clientId=cloud?crypto.randomUUID():'';
const signupRedirect=!!(cloud&&/(?:^|[&#])type=signup(?:&|$)/.test(location.hash));
if(cloud&&location.hash&&/(?:access_token|refresh_token|type=signup)/.test(location.hash))history.replaceState({},'',location.pathname+location.search);
let session=null;
if(cloud){try{session=JSON.parse(localStorage.getItem('treasure:session')||'null');}catch{localStorage.removeItem('treasure:session');}}
let guestMode=!!(cloud&&!session&&sessionStorage.getItem('treasure:guestMode')==='1');
let refreshPromise=null;
let authMode='login',authEmail='',authFeedback=signupRedirect?{type:'success',text:'邮箱验证链接已打开。现在可以用邮箱和密码登录。'}:null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>localStorage.getItem('treasure:'+room)||'';
const guestToken=()=>sessionStorage.getItem('treasure:guest:'+room)||'';
function setGuestMode(value){guestMode=value;sessionStorage.setItem('treasure:guestMode',value?'1':'0');if(room)refresh();else render();}
function notice(s){toast.textContent=s;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3500);}
function saveSession(value){session=value; if(cloud){if(value){guestMode=false;sessionStorage.setItem('treasure:guestMode','0');localStorage.setItem('treasure:session',JSON.stringify(value));}else localStorage.removeItem('treasure:session');} renderAccount();}
async function auth(path,data){
 const r=await fetch(`${cloud.url}/auth/v1/${path}`,{method:'POST',headers:{apikey:cloud.key,'Content-Type':'application/json'},body:JSON.stringify(data)});
 let x;try{x=await r.json();}catch{throw Error('账号服务暂时不可用，请稍后重试。');}if(!r.ok)throw Error(x.msg||x.error_description||x.message||x.error||'账户操作失败');return x;
}
async function ensureSession(){
 if(!cloud||!session)return session;
 if(session.expiresAt>Date.now()+60000)return session;
 if(!refreshPromise)refreshPromise=auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(x=>{
  saveSession({access_token:x.access_token,refresh_token:x.refresh_token,expiresAt:Date.now()+x.expires_in*1000,email:x.user?.email||session.email});return session;
 }).catch(()=>{saveSession(null);return null;}).finally(()=>{refreshPromise=null;});
 return refreshPromise;
}
const eyeIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m4 20 16-16"/></svg>';
function passwordField(id,label,autocomplete){return `<div class="auth-field"><label for="${id}">${label}</label><div class="auth-password"><input id="${id}" type="password" name="${id==='confirmPassword'?'confirmPassword':'password'}" required ${id==='password'&&authMode==='signup'?'minlength="6"':''} autocomplete="${autocomplete}"><button type="button" class="password-toggle" data-toggle-password aria-label="显示${label}" aria-pressed="false" title="显示${label}">${eyeIcon}</button></div></div>`;}
function authForms(){const signup=authMode==='signup';return `<section class="panel auth-panel" aria-label="玩家账号"><div class="auth-switch" aria-label="切换账号操作"><button type="button" data-auth-mode="login" class="${signup?'':'active'}" aria-pressed="${!signup}">登录</button><button type="button" data-auth-mode="signup" class="${signup?'active':''}" aria-pressed="${signup}">注册</button></div><h2>${signup?'创建玩家账号':'登录玩家账号'}</h2><p class="auth-intro">${signup?'注册后按邮件提示验证账号，再回来登录。':'登录后即可创建房间，或加入朋友的拍卖。'}</p><form id="${signup?'signup':'login'}" class="auth-form"><div class="auth-field"><label for="authEmail">邮箱</label><input id="authEmail" type="email" name="email" value="${esc(authEmail)}" required autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="name@example.com"></div>${passwordField('password','密码',signup?'new-password':'current-password')}${signup?`${passwordField('confirmPassword','确认密码','new-password')}<p class="auth-help">密码至少 6 位，建议使用更长且不易猜的组合。</p>`:''}<div class="auth-feedback ${authFeedback?.type||''}" role="${authFeedback?.type==='error'?'alert':'status'}" ${authFeedback?'':'hidden'}>${authFeedback?esc(authFeedback.text):''}</div><button type="submit" class="primary auth-submit">${signup?'注册并发送验证邮件':'登录并继续'}</button></form><div class="guest-entry"><p>想先体验？无需邮箱即可参与。</p><button type="button" class="ghost" data-guest-enter>以游客身份进入</button><small>游客没有账号战绩；关闭浏览器后无法找回席位。房间内仍显示本局结算。</small></div></section>`;}
function setAuthFeedback(text,type='error'){authFeedback=text?{text,type}:null;const el=main.querySelector('.auth-feedback');if(el){el.hidden=!text;el.className=`auth-feedback ${text?type:''}`;el.setAttribute('role',type==='error'?'alert':'status');el.textContent=text||'';}}
function friendlyAuthError(error){const message=String(error?.message||error||'账户操作失败');if(/invalid login credentials/i.test(message))return '邮箱或密码不正确，请检查后重试。';if(/email not confirmed/i.test(message))return '邮箱尚未验证，请先打开验证邮件中的链接。';if(/already registered|user already exists/i.test(message))return '这个邮箱已注册，请切换到登录。';if(/rate limit|too many requests/i.test(message))return '操作过于频繁，请稍后再试。';if(/failed to fetch|network/i.test(message))return '网络连接失败，请检查网络后重试。';return message;}
function renderAccount(){const el=document.querySelector('#account');if(!cloud){el.textContent='本地游戏';return;}el.innerHTML=session?`<span class="account-email">${esc(session.email)}</span> <button id="logout" class="ghost">退出</button>`:guestMode?'<span class="account-email">游客模式</span> <button id="leaveGuest" class="ghost">登录 / 注册</button>':'<span class="account-email">云端对战</span>';}
async function api(path,data){
 const s=await ensureSession();
 const target=cloud?`${cloud.url}/functions/v1/game${path}`:path;
 const headers=data?{'Content-Type':'application/json'}:{};
 if(cloud){headers.apikey=cloud.key;headers['X-Client-Id']=clientId;if(s&&!guestMode)headers.Authorization=`Bearer ${s.access_token}`;else if(room&&guestMode&&guestToken())headers['X-Guest-Token']=guestToken();}
 const r=await fetch(target,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined});
 const x=await r.json();if(!r.ok){const error=Error(x.error||'请求失败');error.status=r.status;throw error;}return x;
}
async function refresh(){if(!room){render();return;}try{const active=document.activeElement,authForm=main.querySelector('.auth-form'),authDraft=!!authForm&&([...authForm.querySelectorAll('input[type="password"]')].some(input=>input.value)||authForm.contains(active)),editing=main.contains(active)&&['INPUT','SELECT'].includes(active.tagName)||authDraft,previous=state?.phase;state=await api(`/api/room/${room}${cloud?'':`?token=${encodeURIComponent(token())}`}`);if(!editing||state.phase!==previous)render();}catch(e){if(e.status===409)return;state=null;main.innerHTML=`<section class="panel narrow"><h1>房间暂时不可用</h1><p>${esc(e.message)}</p><a href="./">返回首页</a></section>`;}}
let actionPending=false;
async function send(data){
 if(actionPending)return;
 actionPending=true;
 const buttons=[...main.querySelectorAll('[data-act]')];
 buttons.forEach(button=>button.disabled=true);
 try{state=await api(`/api/room/${room}/act`,cloud?data:{...data,token:token()});selectedPosition=0;render();}
 catch(e){notice(e.message);}
 finally{actionPending=false;buttons.forEach(button=>button.disabled=false);}
}
const who=id=>state?.players.find(p=>p.id===id)?.name||'藏家';
const stars=n=>'★'.repeat(n);
const eraLabel=e=>e==='民国'?'中国民国':e;
function card(c,extra=''){
 const fallback=`<div class="card-top"><span>${esc(eraLabel(c.era))}</span><span>${stars(c.star)}</span></div><div class="card-mark">${esc(c.era.slice(0,1))}</div><strong>${esc(c.name)}</strong><div class="card-foot"><span>${c.red?'传奇 · 红卡':'藏品'}</span><b>${c.base} 金</b></div><small class="card-id">编号 ${esc(c.id)}</small>`;
 const src=cardAssets.cards?.[c.id];
 const label=`${eraLabel(c.era)} ${c.star} 星 ${c.name}，基础估值 ${c.base} 金，编号 ${c.id}`;
 return `<div class="card ${c.red?'red':''} ${src?'card-image':''} ${extra}" data-card="${esc(c.id)}" role="img" aria-label="${esc(label)}">${src?`<img src="${esc(src)}" alt="" loading="lazy" decoding="async"><span class="card-current-name">${esc(c.name)}</span><div class="card-fallback">${fallback}</div>`:fallback}</div>`;
}
function button(label,action,cls=''){return `<button class="${cls}" data-act="${action}">${label}</button>`;}
function phaseName(phase){return ({lobby:'等待入席',select:'盲标与定序','trade-request':'私下求购','request-response':'回应求购','request-choice':'选择求购对象','trade-free':'自由交易','trade-response':'回应自由交易','pre-auction':'拍前出售',open:'明拍竞价',sealed:'暗拍报价','turn-end':'本轮结束',finished:'终局结算'})[phase]||phase;}
function renderHome(){renderAccount();main.innerHTML=`<section class="welcome ${cloud&&!session&&!guestMode?'auth-welcome':''}"><div class="eyebrow">拍出历史 · 收藏未来</div><h1>拍卖大亨 <small>基础款 v2.0</small></h1><p>3–6 人联机竞拍九个时代的藏品，也可加入机器人练习。每人 150 金，在 2N 轮里收集套组、交易与经营红卡。</p>${cloud&&!session&&!guestMode?authForms():''}${guestMode?'<p class="guest-note">正在以游客身份体验。游客没有账号战绩；关闭浏览器后无法找回席位。</p>':''}<div class="home-grid">${!cloud||session||guestMode?`<form id="create" class="panel"><h2>开启新拍卖</h2><label>你的称呼<input name="name" maxlength="16" placeholder="例如：老王" required></label><button class="primary">创建房间</button></form>`:''}<form id="enter" class="panel"><h2>加入已有房间</h2><label>六位房间码<input name="room" maxlength="6" placeholder="例如：A1B2C3" required></label><button>查看房间</button></form></div><p class="hint">总席位 3–6 位 · 总共 2N 轮 · 支持机器人</p><p><a href="./manual.html" target="_blank" rel="noopener">阅读完整用户手册</a></p>${cardAssets.overview?`<p class="asset-overview"><a href="${esc(cardAssets.overview)}" target="_blank" rel="noopener">查看卡牌总览</a></p>`:''}</section>`;}
const cardOptions=(cards,empty='没有可选卡')=>cards.length?cards.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${c.star}星 · 编号 ${esc(c.id)}</option>`).join(''):`<option value="">${empty}</option>`;
function render(){if(!room){renderHome();return;}if(!state)return;renderAccount();const s=state,m=s.me,phase=s.phase;
 main.innerHTML=`<div class="game-shell"><section class="game-head"><div><div class="eyebrow">房间 ${esc(room)} · ${s.maxTurns?`第 ${s.turn} / ${s.maxTurns} 轮`:'等待开局'}</div><h1>${phaseName(phase)}</h1><p>${phase==='lobby'?'邀请朋友入席，3–6 人即可开局。':phase==='finished'?'所有拍卖已经落槌。':`本轮起始玩家：${esc(who(s.host))} · ${s.direction===1?'顺时针':s.direction===-1?'逆时针':'待定方向'} · 第 ${Math.min(s.lotIndex+1,s.lotCount)} / ${s.lotCount} 张`}</p></div><div class="head-actions">${button('复制房间链接','copy','ghost')}<span class="rate">拍卖行 ${[1,2,3,4].map(n=>`${n}星 ${Math.max(0,100+(s.rates[n]||0))}%`).join(' · ')}</span></div></section>
 <div class="columns"><div class="main-column"><section class="panel action-panel">${renderAction()}</section>${m&&phase!=='lobby'?`<section class="panel"><div class="section-heading"><h2>我的藏品</h2><span>${m.coins} 金 · ${m.hand.length} 张</span></div><div class="card-grid">${m.hand.length?m.hand.map(c=>card(c)).join(''):'<p class="empty">还没有藏品。</p>'}</div></section>`:''}<section class="panel log"><h2>拍卖记录</h2><ol>${s.log.slice().reverse().map(x=>`<li>${esc(x)}</li>`).join('')}</ol></section></div>
 <aside><section class="panel"><h2>藏家席位</h2><div class="players">${s.players.map((p,i)=>`<div class="player"><div class="avatar">${p.isBot?'机':i+1}</div><div><strong>${esc(p.name)} ${p.id===s.host&&phase!=='lobby'?'✦':''}</strong><small>${p.isBot?'自动藏家 · ':p.autoPilot?`${p.isGuest?'游客 · ':''}机器人托管 · `:p.isGuest?'游客 · ':''}${p.count} 张藏品 ${p.banned?'· 禁拍中':''}</small>${p.reds.map(c=>`<small class="red-label">${esc(c.name)}</small>`).join('')}</div><b>${p.coins} 金</b></div>`).join('')}</div></section>${s.eras.length?`<section class="panel"><h2>本局时代</h2><div class="era-tags">${s.eras.map(e=>`<span>${esc(eraLabel(e))}</span>`).join('')}</div></section>`:''}<section class="panel mini-rules"><h2>计分提示</h2><p>金币 + 藏品估值；同系 123 各 ×1.5，1234 各 ×2。</p><p>红卡缺 123 时，其红卡估值没收。</p><a href="./manual.html" target="_blank" rel="noopener">完整用户手册</a></section></aside></div></div>`;
}
function renderAction(){const s=state,m=s.me,h=s.host===m?.id,a=s.auction,t=s.trade;
 if(s.phase==='lobby'){const humans=s.players.filter(p=>!p.isBot).length,bots=s.players.length-humans;return `<h2>等待藏家入席</h2><p>总席位达到 3 位即可开局。起始玩家由开局掷骰决定。</p>${m?`<div class="callout">你已入席：${esc(m.name)}。当前 ${humans} 位真人、${bots} 位机器人，共 ${s.players.length}/6 席。</div>${m.id===s.owner?`<div class="bot-setup"><label>机器人数量<select id="botCount">${Array.from({length:7-humans},(_,n)=>`<option value="${n}" ${n===bots?'selected':''}>${n} 位</option>`).join('')}</select></label>${button('更新机器人','setBots')}</div>${button('开始游戏','start','primary')}`:''}`:s.players.length>=6?'<div class="callout">房间已满，可以旁观。</div>':cloud&&!session&&!guestMode?`${authForms()}`:`<form id="join"><label>你的称呼<input name="name" maxlength="16" required placeholder="输入称呼"></label><button class="primary">加入房间</button></form>`}`;}
 if(s.phase==='finished')return `<h2>本局结算</h2><p>隐藏红卡：${esc(s.hiddenRed?.name)}。总分最高者获胜；同分先比金币、再比完整套数。</p><div class="ranking">${s.winner.map((p,i)=>`<div><b>${i+1}. ${esc(p.name)}${p.isGuest?'（游客）':''}</b><strong>${p.total} 分</strong><small>金币 ${p.coins} + 藏品 ${p.value} − 没收红卡 ${p.penalty}</small></div>`).join('')}</div>`;
 if(!m)return `<h2>正在旁观</h2><p>可以看到公开局面，但无法代替玩家操作。</p>${cloud&&!session&&!guestMode?authForms():''}`;
 if(s.phase==='select')return h?`<h2>背面盲标与定序</h2><p>本轮抽出 ${s.selection.length} 张背面卡。选一张作为心仪卡，拍到它时实付八折；再确定第一张的拍卖模式。</p><div class="blind-grid">${s.selection.map((_,i)=>`<button type="button" class="blind-card ${selectedPosition===i?'active':''}" data-position="${i}">卡背 ${i+1}${selectedPosition===i?' ✓':''}</button>`).join('')}</div><label>第一张模式<select id="firstMode"><option value="open">明拍</option><option value="sealed">暗拍</option></select></label>${s.direction===null?`<label>轮换方向<select id="direction"><option value="1">顺时针</option><option value="-1">逆时针</option></select></label>`:''}${button('确认盲标与定序','choose','primary')}`:`<h2>起始玩家正在盲标</h2><p>本轮有 ${s.selection.length} 张背面卡，随后逐张翻面拍卖。</p>`;
 if(s.phase==='trade-request')return h?`<h2>第一步：求购</h2><p>填写要找的卡牌名称和报价。其他玩家可选择响应。若求购未成交，可进入自由交易。</p><label>求购卡名<input id="wanted" placeholder="例如：五铢钱"></label><label>报价金币<input id="requestCoins" type="number" min="0" max="${m.coins}" value="0"></label><div class="controls">${button('发出求购','request','primary')}${button('跳过求购','skipRequest')}</div>`:`<h2>起始玩家正在提出求购</h2>`;
 if(s.phase==='request-response')return h?`<h2>等待求购回应</h2><p>求购「${esc(t.wanted)}」，报价 ${t.coins} 金。已回应 ${Object.keys(t.responses||{}).length}/${s.players.length-1} 人。</p>`:Object.hasOwn(t.responses||{},m.id)?`<h2>已回应求购</h2><p>等待其他玩家。</p>`:`<h2>回应求购</h2><p>${esc(who(t.from))} 想以 ${t.coins} 金购买「${esc(t.wanted)}」。</p><label>我的符合卡牌<select id="requestCard"><option value="">不出售</option>${cardOptions(m.hand.filter(c=>c.name===t.wanted),'没有符合的卡')}</select></label>${button('提交回应','respondRequest','primary')}`;
 if(s.phase==='request-choice')return h?`<h2>选择求购对象</h2><p>接受一位响应者即成交；不接受可进入自由交易。</p><label>愿出售的玩家<select id="requestTarget"><option value="">暂不接受</option>${Object.entries(t.responses||{}).filter(([,yes])=>yes).map(([pid])=>`<option value="${pid}">${esc(who(pid))}</option>`).join('')}</select></label>${button('确认求购决定','chooseRequest','primary')}`:'<h2>等待起始玩家决定求购</h2>';
 if(s.phase==='trade-free')return h?`<h2>第二步：自由交易</h2><p>仅求购未成功时可发起一次。选自己一张卡、交易对象，可附金币与期望的卡名。对方同意才成交。</p>${m.hand.length?`<label>我的卡<select id="freeCard">${cardOptions(m.hand)}</select></label><label>交易对象<select id="freeTarget">${s.players.filter(p=>p.id!==m.id).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><label>期望对方给的卡名，可留空<input id="freeWanted" placeholder="例如：五铢钱"></label><label>我给的金币<input id="fromCoins" type="number" min="0" value="0"></label><label>对方给的金币<input id="toCoins" type="number" min="0" value="0"></label>${button('发起自由交易','freeTrade','primary')}`:''}${button('跳过交易，开始拍卖','skipTrade')}`:'<h2>起始玩家正在安排自由交易</h2>';
 if(s.phase==='trade-response')return t.to===m.id?`<h2>回应自由交易</h2><p>${esc(who(t.from))} 提议给你「${esc(t.fromCardName||'一张卡')}」${t.fromCoins?' 和 '+t.fromCoins+' 金':''}，希望得到${t.wanted?`「${esc(t.wanted)}」`:''}${t.toCoins?`及 ${t.toCoins} 金`:''}。</p>${t.wanted?`<label>选择符合的卡<select id="responseCard">${cardOptions(m.hand.filter(c=>c.name===t.wanted))}</select></label>`:''}<div class="controls">${button('同意交易','tradeYes','primary')}${button('拒绝','tradeNo')}</div>`:'<h2>等待交易对象回应</h2>';
 if(s.phase==='pre-auction')return `<h2>第 ${s.lotIndex+1} 张 · 拍前出售窗口</h2><p>下一张仍背面朝上。任何玩家可以把任意张手牌卖给拍卖行。每卖出一张，该星级议价减 10 个百分点；起始玩家点击“翻牌拍卖”后窗口关闭。</p><div class="blind-card">卡背 ${s.lotIndex+1}${s.blindPosition===s.lotIndex?' · 心仪卡':''}</div>${!s.ready?.[m.id]&&m.hand.length?`<label>我的藏品<select id="bankCard">${m.hand.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · 参考成交价 ${Math.floor(c.base*Math.max(0,100+(s.rates[c.star]||0))/100)} 金</option>`).join('')}</select></label>${button('卖给拍卖行','bankSell')}`:''}${!s.ready?.[m.id]?button('本张卡已结束出售','ready','primary'):`<div class="callout">已确认，等待其他玩家。${Object.keys(s.ready||{}).length}/${s.players.length} 人已确认。</div>`}${h&&s.players.every(p=>s.ready?.[p.id])?button('翻牌，开始拍卖','beginAuction','primary'):''}`;
 if(s.phase==='open')return `<h2>明拍 · ${esc(a.card.name)}</h2><div class="auction-preview">${card(a.card)}<div><p>起拍价 <b>${Math.max(5,a.card.base/2)} 金</b></p><p>当前最高 <b>${a.highest?.amount??'暂无'} 金</b></p><p>加价至少 2 金；落槌后统一掷 1D6 修正。</p></div></div>${a.actor===m.id?`<div class="controls"><input id="bid" type="number" inputmode="numeric" min="${a.highest?a.highest.amount+2:Math.max(5,a.card.base/2)}" max="${m.coins}" value="${a.highest?a.highest.amount+2:Math.max(5,a.card.base/2)}">${button('出价','bid','primary')}${button('退出','pass')}</div>`:`<div class="callout">${a.bidders.includes(m.id)?`等待 ${esc(who(a.actor))} 行动。`:'你本场禁拍。'}</div>`}`;
 if(s.phase==='sealed')return `<h2>暗拍 · ${esc(a.card.name)}</h2><div class="auction-preview">${card(a.card)}<div><p>无起拍价；填 0 表示放弃。</p><p>${a.tieRound?`最高价并列，第 ${a.tieRound} 次重拍。`:''}已提交 ${a.submitted.length}/${a.bidders.length} 人。</p></div></div>${a.bidders.includes(m.id)&&!a.submitted.includes(m.id)?`<div class="controls"><input id="sealedBid" type="number" inputmode="numeric" min="0" max="${m.coins}" value="0">${button('提交密封报价','sealedBid','primary')}</div>`:`<div class="callout">${a.submitted.includes(m.id)?'报价已密封，等待其他玩家。':'你本场禁拍。'}</div>`}`;
 if(s.phase==='turn-end')return h?`<h2>本轮结束</h2><p>卡牌已拍完，下一位起始玩家将轮换。禁拍在轮换时解除。</p>${button('轮换下一位','next','primary')}`:'<h2>本轮结束</h2><p>等待起始玩家轮换。</p>';
 return '';
}
main.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;if(f.id==='signup'||f.id==='login'){
  if(!cloud)return;const fields=new FormData(f),data={email:String(fields.get('email')||'').trim().toLowerCase(),password:String(fields.get('password')||'')};authEmail=data.email;
  if(f.id==='signup'&&data.password!==String(fields.get('confirmPassword')||'')){setAuthFeedback('两次输入的密码不一致，请重新确认。');f.querySelector('#confirmPassword').focus();return;}
  const submit=f.querySelector('[type="submit"]'),label=submit.textContent;submit.disabled=true;submit.textContent=f.id==='signup'?'正在注册…':'正在登录…';f.setAttribute('aria-busy','true');setAuthFeedback(null);
  try{if(f.id==='signup'){
   const x=await auth(`signup?redirect_to=${encodeURIComponent(location.origin+location.pathname)}`,data);
   if(x.access_token&&x.refresh_token){
    saveSession({access_token:x.access_token,refresh_token:x.refresh_token,expiresAt:Date.now()+x.expires_in*1000,email:x.user?.email||data.email});
    notice('注册成功，已登录');await refresh();
   }else{authMode='login';authFeedback={type:'success',text:'注册申请已提交。请查收验证邮件，完成验证后在这里登录；也请检查垃圾邮件文件夹。'};render();main.querySelector('#password')?.focus();}
  }else{
   const x=await auth('token?grant_type=password',data);
   saveSession({access_token:x.access_token,refresh_token:x.refresh_token,expiresAt:Date.now()+x.expires_in*1000,email:x.user?.email||data.email});
   authFeedback=null;await refresh();
  }}catch(error){setAuthFeedback(friendlyAuthError(error));}finally{submit.disabled=false;submit.textContent=label;f.removeAttribute('aria-busy');}return;
 }
 if(f.id==='create'){try{const x=await api('/api/create',{name:new FormData(f).get('name'),...(cloud&&guestMode?{guest:true}:{})});room=x.room;if(!cloud)localStorage.setItem('treasure:'+room,x.token);else if(x.guestToken)sessionStorage.setItem('treasure:guest:'+room,x.guestToken);history.pushState({},'',`?room=${room}`);await refresh();}catch(e){notice(e.message);}}
 if(f.id==='enter'){room=String(new FormData(f).get('room')).toUpperCase();history.pushState({},'',`?room=${room}`);await refresh();}
 if(f.id==='join'){try{const x=await api(`/api/room/${room}/join`,{name:new FormData(f).get('name'),...(cloud&&guestMode?{guest:true}:{})});if(!cloud)localStorage.setItem('treasure:'+room,x.token);else if(x.guestToken)sessionStorage.setItem('treasure:guest:'+room,x.guestToken);await refresh();}catch(e){notice(e.message);}}});
main.addEventListener('error',e=>{if(e.target.matches('.card-image img'))e.target.parentElement.classList.add('image-failed');},true);
main.addEventListener('click',async e=>{
 if(e.target.closest('[data-guest-enter]')){setGuestMode(true);return;}
 const mode=e.target.closest('[data-auth-mode]');if(mode){authEmail=main.querySelector('.auth-form [name="email"]')?.value.trim()||authEmail;authMode=mode.dataset.authMode;authFeedback=null;render();main.querySelector('#authEmail')?.focus();return;}
 const toggle=e.target.closest('[data-toggle-password]');if(toggle){const input=toggle.parentElement.querySelector('input'),visible=input.type==='password';let start,end;try{start=input.selectionStart;end=input.selectionEnd;}catch{}input.type=visible?'text':'password';toggle.setAttribute('aria-pressed',String(visible));toggle.setAttribute('aria-label',`${visible?'隐藏':'显示'}${input.id==='confirmPassword'?'确认密码':'密码'}`);toggle.title=toggle.getAttribute('aria-label');input.focus();if(start!=null)try{input.setSelectionRange(start,end);}catch{}return;}
 const blind=e.target.closest('[data-position]');if(blind){selectedPosition=Number(blind.dataset.position);render();return;}
 const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
 if(a==='copy'){try{const link=new URL(location.href);link.hash='';await navigator.clipboard.writeText(link.toString());notice('房间链接已复制');}catch{notice('请复制浏览器地址栏里的链接');}return;}
 if(a==='start')return send({kind:'start'});
 if(a==='setBots')return send({kind:'setBots',count:Number(document.querySelector('#botCount').value)});
 if(a==='choose')return send({kind:'choose',position:selectedPosition,mode:document.querySelector('#firstMode').value,direction:Number(document.querySelector('#direction')?.value||state.direction)});
 if(a==='request')return send({kind:'request',wanted:document.querySelector('#wanted').value,coins:Number(document.querySelector('#requestCoins').value)});
 if(a==='skipRequest')return send({kind:'skipRequest'});
 if(a==='respondRequest')return send({kind:'respondRequest',card:document.querySelector('#requestCard').value});
 if(a==='chooseRequest')return send({kind:'chooseRequest',target:document.querySelector('#requestTarget').value});
 if(a==='freeTrade')return send({kind:'freeTrade',card:document.querySelector('#freeCard').value,target:document.querySelector('#freeTarget').value,wanted:document.querySelector('#freeWanted').value,fromCoins:Number(document.querySelector('#fromCoins').value),toCoins:Number(document.querySelector('#toCoins').value)});
 if(a==='skipTrade')return send({kind:'skipTrade'});
 if(a==='tradeYes'||a==='tradeNo')return send({kind:'respondTrade',accept:a==='tradeYes',card:document.querySelector('#responseCard')?.value});
 if(a==='bankSell')return send({kind:'bankSell',card:document.querySelector('#bankCard').value});
 if(a==='ready')return send({kind:'ready'});
 if(a==='beginAuction')return send({kind:'beginAuction'});
 if(a==='bid')return send({kind:'bid',amount:Number(document.querySelector('#bid').value)});
 if(a==='pass')return send({kind:'pass'});
 if(a==='sealedBid')return send({kind:'sealedBid',amount:Number(document.querySelector('#sealedBid').value)});
 if(a==='next')return send({kind:'next'});
});
main.addEventListener('input',e=>{if(e.target.matches('.auth-form [name="email"]'))authEmail=e.target.value;if(e.target.closest('.auth-form')&&authFeedback?.type==='error')setAuthFeedback(null);});
document.querySelector('#account').addEventListener('click',e=>{if(e.target.id==='logout'){saveSession(null);refresh();}if(e.target.id==='leaveGuest')setGuestMode(false);});
setInterval(()=>{if(room)refresh();},cloud?4000:1800);
window.addEventListener('pagehide',()=>{if(!cloud||!room||!state?.me)return;const headers={apikey:cloud.key,'Content-Type':'application/json','X-Client-Id':clientId};if(session&&!guestMode)headers.Authorization=`Bearer ${session.access_token}`;else if(guestMode&&guestToken())headers['X-Guest-Token']=guestToken();else return;fetch(`${cloud.url}/functions/v1/game/api/room/${room}/leave`,{method:'POST',headers,body:'{}',keepalive:true}).catch(()=>{});});
window.addEventListener('popstate',()=>{room=new URLSearchParams(location.search).get('room')?.toUpperCase()||'';refresh();});
refresh();
