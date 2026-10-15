'use strict';
// The main track is magnetic; overlay tracks retain explicit positions. Higher tracks render on top.
let layerCount=1,activeVisual=null,lastLayerTick=0,dragState=null,libraryDragMedia=null;
const lowerAudio=new Map();
function packMainTrack(items){let end=0;for(const c of items.filter(c=>c.track===0).sort((a,b)=>a.start-b.start)){c.start=end;end+=clipLength(c);}return items;}
function layoutClips(){const ends=new Map();for(const c of clips){c.track=Number.isInteger(c.track)?Math.max(0,c.track):0;if(!Number.isFinite(c.start))c.start=ends.get(c.track)||0;c.start=Math.max(0,c.start);ends.set(c.track,Math.max(ends.get(c.track)||0,c.start+clipLength(c)));}packMainTrack(clips);return clips;}
duration=()=>{layoutClips();return Math.max(0,...clips.map(c=>c.start+clipLength(c)));};
function visibleClips(t){layoutClips();return clips.filter(c=>t>=c.start-.0001&&t<c.start+clipLength(c)-.0001).sort((a,b)=>b.track-a.track||clips.indexOf(b)-clips.indexOf(a));}
locate=function(t){let c=visibleClips(t)[0];if(!c&&Math.abs(t-duration())<.001)c=clips.filter(x=>Math.abs(x.start+clipLength(x)-duration())<.002).sort((a,b)=>b.track-a.track)[0];return c?{c,at:c.start,index:clips.indexOf(c),offset:Math.max(0,Math.min(clipLength(c),t-c.start))}:null;};
function stopLowerAudio(){for(const item of lowerAudio.values())item.el.pause();}
const pauseBeforeLayers=pause;
pause=function(){pauseBeforeLayers();stopLowerAudio();lastLayerTick=0;};
function syncLowerAudio(t,top,seek){
  const active=visibleClips(t).filter(c=>c.id!==top?.id&&source(c).audio&&c.volume>0),ids=new Set(active.map(c=>c.id));
  for(const [id,item]of lowerAudio){if(!ids.has(id))item.el.pause();}
  for(const c of active){let item=lowerAudio.get(c.id),track=c.audioTrack||0;if(item&&item.track!==track){item.el.pause();item.node?.disconnect();lowerAudio.delete(c.id);item=null;}
    if(!item){item={el:new Audio(),track,ready:false};lowerAudio.set(c.id,item);const current=item;request('/api/preview-audio',{method:'POST',body:JSON.stringify({mediaId:c.mediaId,track})}).then(({url})=>{if(lowerAudio.get(c.id)!==current)return;current.el.src=url;current.ready=true;}).catch(()=>{current.failed=true;});}
    if(!item.ready)continue;
    if(audioContext&&!item.node){item.node=audioContext.createGain();audioContext.createMediaElementSource(item.el).connect(item.node).connect(audioContext.destination);}
    if(item.node)item.node.gain.value=c.volume;else item.el.volume=Math.min(1,c.volume);
    item.el.playbackRate=c.speed||1;item.el.preservesPitch=true;const target=c.in+(t-c.start)*(c.speed||1);if(seek||Math.abs(item.el.currentTime-target)>.25)item.el.currentTime=target;
    if(playing&&item.el.paused&&!item.el.ended)item.el.play().catch(()=>{});
  }
}
setPosition=function(t,seek=true,allowEmptySpace=false){
  playhead=Math.max(0,allowEmptySpace?t:Math.min(duration(),t));$('currentTime').textContent=fmt(playhead);$('playhead').style.left=playhead*scale+'px';
  const found=locate(playhead);if(!found){video.pause();trackAudio.pause();video.style.display='none';$('emptyPreview').hidden=clips.length>0;$('previewError').hidden=!clips.length;$('previewError').textContent='No video at this position';activeVisual=null;syncLowerAudio(playhead,null,seek);return;}
  const {c,offset}=found,m=source(c),target=c.in+offset*(c.speed||1),changed=activeVisual!==c.id;activeVisual=c.id;
  $('emptyPreview').hidden=true;$('previewError').hidden=true;video.style.display='block';$('previewInfo').textContent=`${m.width} × ${m.height} · Video ${c.track+1} on top`;
  if(video.dataset.layerMedia!==m.id){video.dataset.layerMedia=m.id;video.src=CuteEngine.mediaURL(m.id);}
  loaded=m.id;video.playbackRate=c.speed||1;trackAudio.playbackRate=c.speed||1;video.preservesPitch=true;trackAudio.preservesPitch=true;
  if(changed||seek||Math.abs(video.currentTime-target)>.25)seekPreviewVideo(video,target);
  if(!(typeof exportBusy==='boolean'&&exportBusy))syncAudio(m,c,target,seek||changed);if(gain){video.volume=1;gain.gain.value=c.volume;}else video.volume=Math.min(1,c.volume);
  if(playing&&video.paused&&!video.ended)video.play().catch(()=>{});if(!(typeof exportBusy==='boolean'&&exportBusy))syncLowerAudio(playhead,c,seek||changed);
};
togglePlay=function(){if(!clips.length)return;if(playing)return pause();enableAudio();if(playhead>=duration()-.04)setPosition(0);playing=true;lastLayerTick=performance.now();$('play').textContent='❚❚';$('play').setAttribute('aria-label','Pause');setPosition(playhead);};
$('play').onclick=togglePlay;video.onended=()=>{};
tick=function(now){if(playing){const current=Number.isFinite(now)?now:performance.now(),dt=lastLayerTick?Math.min(.1,(current-lastLayerTick)/1000):0;lastLayerTick=current;const found=locate(playhead);if(!found||video.readyState>=2&&!video.seeking){const next=playhead+dt;if(next>=duration()){pause();setPosition(duration());}else setPosition(next,false);}}else lastLayerTick=0;requestAnimationFrame(tick);};

