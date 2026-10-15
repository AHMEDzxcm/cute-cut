'use strict';
let canvasRatio='original',transformGesture=null;
const ratioPresets=[['original','Original'],['16:9','16:9 · Landscape'],['9:16','9:16 · Portrait'],['1:1','1:1 · Square'],['4:5','4:5 · Portrait'],['4:3','4:3 · Classic'],['3:4','3:4 · Portrait'],['21:9','21:9 · Wide']];
const stage=$('dropZone'),composition=document.createElement('div');composition.id='composition';
composition.innerHTML='<canvas id="compositionCanvas" aria-label="Video canvas"></canvas><div id="transformBox" hidden><span class="transform-label">Drag to move</span>'+['nw','ne','se','sw'].map(c=>`<button class="transform-handle ${c}" data-transform="${c}" aria-label="Resize ${c} corner"></button>`).join('')+'<button class="rotate-handle" data-transform="rotate" aria-label="Rotate clip">↻</button></div><div id="centerGuideX" hidden></div><div id="centerGuideY" hidden></div>';
stage.prepend(composition);
const ratioControl=document.createElement('label');ratioControl.className='ratio-control';ratioControl.innerHTML='<span>Canvas ratio</span><select id="canvasRatio" aria-label="Canvas aspect ratio">'+ratioPresets.map(([v,label])=>`<option value="${v}">${label}</option>`).join('')+'</select>';
document.querySelector('.viewer-head').append(ratioControl);
const transformSettings=document.createElement('div');transformSettings.id='transformSettings';transformSettings.innerHTML='<div class="divider"></div><label class="section-label">TRANSFORM</label><div class="transform-fields"><label>Scale %<input id="clipScale" type="number" min="5" max="1000" step="1"></label><label>Rotation °<input id="clipRotation" type="number" step="1"></label></div><div class="transform-actions"><button id="fitClip">Fit</button><button id="fillClip">Fill</button><button id="resetTransform">Reset</button></div><p class="tip">Drag the video to move it. Drag a corner to resize, or the round handle to rotate.</p>';
$('settings').append(transformSettings);
const compositionCanvas=$('compositionCanvas'),context=compositionCanvas.getContext('2d'),transformBox=$('transformBox'),visualSources=new Map();
function transformOf(c){const base={x:0,y:0,scale:1,rotation:0,...c.transform};base.scaleY??=base.scale;return typeof animatedTransform==='function'?animatedTransform(c,base):base;}
function projectAspect(){if(canvasRatio!=='original'){const [w,h]=canvasRatio.split(':').map(Number);return w/h;}const m=source(clips.find(c=>c.track===0)||clips[0]||{})||library[0];return m?.width&&m?.height?m.width/m.height:16/9;}
function fitComposition(){const w=stage.clientWidth-40,h=stage.clientHeight-40,aspect=projectAspect(),width=Math.max(1,Math.min(w,h*aspect)),height=width/aspect;if(composition.style.width!==width+'px')composition.style.width=width+'px';if(composition.style.height!==height+'px')composition.style.height=height+'px';const dpr=Math.min(2,window.devicePixelRatio||1),raster=typeof exportCanvasSize==='object'&&exportCanvasSize,pxWidth=raster?raster.width:Math.round(width*dpr),pxHeight=raster?raster.height:Math.round(height*dpr);if(compositionCanvas.width!==pxWidth||compositionCanvas.height!==pxHeight){compositionCanvas.width=pxWidth;compositionCanvas.height=pxHeight;}}
function geometry(c){const m=source(c),w=composition.clientWidth,h=composition.clientHeight,k=Math.min(w/m.width,h/m.height),t=transformOf(c);return {x:w*(.5+t.x),y:h*(.5+t.y),w:m.width*k*t.scale,h:m.height*k*t.scaleY,angle:t.rotation*Math.PI/180};}
function updateTransformSettings(){const c=chosen();transformSettings.hidden=!c||selectionKind==='audio';if(c){const t=transformOf(c);if(document.activeElement!==$('clipScale'))$('clipScale').value=+(t.scale*100).toFixed(2);if(document.activeElement!==$('clipRotation'))$('clipRotation').value=+t.rotation.toFixed(2);}}
const compositionBuffer=document.createElement('canvas'),bufferContext=compositionBuffer.getContext('2d');
let lastCompositionSignature='',lastPanelRefresh=0;
function paintComposition(){
  fitComposition();const w=composition.clientWidth,h=composition.clientHeight;
  let active=visibleClips(playhead).reverse();if(!active.length&&Math.abs(playhead-duration())<.0001){const last=locate(playhead);if(last)active=[last.c];}
  const top=active.at(-1),ids=new Set(active.map(c=>c.id)),frames=[];
  // Keep decoders warm across clip boundaries, rather than unloading them on every seek.
  for(const [id,el]of visualSources)if(!ids.has(id)||id===top?.id){el.pause();if(!clips.some(c=>c.id===id)){el.removeAttribute('src');el.load();visualSources.delete(id);}}
  for(const c of active){if(source(c).still){const item=stillImageFor(source(c));frames.push({c,frame:item.ready?{image:item.image,time:0,revision:1}:null,g:geometry(c)});continue;}let el=c.id===top?.id?video:visualSources.get(c.id);if(!el){el=document.createElement('video');el.muted=true;el.playsInline=true;el.preload='auto';el.src=CuteEngine.mediaURL(c.mediaId);visualSources.set(c.id,el);}
    if(el!==video){el.playbackRate=c.speed||1;const target=clipMediaTime(c,playhead);if(Math.abs(el.currentTime-target)>.04)seekPreviewVideo(el,target);if(playing&&el.paused)el.play().catch(()=>{});else if(!playing&&!el.paused)el.pause();}
    const frame=decodedPreviewFrame(el);frames.push({c,el,frame,g:geometry(c)});
  }
  // Never clear the visible canvas for a pending decoder. Commit a complete
  // composition only when every visible layer has a decoded frame to show.
  if(frames.every(item=>item.frame)){
    const signature=JSON.stringify([compositionCanvas.width,compositionCanvas.height,...frames.map(({c,el,frame,g})=>[c.id,el?.src||source(c).url,frame.time,frame.revision,g,c.chroma,c.mask])]);
    if(signature!==lastCompositionSignature){
      if(compositionBuffer.width!==compositionCanvas.width||compositionBuffer.height!==compositionCanvas.height){compositionBuffer.width=compositionCanvas.width;compositionBuffer.height=compositionCanvas.height;}
      bufferContext.setTransform(compositionBuffer.width/w,0,0,compositionBuffer.height/h,0,0);bufferContext.fillStyle='#080a0a';bufferContext.fillRect(0,0,w,h);
      for(const {c,frame,g}of frames){bufferContext.save();bufferContext.translate(g.x,g.y);bufferContext.rotate(g.angle);if(typeof drawClipEffects==='function')drawClipEffects(bufferContext,frame.image,c,g,frame.time);else bufferContext.drawImage(frame.image,-g.w/2,-g.h/2,g.w,g.h);bufferContext.restore();}
      context.setTransform(1,0,0,1,0,0);context.drawImage(compositionBuffer,0,0);lastCompositionSignature=signature;
    }
  }
  // Bound the warm decoder cache on projects with many cuts/layers.
  for(const [id,el]of visualSources){if(visualSources.size<=8)break;if(!ids.has(id)){el.pause();el.removeAttribute('src');el.load();visualSources.delete(id);}}
  const selectedClip=chosen(),show=selectedClip&&ids.has(selectedClip.id)&&selectionKind==='video';transformBox.hidden=!show;
  if(show){const g=geometry(selectedClip),signature=JSON.stringify(g);if(transformBox.dataset.geometry!==signature){Object.assign(transformBox.style,{left:g.x+'px',top:g.y+'px',width:g.w+'px',height:g.h+'px',transform:'translate(-50%,-50%) rotate('+g.angle+'rad)'});transformBox.dataset.geometry=signature;}}
  composition.hidden=!clips.length;if($('canvasRatio').value!==canvasRatio)$('canvasRatio').value=canvasRatio;
  const now=performance.now();if(typeof updateBasicPanel==='function'&&now-lastPanelRefresh>100){lastPanelRefresh=now;updateBasicPanel();}
}
function compositionFrame(){paintComposition();requestAnimationFrame(compositionFrame);}requestAnimationFrame(compositionFrame);
const settingsBeforeComposition=settings;settings=function(){settingsBeforeComposition();updateTransformSettings();};
// Project ratio and clip transforms travel together through the same undo stack.
snapshot=function(){undoStack.push(JSON.stringify({clips,canvasRatio}));if(undoStack.length>100)undoStack.shift();redoStack=[];};
history=function(redo){transformGesture?.cancel();const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack;if(!from.length)return;pause();to.push(JSON.stringify({clips,canvasRatio}));const state=JSON.parse(from.pop());clips=Array.isArray(state)?state:state.clips;canvasRatio=Array.isArray(state)?canvasRatio:state.canvasRatio||'original';if(!chosen())selected=clips[0]?.id||null;render();setPosition(playhead,true,true);};
$('canvasRatio').onchange=()=>{pause();snapshot();canvasRatio=$('canvasRatio').value;render();};
function commitTransform(fn){const c=chosen();if(!c)return;pause();snapshot();const t=fn(transformOf(c),c);if(typeof writeClipTransform==='function')writeClipTransform(c,t);else c.transform=t;render();}
$('clipScale').onchange=()=>{const n=Number($('clipScale').value);if(!Number.isFinite(n)||n<5||n>1000)return updateTransformSettings();commitTransform(t=>({...t,scale:n/100}));};
$('clipRotation').onchange=()=>{const n=Number($('clipRotation').value);if(!Number.isFinite(n))return updateTransformSettings();commitTransform(t=>({...t,rotation:((n%360)+540)%360-180}));};
$('resetTransform').onclick=() =>commitTransform(()=>({x:0,y:0,scale:1,rotation:0}));
$('fitClip').onclick=$('resetTransform').onclick;
$('fillClip').onclick=()=>commitTransform((t,c)=>{const g=geometry({...c,transform:{scale:1,rotation:0,x:0,y:0}});return {x:0,y:0,rotation:0,scale:Math.max(composition.clientWidth/g.w,composition.clientHeight/g.h)};});
function localPoint(event){const box=composition.getBoundingClientRect();return {x:event.clientX-box.left,y:event.clientY-box.top};}
function hitClip(c,p){const g=geometry(c),dx=p.x-g.x,dy=p.y-g.y,x=dx*Math.cos(g.angle)+dy*Math.sin(g.angle),y=-dx*Math.sin(g.angle)+dy*Math.cos(g.angle);return Math.abs(x)<=g.w/2&&Math.abs(y)<=g.h/2;}
composition.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;const point=localPoint(event),handle=event.target.closest('[data-transform]')?.dataset.transform,active=visibleClips(playhead),c=handle?chosen():active.find(c=>hitClip(c,point));if(!c)return;
  event.preventDefault();pause();selected=c.id;selectionKind='video';settings();const initial=transformOf(c),g=geometry(c),beforeUndo=[...undoStack],beforeRedo=[...redoStack],hadTransform=Object.hasOwn(c,'transform'),originalTransform=structuredClone(c.transform),originalKeys=structuredClone(c.transformKeyframes);let changed=false;
  const startAngle=Math.atan2(point.y-g.y,point.x-g.x),startDistance=Math.max(1,Math.hypot(point.x-g.x,point.y-g.y));
  const move=ev=>{const p=localPoint(ev),dx=p.x-point.x,dy=p.y-point.y;if(!changed&&Math.hypot(dx,dy)<3)return;if(!changed){snapshot();changed=true;}
    const t={...initial};$('centerGuideX').hidden=$('centerGuideY').hidden=true;
    if(handle==='rotate')t.rotation=initial.rotation+(Math.atan2(p.y-g.y,p.x-g.x)-startAngle)*180/Math.PI;
    else if(handle){const factor=Math.hypot(p.x-g.x,p.y-g.y)/startDistance;t.scale=Math.max(.05,Math.min(10,initial.scale*factor));t.scaleY=Math.max(.05,Math.min(10,initial.scaleY*factor));if(c.uniformScale===false){const dx=p.x-g.x,dy=p.y-g.y;t.scale=Math.max(.05,Math.min(10,initial.scale*Math.abs(dx*Math.cos(g.angle)+dy*Math.sin(g.angle))/(g.w/2)));t.scaleY=Math.max(.05,Math.min(10,initial.scaleY*Math.abs(-dx*Math.sin(g.angle)+dy*Math.cos(g.angle))/(g.h/2)));}}
    else{t.x+=dx/composition.clientWidth;t.y+=dy/composition.clientHeight;if(Math.abs(t.x)*composition.clientWidth<6){t.x=0;$('centerGuideX').hidden=false;}if(Math.abs(t.y)*composition.clientHeight<6){t.y=0;$('centerGuideY').hidden=false;}}
    if(ev.shiftKey&&handle==='rotate')t.rotation=Math.round(t.rotation/15)*15;if(typeof writeClipTransform==='function')writeClipTransform(c,t);else c.transform=t;updateTransformSettings();
  };
  const finish=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);$('centerGuideX').hidden=$('centerGuideY').hidden=true;transformGesture=null;render();};
  const cancel=()=>{if(changed){if(hadTransform)c.transform=originalTransform;else delete c.transform;if(originalKeys)c.transformKeyframes=originalKeys;else delete c.transformKeyframes;undoStack=beforeUndo;redoStack=beforeRedo;}finish();};
  transformGesture={cancel};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&transformGesture){event.preventDefault();transformGesture.cancel();}},{capture:true});
const resetBeforeComposition=$('resetDemo').onclick;$('resetDemo').onclick=()=>{transformGesture?.cancel();canvasRatio='original';resetBeforeComposition();};
new ResizeObserver(fitComposition).observe(stage);
render();
