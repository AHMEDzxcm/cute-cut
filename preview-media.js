'use strict';
// One outstanding seek per decoder. New pointer positions replace the pending
// target instead of repeatedly cancelling the frame the browser is decoding.
const previewDecoders=new WeakMap();
function previewDecoder(el){
  let state=previewDecoders.get(el);if(state)return state;
  state={src:el.src,target:null,raf:0,frame:null,frameTime:null,revision:0};previewDecoders.set(el,state);
  const ready=()=>{rememberPreviewFrame(el);schedulePreviewSeek(el,state);};
  el.addEventListener('seeked',ready);el.addEventListener('loadeddata',ready);el.addEventListener('loadedmetadata',()=>schedulePreviewSeek(el,state));
  return state;
}
function resetPreviewSource(el,state){if(state.src===el.src)return;state.src=el.src;state.target=null;state.frame=null;state.frameTime=null;state.revision++;}
function rememberPreviewFrame(el){
  const state=previewDecoder(el);resetPreviewSource(el,state);
  if(el.readyState<2||el.seeking||!el.videoWidth||state.frameTime===el.currentTime)return;
  const frame=state.frame||document.createElement('canvas'),ratio=Math.min(1,1280/el.videoWidth),w=Math.max(1,Math.round(el.videoWidth*ratio)),h=Math.max(1,Math.round(el.videoHeight*ratio));
  if(frame.width!==w||frame.height!==h){frame.width=w;frame.height=h;}
  frame.getContext('2d').drawImage(el,0,0,w,h);state.frame=frame;state.frameTime=el.currentTime;state.revision++;
}
function schedulePreviewSeek(el,state){
  if(state.raf||state.target===null||el.seeking||el.readyState<1)return;
  state.raf=requestAnimationFrame(()=>{state.raf=0;if(el.seeking||el.readyState<1||state.target===null)return;const target=state.target;state.target=null;if(Math.abs(el.currentTime-target)<1/240)return;rememberPreviewFrame(el);el.currentTime=target;});
}
function seekPreviewVideo(el,target){const state=previewDecoder(el);resetPreviewSource(el,state);state.target=Math.max(0,target);schedulePreviewSeek(el,state);}
function decodedPreviewFrame(el){
  const state=previewDecoder(el);resetPreviewSource(el,state);
  if(el.readyState>=2&&!el.seeking){if(!state.frame)rememberPreviewFrame(el);return {image:el,time:el.currentTime,revision:state.revision};}
  return state.frame?{image:state.frame,time:state.frameTime,revision:state.revision}:null;
}
