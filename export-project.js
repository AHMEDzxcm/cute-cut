'use strict';
let exportBusy=false,exportCancelled=false,exportCanvasSize=null,exportURL=null;
const cancelExport=document.createElement('button');cancelExport.id='cancelProjectExport';cancelExport.className='secondary';cancelExport.textContent='Cancel export';cancelExport.hidden=true;$('exportDialog').append(cancelExport);cancelExport.onclick=()=>{exportCancelled=true;cancelExport.disabled=true;cancelExport.textContent='Stopping…';};
const renderBeforeProjectExport=render;render=function(){renderBeforeProjectExport();$('export').disabled=!clips.length||exportBusy;$('export').title='Export your edited timeline as MP4';$('export').innerHTML='Export video <span>↗</span>';};
const playBeforeProjectExport=togglePlay;togglePlay=function(){if(!exportBusy)playBeforeProjectExport();};
async function waitForExportFrame(el,target){const deadline=performance.now()+20000;while(true){if(exportCancelled)throw Error('Export cancelled.');const state=previewDecoder(el);if(el.error)throw Error('This video format cannot be decoded by your browser. Try an H.264 MP4.');if(el.readyState>=2&&!el.seeking&&state.target===null&&!state.raf&&Math.abs(el.currentTime-target)<.035)return;if(performance.now()>deadline)throw Error('A video frame could not be decoded. Try converting that recording to H.264 MP4.');await new Promise(resolve=>setTimeout(resolve,10));}}
async function renderExportFrame(time){
  setPosition(time,true,true);paintComposition();const active=visibleClips(time),top=active[0];
  await Promise.all(active.map(c=>{const el=c.id===top?.id?video:visualSources.get(c.id);return waitForExportFrame(el,c.in+(time-c.start)*(c.speed||1));}));
  paintComposition();return new Promise((resolve,reject)=>compositionCanvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not render a video frame.')),'image/jpeg',.94));
}
$('export').onclick=async()=>{
  if(exportBusy||!clips.length)return;pause();layoutClips();const before=playhead,total=duration(),frameCount=Math.ceil(total*30),pixels=projectPixels(),limit=Math.min(1,1920/Math.max(pixels.width,pixels.height));
  exportBusy=true;exportCancelled=false;exportCanvasSize={width:Math.max(2,Math.round(pixels.width*limit/2)*2),height:Math.max(2,Math.round(pixels.height*limit/2)*2)};
  let session=null;const dialog=$('exportDialog');$('exportTitle').textContent='Rendering your edit';$('exportDescription').textContent='Layers, effects and audio are rendered on your device. Keep this tab open; longer projects take longer.';$('download').hidden=true;$('closeExport').hidden=true;cancelExport.hidden=false;cancelExport.disabled=false;cancelExport.textContent='Cancel export';$('exportProgress').value=0;$('exportPercent').textContent='0%';dialog.showModal();render();
  try{
    session=await request('/api/render/start',{method:'POST',body:{clips:structuredClone(clips)}});let frames=[];
    for(let frame=0;frame<frameCount;frame++){
      if(exportCancelled)throw Error('Export cancelled.');
      while(document.hidden){if(exportCancelled)throw Error('Export cancelled.');await new Promise(resolve=>setTimeout(resolve,100));}
      frames.push(await renderExportFrame(Math.min(total-.000001,frame/30)));
      if(frames.length===60||frame===frameCount-1){await request('/api/render/chunk',{method:'POST',body:{id:session.id,frames}});frames=[];}
      const progress=Math.floor((frame+1)/frameCount*90);$('exportProgress').value=progress;$('exportPercent').textContent=progress+'%';
    }
    if(exportCancelled)throw Error('Export cancelled.');cancelExport.hidden=true;$('exportDescription').textContent='Finishing the MP4 and mixing your selected audio tracks…';
    let job=await request('/api/render/finish',{method:'POST',body:{id:session.id}});
    while(job.status==='running'){await new Promise(resolve=>setTimeout(resolve,200));job=await request('/api/job/'+job.id);$('exportProgress').value=90+job.progress/10;$('exportPercent').textContent=Math.floor(90+job.progress/10)+'%';}
    if(job.status==='error')throw Error(job.error);if(exportURL)URL.revokeObjectURL(exportURL);exportURL=job.url;$('download').href=exportURL;$('download').download=($('projectName').value.trim()||'Cute-Cut-export')+'.mp4';$('download').hidden=false;$('exportTitle').textContent='Your cut is ready.';$('exportDescription').textContent=`MP4 · ${exportCanvasSize.width} × ${exportCanvasSize.height} · 30 fps · Saved privately on your device`;$('exportProgress').value=100;$('exportPercent').textContent='100%';
  }catch(error){if(session)await request('/api/render/abort',{method:'POST',body:{id:session.id}}).catch(()=>{});$('exportTitle').textContent=exportCancelled?'Export cancelled':'Export interrupted';$('exportDescription').textContent=error.message;
  }finally{exportBusy=false;exportCanvasSize=null;cancelExport.hidden=true;$('closeExport').hidden=false;setPosition(before,true,true);render();}
};
render();
