const main=document.querySelector('#main'),toast=document.querySelector('#toast');
const dialog=document.querySelector('#rules');
document.querySelector('#rulesBtn').onclick=()=>dialog.showModal();
document.querySelector('#closeRules').onclick=()=>dialog.close();
let room=new URLSearchParams(location.search).get('room')?.toUpperCase()||'',state=null,selected={open:'',sealed:''};
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
 try{state=await api(`/api/room/${room}/act`,cloud?data:{...data,token:token()});selected={open:'',sealed:''};render();}
 catch(e){notice(e.message);}
 finally{actionPending=false;buttons.forEach(button=>button.disabled=false);}
}
const who=id=>state?.players.find(p=>p.id===id)?.name||'藏家';
const stars=n=>'★'.repeat(n);
function card(c,extra=''){
 const fallback=`<div class="card-top"><span>${esc(c.era)}</span><span>${stars(c.star)}</span></div><div class="card-mark">${esc(c.era.slice(0,1))}</div><strong>${esc(c.name)}</strong><div class="card-foot"><span>${c.red?'传奇 · 红卡':'藏品'}</span><b>${c.base} 金</b></div><small class="card-id">编号 ${esc(c.id)}</small>`;
 const src=cardAssets.cards?.[c.id];
 const label=`${c.era} ${c.star} 星 ${c.name}，基础估值 ${c.base} 金，编号 ${c.id}`;
 return `<div class="card ${c.red?'red':''} ${src?'card-image':''} ${extra}" data-card="${esc(c.id)}" role="img" aria-label="${esc(label)}">${src?`<img src="${esc(src)}" alt="" loading="lazy" decoding="async"><div class="card-fallback">${fallback}</div>`:fallback}</div>`;
}
function button(label,action,cls=''){return `<button class="${cls}" data-act="${action}">${label}</button>`;}
function phaseName(phase){return ({lobby:'等待入席',select:'主持人选品',open:'明拍竞价',sealed:'暗拍报价','secondary-choice':'二次交易','swap-response':'等待换卡回应',sell:'出售藏品','turn-end':'本回合结束',finished:'终局结算'})[phase]||phase;}
function renderHome(){renderAccount();main.innerHTML=`<section class="welcome ${cloud&&!session&&!guestMode?'auth-welcome':''}"><div class="eyebrow">一场关于眼光与取舍的拍卖</div><h1>千年藏珍</h1><p>可与朋友联机，也可添加机器人独自开局。竞拍九大时代的藏品，凑齐套组，警惕红卡。</p>${cloud&&!session&&!guestMode?authForms():''}${guestMode?'<p class="guest-note">正在以游客身份体验。本局房间会暂存进度，游客不生成账号战绩，也不参与未来的平台排行榜。</p>':''}<div class="home-grid">${!cloud||session||guestMode?`<form id="create" class="panel"><h2>开启新拍卖</h2><label>你的称呼<input name="name" maxlength="16" placeholder="例如：老王" required></label><button class="primary">创建房间</button></form>`:''}<form id="enter" class="panel"><h2>加入已有房间</h2><label>六位房间码<input name="room" maxlength="6" placeholder="例如：A1B2C3" required></label><button>查看房间</button></form></div><p class="hint">总席位 3–6 位 · 每位主持 3 回合 · 支持单人对战机器人</p>${cardAssets.overview?`<p class="asset-overview"><a href="${esc(cardAssets.overview)}" target="_blank" rel="noopener">查看 81 张卡牌总览</a></p>`:""}</section>`;}
function render(){if(!room){renderHome();return;}if(!state)return;
 renderAccount();
 const me=state.me,host=state.host===me?.id,phase=state.phase;
 const action=renderAction();
 main.innerHTML=`<div class="game-shell"><section class="game-head"><div><div class="eyebrow">房间 ${esc(room)} · ${state.maxTurns?`第 ${state.turn} / ${state.maxTurns} 回合`:'等待开局'}</div><h1>${phaseName(phase)}</h1><p>${phase==='lobby'?'邀请朋友入席，3–6 人即可开局。':phase==='finished'?'所有拍卖已经落槌。':`本回合主持：${esc(who(state.host))}`}</p></div><div class="head-actions">${button('复制房间链接','copy','ghost')}<span class="rate">低星 ${state.rates.low}%<br>高星 ${state.rates.high}%</span></div></section>
 <div class="columns"><div class="main-column"><section class="panel action-panel">${action}</section>${me&&phase!=='lobby'?`<section class="panel"><div class="section-heading"><h2>我的藏品</h2><span>${me.coins} 金 · ${me.hand.length} 张</span></div><div class="card-grid">${me.hand.length?me.hand.map(c=>card(c)).join(''):'<p class="empty">还没有藏品。竞拍或交换来扩充收藏。</p>'}</div></section>`:''}<section class="panel log"><h2>拍卖记录</h2><ol>${state.log.slice().reverse().map(s=>`<li>${esc(s)}</li>`).join('')}</ol></section></div>
 <aside><section class="panel"><h2>藏家席位</h2><div class="players">${state.players.map((p,i)=>`<div class="player"><div class="avatar">${p.isBot?'机':i+1}</div><div><strong>${esc(p.name)} ${p.id===state.host&&phase!=='lobby'?'✦':''}</strong><small>${p.isBot?'自动藏家 · ':p.autoPilot?`${p.isGuest?'游客 · ':''}机器人托管 · `:p.isGuest?'游客 · ':''}${p.count} 张藏品 ${p.banned&&phase!=='lobby'?'· 本回合禁拍':''}</small>${p.reds.map(c=>`<small class="red-label">${esc(c.name)}</small>`).join('')}</div><b>${p.coins} 金</b></div>`).join('')}</div></section>${state.eras.length?`<section class="panel"><h2>本局时代</h2><div class="era-tags">${state.eras.map(e=>`<span>${esc(e)}</span>`).join('')}</div></section>`:''}<section class="panel mini-rules"><h2>计分提示</h2><p>金币 + 藏品估值 × 套组加成 − 红卡惩罚。</p><p>集齐同一时代 1、2、3 星：×1.5；再有红卡：×2。</p></section></aside></div></div>`;
}
function renderAction(){const s=state,m=s.me,h=s.host===m?.id,a=s.auction;
 if(s.phase==='lobby'){
  const humans=s.players.filter(p=>!p.isBot).length,bots=s.players.length-humans;
  return `<h2>等待藏家入席</h2><p>邀请朋友，或添加机器人。总席位达到 3 位即可开局；只有真人能操作自己的席位。</p>${m?`<div class="callout">你已入席：${esc(m.name)}${m.isGuest?' · 游客':''}。当前 ${humans} 位真人、${bots} 位机器人，共 ${s.players.length}/6 席。</div>${m.id===s.owner?`<div class="bot-setup"><label>机器人数量<select id="botCount">${Array.from({length:7-humans},(_,n)=>`<option value="${n}" ${n===bots?'selected':''}>${n} 位</option>`).join('')}</select></label>${button('更新机器人','setBots')}</div><p class="hint">独自玩时选择至少 2 位机器人，再点击开始游戏。</p>${button('开始游戏','start','primary')}`:''}`:s.players.length>=6?'<div class="callout">房间已满，可以旁观。房主可减少机器人席位。</div>':guestMode&&guestToken()?'<div class="callout">原游客席位已由机器人托管，无法重新接管。你可以旁观，或前往首页创建新房间。</div>':cloud&&!session&&!guestMode?`<p>登录账号，或选择游客模式加入房间。</p>${authForms()}`:`<form id="join"><label>你的称呼<input name="name" maxlength="16" required placeholder="输入称呼"></label><button class="primary">加入房间</button></form>`}`;
 }
 if(s.phase==='finished')return `<h2>本局结算</h2><p>隐藏红卡：${esc(s.hiddenRed?.name)}。总分最高者获胜；同分先比金币、再比完整套数。此结果仅用于当前房间，游客不参与平台排行榜。</p><div class="ranking">${s.winner.map((p,i)=>`<div><b>${i+1}. ${esc(p.name)}${p.isGuest?'（游客）':''}</b><strong>${p.total} 分</strong><small>金币 ${p.coins} + 藏品 ${p.value} − 惩罚 ${p.penalty}</small></div>`).join('')}</div>`;
 if(!m)return `<h2>正在旁观</h2><p>${guestMode&&guestToken()?'游客席位已由机器人托管，无法重新接管。': '你可以看到公开局面。游戏已开始，无法中途加入。'}</p>${cloud&&!session&&!guestMode?authForms():''}`;
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
main.addEventListener('input',e=>{if(e.target.matches('.auth-form [name="email"]'))authEmail=e.target.value;if(e.target.closest('.auth-form')&&authFeedback?.type==='error')setAuthFeedback(null);});
document.querySelector('#account').addEventListener('click',e=>{if(e.target.id==='logout'){saveSession(null);refresh();}if(e.target.id==='leaveGuest')setGuestMode(false);});
setInterval(()=>{if(room)refresh();},cloud?4000:1800);
window.addEventListener('pagehide',()=>{if(!cloud||!room||!state?.me)return;const headers={apikey:cloud.key,'Content-Type':'application/json','X-Client-Id':clientId};if(session&&!guestMode)headers.Authorization=`Bearer ${session.access_token}`;else if(guestMode&&guestToken())headers['X-Guest-Token']=guestToken();else return;fetch(`${cloud.url}/functions/v1/game/api/room/${room}/leave`,{method:'POST',headers,body:'{}',keepalive:true}).catch(()=>{});});
window.addEventListener('popstate',()=>{room=new URLSearchParams(location.search).get('room')?.toUpperCase()||'';refresh();});
refresh();