const settingsBeforeLayers=settings;
settings=function(){settingsBeforeLayers();const c=chosen();if(!c)return;let info=$('placementInfo');if(!info){info=document.createElement('div');info.id='placementInfo';info.className='detail-line';$('speedInfo').after(info);}info.innerHTML=`<span>Video ${c.track+1} · ${fmt(c.start)}</span><strong>${c.track===0?'Main track':'Overlay track'}</strong>`;};
window.removeEventListener('resize',render);
render=function(){
  layoutClips();const total=duration(),count=Math.max(layerCount,1,...clips.map(c=>c.track+1)),width=Math.max(timelineViewport.clientWidth,total*scale+120);layerCount=count;
  $('totalTime').textContent=fmt(total);$('timelineSummary').textContent=`${clips.length} clips · ${count} video ${count===1?'track':'tracks'} · ${fmt(total)}`;$('timelineEmpty').hidden=true;$('export').disabled=true;$('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length;for(const id of ['delete','moveLeft','moveRight'])$(id).disabled=!chosen();$('split').disabled=!clips.length;
  $('timelineCanvas').style.width=width+'px';const step=scale<12?10:scale<35?5:scale<80?2:1;let ruler='';for(let t=0;t<width/scale;t+=step)ruler+=`<div class="tick" style="left:${t*scale}px">${fmt(t).slice(0,5)}</div>`;$('ruler').innerHTML=ruler;
  let html='<div class="new-track-zone" data-new-layer="true">＋ Drop here to create a video track</div>',labels='<div class="ruler-label">TIMELINE</div><div class="new-track-label">Layers</div>';
  for(let track=count-1;track>=0;track--){const items=clips.filter(c=>c.track===track).sort((a,b)=>a.start-b.start);labels+=`<div class="video-track-label"><span>▧ Video ${track+1}</span><small>${track===0?'MAIN':'OVERLAY'}</small></div>`;html+=`<div class="video-lane ${track===0?'main-lane':''}" data-layer="${track}">${items.map(c=>{const m=source(c);return `<div class="clip ${selected===c.id&&selectionKind==='video'?'selected':''}" data-id="${c.id}" style="left:${c.start*scale}px;width:${Math.max(5,clipLength(c)*scale)}px" title="Drag to move · right-click for options"><div class="filmstrip" style="background-image:url('${m.thumb||''}')"></div><span class="clip-label">${esc(c.label||m.name)}</span><span class="clip-time">${fmt(clipLength(c))}${c.speed&&c.speed!==1?' · '+c.speed+'×':''}</span><span class="clip-sound">${c.detached?'♫ extracted':'◖ audio'}</span><div class="handle left" data-edge="in"></div><div class="handle right" data-edge="out"></div></div>`;}).join('')}${items.length?'':'<span class="lane-empty">Drop a clip here</span>'}</div>`;}
  $('videoTrack').innerHTML=html;let audio='';for(const c of clips.filter(c=>c.detached)){const m=source(c),track=m.audioTracks[c.audioTrack||0],wave=m.waves?.[c.audioTrack||0];let bars='';if(wave)for(let i=0;i<wave.length;i++){const h=Math.max(1,wave[i]*31);bars+=`<rect x="${i*3}" y="${25-h/2}" width="1.5" height="${h}"/>`;}audio+=`<div class="audio-clip ${selected===c.id&&selectionKind==='audio'?'audio-selected':''}" data-id="${c.id}" style="left:${c.start*scale}px;width:${Math.max(5,clipLength(c)*scale)}px;top:${c.track*58+4}px"><span>♫ ${esc(track?.title||'Audio')} <b>Video ${c.track+1}</b></span><svg viewBox="0 0 ${wave?.length*3||300} 50" preserveAspectRatio="none" fill="#bde2cc">${bars||'<path d="M0 25H300" stroke="#8db7a5"/>'}</svg></div>`;}
  const hasAudio=!!audio;$('audioTrack').innerHTML=audio;$('audioTrack').hidden=!hasAudio;$('audioTrack').style.height=hasAudio?count*58+'px':'0px';if(hasAudio)labels+=`<div class="audio-layer-label" style="height:${count*58}px">♫ Extracted audio<small>Follows its video</small></div>`;document.querySelector('.track-labels').innerHTML=labels;document.querySelector('.timeline').classList.toggle('has-audio',hasAudio);
  const height=36+30+count*84+(hasAudio?count*58:0)+20;$('timelineCanvas').style.height=height+'px';$('playhead').style.height=height-10+'px';settings();setPosition(playhead,false,true);if(typeof updateZoomLabel==='function')updateZoomLabel();
};
window.addEventListener('resize',render);

function insertClipAt(c,track,start){layoutClips();if(track===0)start=Math.min(start,clips.filter(x=>x.track===0).reduce((sum,x)=>sum+clipLength(x),0));const length=clipLength(c);for(const item of clips)if(item.track===track&&item.start>=start-.001)item.start+=length;c.track=track;c.start=Math.max(0,start);clips.push(c);packMainTrack(clips);}
addClip=function(mediaId){pause();snapshot();layoutClips();const m=library.find(x=>x.id===mediaId),track=chosen()?.track||0,start=Math.max(0,...clips.filter(c=>c.track===track).map(c=>c.start+clipLength(c))),c={id:uid(),mediaId,in:0,out:m.duration,volume:1,audioTrack:0,track,start};clips.push(c);selected=c.id;selectionKind='video';render();setPosition(start);};
remove=function(){const c=chosen();if(!c)return;pause();snapshot();const end=c.start+clipLength(c),length=clipLength(c);clips=clips.filter(item=>item.id!==c.id);if(c.track===0)for(const item of clips)if(item.track===0&&item.start>=end-.001)item.start=Math.max(0,item.start-length);selected=null;render();setPosition(Math.min(playhead,duration()));};
split=function(){const c=chosen(),found=c&&playhead>=c.start&&playhead<c.start+clipLength(c)?{c,offset:playhead-c.start}:locate(playhead);if(!found||found.offset<.05||clipLength(found.c)-found.offset<.05)return toast('Place the playhead inside a clip to split it.');pause();snapshot();const cut=found.c.in+found.offset*(found.c.speed||1),right={...found.c,id:uid(),in:cut,start:playhead};found.c.out=cut;clips.push(right);selected=right.id;render();setPosition(playhead);};
$('split').onclick=()=>split();$('delete').onclick=()=>removeSelected();
applyClipSpeed=function(value){const c=clips.find(c=>c.id===menuClip);if(!c||!Number.isFinite(value)||value<.1||value>16)return;const offset=Math.max(0,Math.min(clipLength(c),playhead-c.start))*(c.speed||1),end=c.start+clipLength(c),before=clipLength(c);pause();snapshot();c.speed=value;const delta=clipLength(c)-before;for(const item of clips)if(item.id!==c.id&&item.track===c.track&&item.start>=end-.001)item.start=Math.max(0,item.start+delta);selected=c.id;render();setPosition(c.start+offset/value);toast(`Clip speed set to ${value}×`);};
duplicateSelected=function(){const c=chosen();if(!c)return;pause();snapshot();const copy={...c,id:uid()};insertClipAt(copy,c.track,c.start+clipLength(c));selected=copy.id;selectionKind='video';render();};
pasteTimelineClip=function(){if(!clipClipboard)return toast('Copy a clip first.');pause();layoutClips();snapshot();const track=chosen()?.track??clipClipboard.track??0,at=playhead,length=clipLength(clipClipboard),crossing=clips.find(c=>c.track===track&&at>c.start+.001&&at<c.start+clipLength(c)-.001);if(crossing){const cut=crossing.in+(at-crossing.start)*(crossing.speed||1),right={...crossing,id:uid(),in:cut,start:at};crossing.out=cut;clips.push(right);}const pasted={...structuredClone(clipClipboard),id:uid()};insertClipAt(pasted,track,at);selected=pasted.id;selectionKind='video';render();setPosition(pasted.start);toast(track===0?'Clip inserted in the main sequence.':'Clip inserted at the playhead.');};
trimToPlayhead=function(side){const c=chosen();if(!c||playhead<=c.start||playhead>=c.start+clipLength(c))return toast('Place the playhead inside the selected video.');const cut=c.in+(playhead-c.start)*(c.speed||1);if(cut-c.in<.05||c.out-cut<.05)return;pause();snapshot();const oldEnd=c.start+clipLength(c),oldLength=clipLength(c);if(side==='left'){c.in=cut;if(c.track!==0)c.start=playhead;}else c.out=cut;if(c.track===0){const delta=clipLength(c)-oldLength;for(const item of clips)if(item.id!==c.id&&item.track===0&&item.start>=oldEnd-.001)item.start+=delta;if(side==='left')playhead=c.start;}render();setPosition(Math.min(playhead,duration()));};
seekClipBoundary=function(direction){const points=[...new Set([0,...clips.flatMap(c=>[c.start,c.start+clipLength(c)]),duration()])].sort((a,b)=>a-b);pause();setPosition(direction>0?points.find(t=>t>playhead+.02)??duration():points.filter(t=>t<playhead-.02).pop()??0);};
$('previous').onclick=()=>seekClipBoundary(-1);$('next').onclick=()=>seekClipBoundary(1);

// Pure placement planning is shared by the drag indicator and the actual drop.
function planClipMove(id,track,time,targetId=null,after=false){const result=clips.map(c=>({...c})),c=result.find(c=>c.id===id);if(!c)return null;const before={...c},length=clipLength(c);let target=result.find(x=>x.id===targetId&&x.id!==id);let start=Math.max(0,time);
  const remaining=result.filter(x=>x.id!==id);if(before.track===0)for(const item of remaining)if(item.track===0&&item.start>=before.start+length-.001)item.start=Math.max(0,item.start-length);
  packMainTrack(remaining);
  if(track===0){const lane=remaining.filter(x=>x.track===0).sort((a,b)=>a.start-b.start);let index=target?lane.indexOf(target)+(after?1:0):lane.findIndex(x=>time<x.start+clipLength(x)/2);if(index<0)index=lane.length;lane.splice(index,0,c);let end=0;for(const item of lane){item.track=0;item.start=end;end+=clipLength(item);}return {clips:[...remaining,c],start:c.start,track};}
  if(target)start=target.start+(after?clipLength(target):0);
  else{const collision=remaining.find(x=>x.track===track&&start<x.start+clipLength(x)-.001&&start+length>x.start+.001);if(collision){target=collision;start=start<collision.start+clipLength(collision)/2?collision.start:collision.start+clipLength(collision);}}
  if(target)for(const item of remaining)if(item.track===track&&item.start>=start-.001)item.start+=length;
  c.track=track;c.start=Math.max(0,start);return {clips:packMainTrack([...remaining,c]),start:c.start,track};
}
reorder=function(direction){const c=chosen();if(!c)return;const lane=clips.filter(x=>x.track===c.track).sort((a,b)=>a.start-b.start),index=lane.indexOf(c),target=lane[index+direction];if(!target)return;pause();snapshot();clips=planClipMove(c.id,c.track,0,target.id,direction>0).clips;render();setPosition(chosen().start);};
$('moveLeft').onclick=()=>reorder(-1);$('moveRight').onclick=()=>reorder(1);
const layerMenuClick=$('clipMenu').onclick;$('clipMenu').onclick=event=>{if(event.target.closest('[data-action]')?.dataset.action==='duplicate'){selected=menuClip;closeMenu();duplicateSelected();return;}return layerMenuClick(event);};

const addLayer=document.createElement('button');addLayer.id='addVideoLayer';addLayer.className='layer-button';addLayer.textContent='＋ Video track';addLayer.onclick=()=>{layerCount++;render();toast('New track added. Drag a clip onto it.');};document.querySelector('.timeline-toolbar .tools').append(addLayer);
const dropMarker=document.createElement('div');dropMarker.id='layerDropMarker';dropMarker.hidden=true;$('timelineCanvas').append(dropMarker);
function clearDropMarker(){dropMarker.hidden=true;document.querySelectorAll('.drop-lane').forEach(el=>el.classList.remove('drop-lane'));document.body.classList.remove('dragging-clip');}
function placementFromPointer(x,y,id,grab=0){const canvas=$('timelineCanvas').getBoundingClientRect(),lanes=[...document.querySelectorAll('.video-lane')];let lane=lanes.find(el=>{const r=el.getBoundingClientRect();return y>=r.top&&y<=r.bottom;}),track;
  const newZone=document.querySelector('.new-track-zone').getBoundingClientRect();if(y>=newZone.top-14&&y<newZone.bottom){track=layerCount;}else if(lane)track=Number(lane.dataset.layer);else return null;
  const over=document.elementFromPoint(x,y)?.closest('.clip'),target=over&&over.dataset.id!==id?clips.find(c=>c.id===over.dataset.id):null;let time=Math.max(0,(x-canvas.left)/scale-(track===0?0:grab));
  if(!target){const snap=[0,playhead,...clips.filter(c=>c.id!==id).flatMap(c=>[c.start,c.start+clipLength(c)])].sort((a,b)=>Math.abs(a-time)-Math.abs(b-time))[0];if(Math.abs(snap-time)*scale<9)time=snap;}
  const after=target?(x-over.getBoundingClientRect().left)>over.getBoundingClientRect().width/2:false;return {track,time,targetId:target?.id||null,after,lane,top:lane?lane.offsetTop+$('videoTrack').offsetTop:newZone.top-canvas.top};
}
function drawDrop(plan,placement,length){clearDropMarker();document.body.classList.add('dragging-clip');placement.lane?.classList.add('drop-lane');dropMarker.hidden=false;dropMarker.style.left=plan.start*scale+'px';dropMarker.style.top=placement.top+'px';dropMarker.style.width=Math.max(5,length*scale)+'px';dropMarker.textContent=`${placement.track>=layerCount?'New track':'Video '+(placement.track+1)} · ${fmt(plan.start)}`;}
$('videoTrack').onpointerdown=event=>{
  if(event.button!==0)return;const el=event.target.closest('.clip');if(!el)return;event.preventDefault();pause();closeMenu();timelineViewport.focus({preventScroll:true});selected=el.dataset.id;selectionKind='video';const c=chosen(),initial={...c},initialClips=clips.map(item=>({...item})),initialUndo=[...undoStack],initialRedo=[...redoStack],edge=event.target.closest('[data-edge]')?.dataset.edge,x=event.clientX,y=event.clientY,grab=(x-$('timelineCanvas').getBoundingClientRect().left)/scale-c.start;let moved=false,placement=null,plan=null,committed=false;
  const move=ev=>{if(!moved&&Math.hypot(ev.clientX-x,ev.clientY-y)<5)return;if(!moved){moved=true;if(edge){snapshot();committed=true;}}
    if(edge){const delta=(ev.clientX-x)/scale,speed=initial.speed||1;
      if(c.track===0){
        if(edge==='in')c.in=Math.max(0,Math.min(initial.out-.05*speed,initial.in+delta*speed));
        else c.out=Math.max(initial.in+.05*speed,Math.min(source(c).duration,initial.out+delta*speed));
        // Keep the original sequence order as trims ripple later clips.
        for(const item of clips)if(item.track===0)item.start=initialClips.find(x=>x.id===item.id).start;
        packMainTrack(clips);
      }else if(edge==='in'){const earlier=clips.filter(a=>a.id!==c.id&&a.track===c.track&&a.start<initial.start).reduce((n,a)=>Math.max(n,a.start+clipLength(a)),0),change=Math.max(-initial.in/speed,earlier-initial.start,Math.min(clipLength(initial)-.05,delta));c.in=initial.in+change*speed;c.start=initial.start+change;
      }else{const next=clips.filter(a=>a.id!==c.id&&a.track===c.track&&a.start>initial.start).reduce((n,a)=>Math.min(n,a.start),Infinity);c.out=Math.max(initial.in+.05*speed,Math.min(source(c).duration,initial.out+delta*speed,initial.in+(next-initial.start)*speed));}
      render();setPosition(c.start);return;}
    const viewport=timelineViewport.getBoundingClientRect();if(ev.clientX>viewport.right-35)timelineViewport.scrollLeft+=18;else if(ev.clientX<viewport.left+35)timelineViewport.scrollLeft-=18;
    placement=placementFromPointer(ev.clientX,ev.clientY,c.id,grab);plan=placement?planClipMove(c.id,placement.track,placement.time,placement.targetId,placement.after):null;if(plan)drawDrop(plan,placement,clipLength(c));else clearDropMarker();
  };
  const done=ev=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',done);window.removeEventListener('pointercancel',cancel);if(moved&&!edge&&plan){snapshot();clips=plan.clips;layerCount=Math.max(layerCount,plan.track+1);render();setPosition(plan.start);toast(`Moved to Video ${plan.track+1}`);}else if(!moved){render();}clearDropMarker();dragState=null;};
  const cancel=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',done);window.removeEventListener('pointercancel',cancel);if(committed){clips=initialClips;undoStack=initialUndo;redoStack=initialRedo;render();}clearDropMarker();dragState=null;};
  dragState={cancel};window.addEventListener('pointermove',move);window.addEventListener('pointerup',done);window.addEventListener('pointercancel',cancel);
};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dragState){event.preventDefault();event.stopImmediatePropagation();dragState.cancel();}},{capture:true});
const renderLibraryBeforeLayers=renderLibrary;renderLibrary=function(){renderLibraryBeforeLayers();for(const card of document.querySelectorAll('.media-card')){card.draggable=true;card.dataset.mediaDrag=card.querySelector('[data-media]').dataset.media;card.title='Drag onto a video track, or click + to append';}};
$('mediaList').addEventListener('dragstart',event=>{const card=event.target.closest('[data-media-drag]');if(!card)return;libraryDragMedia=card.dataset.mediaDrag;event.dataTransfer.setData('text/x-cute-cut-media',libraryDragMedia);event.dataTransfer.effectAllowed='copy';});
$('mediaList').addEventListener('dragend',()=>{libraryDragMedia=null;clearDropMarker();});
$('videoTrack').addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
$('videoTrack').addEventListener('drop',async event=>{if(!event.dataTransfer?.files.length)return;event.preventDefault();event.stopPropagation();const placement=placementFromPointer(event.clientX,event.clientY,null);if(!placement)return;const previous=library.length,wasEmpty=clips.length===0;await importFiles([...event.dataTransfer.files]);const imported=library.slice(previous);if(!imported.length)return;if(wasEmpty)clips=clips.filter(c=>!imported.some(m=>m.id===c.mediaId));snapshot();let at=placement.time;for(const m of imported){const c={id:uid(),mediaId:m.id,in:0,out:m.duration,volume:1,audioTrack:0};insertClipAt(c,placement.track,at);selected=c.id;at+=m.duration;}layerCount=Math.max(layerCount,placement.track+1);render();setPosition(chosen()?.start??placement.time);});
$('videoTrack').addEventListener('dragover',event=>{if(!libraryDragMedia)return;event.preventDefault();const placement=placementFromPointer(event.clientX,event.clientY,null);if(!placement)return;const m=library.find(x=>x.id===libraryDragMedia);const start=placement.targetId?clips.find(c=>c.id===placement.targetId).start+(placement.after?clipLength(clips.find(c=>c.id===placement.targetId)):0):placement.time;drawDrop({start:placement.track===0?Math.min(start,clips.filter(c=>c.track===0).reduce((sum,c)=>sum+clipLength(c),0)):start},placement,m.duration);});
$('videoTrack').addEventListener('drop',event=>{if(!libraryDragMedia)return;event.preventDefault();event.stopPropagation();const placement=placementFromPointer(event.clientX,event.clientY,null);if(placement){pause();snapshot();const m=library.find(x=>x.id===libraryDragMedia),c={id:uid(),mediaId:m.id,in:0,out:m.duration,volume:1,audioTrack:0},target=clips.find(x=>x.id===placement.targetId),start=target?target.start+(placement.after?clipLength(target):0):placement.time;insertClipAt(c,placement.track,start);selected=c.id;selectionKind='video';layerCount=Math.max(layerCount,placement.track+1);render();setPosition(c.start);}libraryDragMedia=null;clearDropMarker();});
const resetBeforeLayers=$('resetDemo').onclick;$('resetDemo').onclick=()=>{pause();layerCount=1;resetBeforeLayers();render();};
const oldSplitClick=$('split').onclick;$('split').onclick=()=>split();
for(const id of ['trimIn','trimOut'])$(id).onchange=()=>{const c=chosen();if(!c)return;const a=Number($('trimIn').value),raw=Number($('trimOut').value),b=Math.min(raw,source(c).duration);if(!Number.isFinite(a)||!Number.isFinite(raw)||a<0||raw>source(c).duration+.0051||b-a<.05){settings();return toast('Keep trim points inside the original video.');}const oldEnd=c.start+clipLength(c),oldLength=clipLength(c),newLength=(b-a)/(c.speed||1),next=clips.filter(x=>x.id!==c.id&&x.track===c.track&&x.start>c.start).reduce((n,x)=>Math.min(n,x.start),Infinity);if(c.track!==0&&c.start+newLength>next+.001){settings();return toast('Move the following clip to make room for a longer trim.');}pause();snapshot();c.in=a;c.out=b;if(c.track===0)for(const item of clips)if(item.id!==c.id&&item.track===0&&item.start>=oldEnd-.001)item.start+=newLength-oldLength;render();setPosition(Math.min(playhead,duration()));};
timelineViewport.addEventListener('scroll',()=>{document.querySelector('.track-labels').style.transform=`translateY(${-timelineViewport.scrollTop}px)`;});
// Seek from empty lanes and background, while retaining clip and scrollbar gestures.
let finishTimelineSeek=null;
function deselectTimelineClip(){
  selected=null;selectionKind='video';closeMenu();
  for(const el of document.querySelectorAll('.clip.selected,.audio-clip.audio-selected'))el.classList.remove('selected','audio-selected');
  for(const id of ['delete','moveLeft','moveRight'])$(id).disabled=true;
  settings();
}
const PLAYHEAD_SNAP_PX=5,PLAYHEAD_RELEASE_PX=7;
function nearbyClipEdge(time,edges,locked=null){
  if(locked!==null&&Math.abs(time-locked)*scale<=PLAYHEAD_RELEASE_PX)return locked;
  let nearest=null,distance=PLAYHEAD_SNAP_PX;
  for(const edge of edges){const pixels=Math.abs(time-edge)*scale;if(pixels<=distance){nearest=edge;distance=pixels;}}
  return nearest;
}
function seekTimelineFromPointer(event){
  if(event.button!==0)return;
  const bounds=timelineViewport.getBoundingClientRect();
  if(event.clientX<bounds.left||event.clientX>=bounds.left+timelineViewport.clientWidth||event.clientY>=bounds.top+timelineViewport.clientHeight)return;
  event.preventDefault();finishTimelineSeek?.();pause();closeMenu();timelineViewport.focus({preventScroll:true});
  if(!event.target.closest('#playhead'))deselectTimelineClip();
  let pointerX=event.clientX,frame=0,lastTime=performance.now(),dragging=false;
  // Extracted audio follows its video's placement and trim, so these edges
  // cover every visible video/audio start and end, including overlay tracks.
  layoutClips();const edges=[...new Set(clips.flatMap(c=>[c.start,c.start+clipLength(c)]))];let snappedEdge=null;
  const originX=event.clientX,originY=event.clientY;
  const seek=()=>{const viewport=timelineViewport.getBoundingClientRect(),box=$('timelineCanvas').getBoundingClientRect(),x=Math.max(viewport.left,Math.min(viewport.left+timelineViewport.clientWidth-1,pointerX)),time=(x-box.left)/scale;snappedEdge=nearbyClipEdge(time,edges,snappedEdge);$('playhead').classList.toggle('snapped-to-edge',snappedEdge!==null);setPosition(snappedEdge??time,true,true);};
  const move=ev=>{pointerX=ev.clientX;if(Math.hypot(ev.clientX-originX,ev.clientY-originY)>3)dragging=true;seek();};
  const animate=now=>{
    const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;
    if(dragging){const viewport=timelineViewport.getBoundingClientRect(),width=timelineViewport.clientWidth,edge=Math.min(70,width/4),x=pointerX-viewport.left;
      const direction=x<edge?-Math.min(1,(edge-x)/edge):x>width-edge?Math.min(1,(x-width+edge)/edge):0;
      if(direction){const before=timelineViewport.scrollLeft;timelineViewport.scrollLeft+=direction*900*dt;if(timelineViewport.scrollLeft!==before)seek();}
    }
    frame=requestAnimationFrame(animate);
  };
  const finish=()=>{cancelAnimationFrame(frame);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);window.removeEventListener('blur',finish);$('playhead').classList.remove('snapped-to-edge');finishTimelineSeek=null;};
  finishTimelineSeek=finish;seek();window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);window.addEventListener('blur',finish);frame=requestAnimationFrame(animate);
}
$('ruler').onpointerdown=seekTimelineFromPointer;
$('playhead').firstElementChild.title='Drag to seek · Snaps only very close to clip edges';
timelineViewport.addEventListener('pointerdown',event=>{if(event.target.closest('#ruler,.clip,.audio-clip,[data-edge],button,input,textarea,a'))return;seekTimelineFromPointer(event);});
document.querySelector('.track-labels').addEventListener('pointerdown',event=>{if(event.button===0)deselectTimelineClip();});
document.querySelector('footer>span:last-child').textContent='Video 1 stays connected · Upper tracks allow gaps · Drag clips to reorder or stack · Ctrl+B split · Space play';
render();
