const SUPABASE_URL='https://eiicksuerfxfkqcweeap.supabase.co';
const SUPABASE_KEY='sb_publishable_Qs3DqwEpzYE20O6xgLuS4g_N_avZtVS';
const MB='https://musicbrainz.org/ws/2';
const ARTIST='86119d30-d930-4e65-a97a-e31e22388166';
const POPULAR=['what’s going on',"what's going on",'the key','stranger under my skin','u87','h³m','h3m','time flies','shall we dance','c’mon in',"c'mon in"];
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const state={user:null,room:null,channel:null,catalog:[],tracks:{},busy:false};
const $=s=>document.querySelector(s);
const views=['home','waiting','game','result'];
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cover=id=>`https://coverartarchive.org/release-group/${id}/front-500`;
const key=s=>s.toLowerCase().replace(/[\s·・,.!?！？。，「」『』'"’…\-()（）~]/g,'');
const show=id=>views.forEach(v=>$('#'+v).classList.toggle('hidden',v!==id));
function toast(text){const el=$('#toast');el.textContent=text;el.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hidden'),1800)}
function name(){return $('#playerName').value.trim()||'匿名听众'}
function shuffled(a){a=[...a];for(let i=a.length-1;i;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
async function json(url,retry=true){const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok){if(retry){await new Promise(x=>setTimeout(x,700));return json(url,false)}throw Error(r.status)}return r.json()}

async function loadTracks(album){
  const releases=await json(`${MB}/release?release-group=${album.id}&status=official&limit=100&fmt=json`);
  const priority=['HK','TW','CN','XW'];
  const rel=(releases.releases||[]).sort((a,b)=>(priority.indexOf(a.country)<0?9:priority.indexOf(a.country))-(priority.indexOf(b.country)<0?9:priority.indexOf(b.country)))[0];
  if(!rel)return [];
  const full=await json(`${MB}/release/${rel.id}?inc=recordings&fmt=json`);
  return (full.media||[]).flatMap(m=>m.tracks||[]);
}
async function loadCatalog(){
  const cached=localStorage.getItem('oneone-catalog-v4');
  if(cached){try{const x=JSON.parse(cached);state.catalog=x.catalog;state.tracks=x.tracks;if(state.catalog.length>=7)return}catch{}}
  $('#authStatus').textContent='正在整理曲库';
  const data=await json(`${MB}/release-group?artist=${ARTIST}&type=album|ep&limit=100&fmt=json`);
  const albums=(data['release-groups']||[]).filter(a=>POPULAR.some(n=>a.title.toLowerCase().includes(n))).sort((a,b)=>(a['first-release-date']||'9999').localeCompare(b['first-release-date']||'9999'));
  const seen=new Set();
  for(const album of albums){
    try{state.tracks[album.id]=(await loadTracks(album)).filter(t=>{const k=key(t.title);if(seen.has(k))return false;seen.add(k);return true})}catch{state.tracks[album.id]=[]}
  }
  state.catalog=albums;
  localStorage.setItem('oneone-catalog-v4',JSON.stringify({catalog:albums,tracks:state.tracks}));
}

async function init(){
  $('#playerName').value=localStorage.getItem('oneone-name')||'我';
  try{
    const {data:{session}}=await db.auth.getSession();
    let current=session;
    if(!current){const {data,error}=await db.auth.signInAnonymously();if(error)throw error;current=data.session}
    state.user=current.user;$('#authStatus').textContent='实时服务已连接';
    await loadCatalog();
    const saved=localStorage.getItem('oneone-room');
    if(saved){const {data}=await db.from('rooms').select('*').eq('id',saved).maybeSingle();if(data&&[data.player1,data.player2].includes(state.user.id)){await enterRoom(data);return}localStorage.removeItem('oneone-room')}
  }catch(e){$('#authStatus').textContent='等待 Supabase 初始化';$('#lobbyMessage').textContent='实时功能尚未初始化，请先执行仓库内的 supabase.sql 并开启匿名登录。'}
}
function requireReady(){if(!state.user){toast('实时服务尚未准备好');return false}if(state.catalog.length<2){toast('曲库还在整理，请稍等');return false}localStorage.setItem('oneone-name',name());return true}
function roomCode(){return String(Math.floor(100000+Math.random()*900000))}
async function createRoom(mode,id=roomCode()){
  if(!requireReady()||state.busy)return;state.busy=true;
  const payload={id,mode,status:'waiting',player1:state.user.id,player1_name:name(),album_order:shuffled(state.catalog.map(a=>a.id))};
  const {data,error}=await db.from('rooms').insert(payload).select().single();state.busy=false;
  if(error){toast(error.code==='23505'?'房间号已存在，请再试一次':'创建失败，请检查后台设置');return}
  await enterRoom(data);
}
async function joinRoom(id){
  if(!requireReady()||state.busy)return;id=id.replace(/\D/g,'').slice(0,6);if(id.length!==6)return toast('请输入 6 位房间号');state.busy=true;
  let {data:room,error}=await db.from('rooms').select('*').eq('id',id).maybeSingle();
  if(error||!room){state.busy=false;return toast('没有找到这个房间')}
  if(room.player1===state.user.id||room.player2===state.user.id){state.busy=false;return enterRoom(room)}
  if(room.player2||room.status!=='waiting'){state.busy=false;return toast('这个房间已经开始了')}
  const res=await db.from('rooms').update({player2:state.user.id,player2_name:name(),status:'playing'}).eq('id',id).is('player2',null).select().maybeSingle();state.busy=false;
  if(res.error||!res.data)return toast('刚刚有人先加入了这个房间');
  await enterRoom(res.data);
}
async function randomMatch(){
  if(!requireReady()||state.busy)return;state.busy=true;
  const since=new Date(Date.now()-10*60*1000).toISOString();
  const {data}=await db.from('rooms').select('*').eq('mode','random').eq('status','waiting').neq('player1',state.user.id).gte('created_at',since).order('created_at').limit(1);
  state.busy=false;
  if(data?.[0])return joinRoom(data[0].id);
  await createRoom('random');
}

async function enterRoom(room){
  state.room=room;localStorage.setItem('oneone-room',room.id);
  if(state.channel)await db.removeChannel(state.channel);
  state.channel=db.channel('room-'+room.id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms',filter:`id=eq.${room.id}`},p=>{state.room=p.new;renderRoom()}).subscribe(status=>{$('#onlineDot').style.background=status==='SUBSCRIBED'?'#51c878':'#e2aa42'});
  renderRoom();
}
function mySlot(){return state.room?.player1===state.user.id?'p1':'p2'}
function otherSlot(){return mySlot()==='p1'?'p2':'p1'}
function currentAlbum(){const id=state.room?.album_order?.[state.room.current_index];return state.catalog.find(a=>a.id===id)}
function choice(albumId,slot){return state.room?.choices?.[albumId]?.[slot]}
function displayChoice(c){return c?.pass?'PASS':c?.title||''}

function renderRoom(){
  const r=state.room;if(!r)return;
  $('#waitingCode').textContent=r.id;$('#roomBadge').textContent='# '+r.id;
  if(r.status==='waiting'||!r.player2){show('waiting');$('#waitingTitle').textContent=r.mode==='random'?'正在寻找另一位听众…':'等待朋友加入…';return}
  if(r.status==='finished'||r.current_index>=r.album_order.length){renderResult();return}
  show('game');
  const mine=mySlot(),other=otherSlot(),peer=other==='p1'?r.player1_name:r.player2_name;
  $('#peerName').textContent=peer||'另一位听众';$('#roomState').textContent='在线房间';
  const current=currentAlbum();if(!current){$('#chat').innerHTML='<div class="album-post"><p>正在同步唱片资料…</p></div>';return}
  const history=r.album_order.slice(0,r.current_index).map((id,i)=>{
    const a=state.catalog.find(x=>x.id===id),m=choice(id,mine),o=choice(id,other);if(!a)return '';
    return `<div class="history-divider">${String(i+1).padStart(2,'0')} · ${esc(a.title)}</div><div class="bubble-row"><div class="bubble"><small>${esc(peer)}</small>${esc(displayChoice(o))}</div></div><div class="bubble-row mine"><div class="bubble"><small>${esc(name())}</small>${esc(displayChoice(m))}</div></div>`
  }).join('');
  const myChoice=choice(current.id,mine),peerChoice=choice(current.id,other);
  $('#chat').innerHTML=history+`<article class="album-post"><img src="${cover(current.id)}" alt="${esc(current.title)} 封面"><div class="count">ALBUM ${r.current_index+1} / ${r.album_order.length}</div><h2>${esc(current.title)}</h2><p>${(current['first-release-date']||'').slice(0,4)} · 选出这一张你最喜欢的一首</p></article>`+(peerChoice?`<div class="bubble-row"><div class="bubble"><small>${esc(peer)}</small>${esc(displayChoice(peerChoice))}</div></div>`:`<div class="bubble-row"><div class="bubble waiting-choice"><small>${esc(peer)}</small>还在选择…</div></div>`)+(myChoice?`<div class="bubble-row mine"><div class="bubble"><small>${esc(name())}</small>${esc(displayChoice(myChoice))}</div></div>`:'');
  $('#songInput').disabled=!!myChoice;$('#passGame').disabled=!!myChoice;$('#songInput span').textContent=myChoice?'已提交，等待对方…':'选择这一张的歌…';
  requestAnimationFrame(()=>{$('#chat').scrollTop=$('#chat').scrollHeight});
}
function openSongs(){
  const album=currentAlbum();if(!album||choice(album.id,mySlot()))return;
  $('#sheetAlbum').textContent=album.title;
  const tracks=state.tracks[album.id]||[];
  $('#trackList').innerHTML=tracks.map((t,i)=>{const q=encodeURIComponent('陈奕迅 '+t.title);return `<div class="track"><span class="track-num">${String(i+1).padStart(2,'0')}</span><button data-i="${i}">${esc(t.title)}</button><span class="links"><a target="_blank" rel="noopener" href="https://music.163.com/#/search/m/?s=${q}&type=1">网易云</a><a target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${q}">YT</a><a target="_blank" rel="noopener" href="https://music.apple.com/hk/search?term=${q}">Apple</a></span></div>`}).join('')||'<p class="hint">这张专辑暂时没有曲目资料，可以选择 PASS。</p>';
  $('#trackList').querySelectorAll('button[data-i]').forEach(b=>b.onclick=()=>submit({title:tracks[+b.dataset.i].title,id:tracks[+b.dataset.i].recording?.id}));
  $('#songs').showModal();
}
async function submit(selected){
  if(state.busy)return;const album=currentAlbum();if(!album)return;state.busy=true;$('#songs').close();
  const {data,error}=await db.rpc('submit_choice',{p_room:state.room.id,p_album:album.id,p_choice:selected});
  state.busy=false;if(error)return toast('提交失败，请重试');if(data){state.room=Array.isArray(data)?data[0]:data;renderRoom()}
}
function renderResult(){
  show('result');const r=state.room,mine=mySlot(),other=otherSlot();
  const played=r.album_order.map(id=>({id,a:state.catalog.find(x=>x.id===id),m:choice(id,mine),o:choice(id,other)}));
  const compared=played.filter(x=>x.m&&!x.m.pass&&x.o&&!x.o.pass),same=compared.filter(x=>key(x.m.title)===key(x.o.title));
  const score=compared.length?Math.round(same.length/compared.length*100):0;
  $('#score').textContent=score+'%';$('#resultTitle').textContent=score>=65?'你们听见了相似的陈奕迅':score>=35?'有些歌，刚好想到一起':'两份很不一样的歌单';
  $('#resultCopy').textContent=`共同选择了 ${compared.length} 张专辑，有 ${same.length} 次选择相同。`;
  $('#resultList').innerHTML=played.filter(x=>x.a).map(x=>`<div class="result-item"><b>${esc(x.a.title)}</b><span>${esc(displayChoice(x.m))} · ${esc(displayChoice(x.o))}</span></div>`).join('');
  localStorage.removeItem('oneone-room');
}
async function leave(){if(state.channel)await db.removeChannel(state.channel);state.channel=null;state.room=null;localStorage.removeItem('oneone-room');show('home')}

$('#matchBtn').onclick=randomMatch;$('#createBtn').onclick=()=>createRoom('private');$('#joinBtn').onclick=()=>joinRoom($('#roomInput').value);$('#roomInput').onkeydown=e=>{if(e.key==='Enter')joinRoom(e.target.value)};$('#copyCode').onclick=async()=>{await navigator.clipboard.writeText(state.room.id);toast('房间号已复制')};document.querySelectorAll('.leave').forEach(b=>b.onclick=leave);$('#roomBadge').onclick=async()=>{await navigator.clipboard.writeText(state.room.id);toast('房间号已复制')};$('#songInput').onclick=openSongs;$('#passGame').onclick=()=>submit({title:'PASS',pass:true});$('#songs .close').onclick=()=>$('#songs').close();$('#homeBtn').onclick=leave;
init();
