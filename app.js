const ARTIST='86119d30-d930-4e65-a97a-e31e22388166';
const MB='https://musicbrainz.org/ws/2';
const state={albums:[],choices:[{},{}],active:null,challenge:false};
const $=s=>document.querySelector(s);
const grid=$('#albumGrid'),status=$('#status'),songDialog=$('#songDialog');
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cover=id=>`https://coverartarchive.org/release-group/${id}/front-500`;

function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.append(el);setTimeout(()=>el.remove(),1800)}
async function getJSON(url){const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(r.status);return r.json()}

async function loadAlbums(){
  try{
    const data=await getJSON(`${MB}/release-group?artist=${ARTIST}&type=album|ep&limit=100&fmt=json`);
    state.albums=shuffle((data['release-groups']||[]).filter(a=>['Album','EP'].includes(a['primary-type'])&&!/live|演唱會|精選|collection|remix|karaoke/i.test(`${a.title} ${a['secondary-types']||[]}`)));
    status.hidden=true;render();decodeChallenge();
  }catch(e){status.innerHTML='唱片資料暫時載入不到。<button class="text-btn" onclick="loadAlbums()">再試一次</button>'}
}

function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function render(){
  grid.innerHTML='';
  state.albums.forEach(a=>{
    const node=$('#albumTemplate').content.cloneNode(true),card=node.querySelector('.album-card');card.dataset.id=a.id;
    const img=node.querySelector('.cover');img.src=cover(a.id);img.alt=`${a.title} 專輯封面`;img.onerror=()=>{img.onerror=null;img.src='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="100%" height="100%" fill="#ded6cb"/><text x="50%" y="48%" text-anchor="middle" font-family="serif" font-size="34" fill="#37322d">${esc(a.title).slice(0,18)}</text><text x="50%" y="57%" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#777">EASON CHAN</text></svg>`)};
    node.querySelector('.year').textContent=(a['first-release-date']||'—').slice(0,4);node.querySelector('.album-meta h3').textContent=a.title;node.querySelector('.type').textContent=a['primary-type']==='EP'?'迷你專輯 · EP':'錄音室專輯';
    [0,1].forEach(p=>{const btn=node.querySelector(`.p${p+1}`);btn.querySelector('.who').textContent=$(`#name${p+1}`).value||`玩家 ${p+1}`;const choice=state.choices[p][a.id];if(choice){btn.classList.add('done');btn.querySelector('.chosen').textContent=choice.title}if(state.challenge&&p===0)btn.disabled=true;btn.onclick=()=>openAlbum(a,p)});grid.append(node);
  });updateProgress();
}

async function openAlbum(album,player){
  state.active={album,player};$('#dialogCover').src=cover(album.id);$('#dialogTitle').textContent=album.title;$('#dialogYear').textContent=(album['first-release-date']||'').slice(0,4);$('#dialogHint').textContent=`${$(`#name${player+1}`).value||`玩家 ${player+1}`}，請選出你最喜歡的一首`;
  const list=$('#trackList');list.innerHTML='<div class="status"><span class="loader"></span> 正在取出曲目…</div>';songDialog.showModal();
  try{const releases=await getJSON(`${MB}/release?release-group=${album.id}&status=official&limit=100&fmt=json`);const rel=(releases.releases||[]).sort((a,b)=>{const pa=['HK','TW','CN','XW'];return (pa.indexOf(a.country)<0?9:pa.indexOf(a.country))-(pa.indexOf(b.country)<0?9:pa.indexOf(b.country))})[0];if(!rel)throw 0;const full=await getJSON(`${MB}/release/${rel.id}?inc=recordings&fmt=json`);const tracks=(full.media||[]).flatMap(m=>m.tracks||[]);list.innerHTML=tracks.map((t,i)=>`<button class="track" data-i="${i}"><span class="num">${String(i+1).padStart(2,'0')}</span><span>${esc(t.title)}</span><span class="duration">${t.length?Math.floor(t.length/60000)+':'+String(Math.floor(t.length/1000)%60).padStart(2,'0'):''}</span></button>`).join('');list.querySelectorAll('.track').forEach((b,i)=>b.onclick=()=>choose({title:tracks[i].title,id:tracks[i].recording?.id||tracks[i].id}));
  }catch(e){list.innerHTML='<div class="status">這張唱片暫時找不到曲目資料。</div>'}
}
function choose(track){const {album,player}=state.active;state.choices[player][album.id]=track;songDialog.close();render();save()}
function updateProgress(){const total=state.albums.length*2,done=Object.keys(state.choices[0]).length+Object.keys(state.choices[1]).length;$('#progress').textContent=`${done} / ${total}`}
function save(){localStorage.setItem('one-one-eason',JSON.stringify({choices:state.choices,names:[$('#name1').value,$('#name2').value]}))}
function restore(){try{const x=JSON.parse(localStorage.getItem('one-one-eason'));if(x&&!location.hash){state.choices=x.choices||state.choices;$('#name1').value=x.names?.[0]||'我';$('#name2').value=x.names?.[1]||'朋友'}}catch{}}
function results(){const completed=state.albums.filter(a=>state.choices[0][a.id]&&state.choices[1][a.id]);const missing=state.albums.length-completed.length;if(missing)return toast('還有 '+missing+' 張專輯未完成');const same=completed.filter(a=>state.choices[0][a.id].title===state.choices[1][a.id].title);const n=Math.round(same.length/completed.length*100);$('#score').textContent=n+'%';$('#scoreTitle').textContent=n>=70?'你們根本共用一副耳機':n>=40?'在不少旋律上相遇了':n?'不同品味，也有交集':'兩套完全不同的歌單';$('#scoreCopy').textContent=`全部 ${completed.length} 張專輯已完成，其中 ${same.length} 張選了同一首。`;$('#matches').innerHTML=same.length?same.map(a=>`<div class="match"><img src="${cover(a.id)}" alt=""><div><strong>${esc(a.title)}</strong><span>${esc(state.choices[0][a.id].title)}</span></div></div>`).join(''):'<p>還沒有選到相同的歌，繼續選下去看看。</p>';$('#resultDialog').showModal()}
function challengeLink(){const payload={n:$('#name1').value,c:state.choices[0]};const hash=btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/=+$/,'');return `${location.origin}${location.pathname}#challenge=${hash}`}
async function share(){if(!Object.keys(state.choices[0]).length)return toast('第一位玩家要先選歌');const url=challengeLink();try{await navigator.clipboard.writeText(url);toast('挑戰連結已複製')}catch{prompt('複製這個連結給朋友：',url)}}
function decodeChallenge(){if(!location.hash.startsWith('#challenge='))return;try{const raw=location.hash.slice(11),p=JSON.parse(decodeURIComponent(escape(atob(raw.replace(/-/g,'+').replace(/_/g,'/')))));state.choices[0]=p.c||{};state.challenge=true;$('#name1').value=p.n||'朋友';$('#name1').disabled=true;$('#name2').value='我';render();toast('好友的選擇已藏好，輪到你了')}catch{}}

document.querySelectorAll('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());$('#startBtn').onclick=()=>{$('#picker').classList.remove('hidden');$('#picker').scrollIntoView()};$('#aboutBtn').onclick=()=>$('#aboutDialog').showModal();$('#resultBtn').onclick=results;$('#shareBtn').onclick=share;$('#resetBtn').onclick=()=>{if(confirm('清除目前所有選擇？')){state.choices=[{},{}];localStorage.removeItem('one-one-eason');location.hash='';location.reload()}};[$('#name1'),$('#name2')].forEach(x=>x.oninput=()=>{render();save()});restore();loadAlbums();
