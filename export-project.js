'use strict';
let exportBusy=false,exportCancelled=false,exportCanvasSize=null,exportURL=null;
const cancelExport=document.createElement('button');cancelExport.id='cancelProjectExport';cancelExport.className='secondary';cancelExport.textContent='Cancel export';cancelExport.hidden=true;$('exportDialog').append(cancelExport);cancelExport.onclick=()=>{exportCancelled=true;cancelExport.disabled=true;cancelExport.textContent='Stopping…';};
const renderBeforeProjectExport=render;render=function(){renderBeforeProjectExport();$('export').disabled=!clips.length||exportBusy;$('export').title='Choose export settings';$('export').innerHTML='Export video <span>↗</span>';};
const playBeforeProjectExport=togglePlay;togglePlay=function(){if(!exportBusy&&!exportOptionsDialog.open)playBeforeProjectExport();};
async function waitForExportFrame(el,target){const deadline=performance.now()+20000;while(true){if(exportCancelled)throw Error('Export cancelled.');const state=previewDecoder(el);if(el.error)throw Error('This video format cannot be decoded by your browser. Try an H.264 MP4.');if(el.readyState>=2&&!el.seeking&&state.target===null&&!state.raf&&Math.abs(el.currentTime-target)<.035)return;if(performance.now()>deadline)throw Error('A video frame could not be decoded. Try converting that recording to H.264 MP4.');await new Promise(resolve=>setTimeout(resolve,10));}}
async function renderExportFrame(time,raw=false){
  setPosition(time,true,true);paintComposition();const active=visibleClips(time),top=active[0];
  await Promise.all(active.map(async c=>{if(source(c).still){const item=stillImageFor(source(c)),deadline=performance.now()+20000;while(!item.ready){if(exportCancelled)throw Error('Export cancelled.');if(item.error||performance.now()>deadline)throw Error('Could not load the freeze frame.');await new Promise(resolve=>setTimeout(resolve,10));}return;}const el=c.id===top?.id?video:visualSources.get(c.id);return waitForExportFrame(el,clipMediaTime(c,time));}));
  paintComposition();if(raw)return compositionCanvas;return new Promise((resolve,reject)=>compositionCanvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not render a video frame.')),'image/jpeg',.94));
}
function canDirectExport(){let end=0;for(const c of [...clips].sort((a,b)=>a.start-b.start)){const t={x:0,y:0,scale:1,rotation:0,...c.transform};t.scaleY??=t.scale;if(c.track!==0||Math.abs(c.start-end)>.000001||c.transformKeyframes?.length||c.chroma?.enabled||(c.mask?.type&&c.mask.type!=='none')||t.x!==0||t.y!==0||t.scale!==1||t.scaleY!==1||t.rotation!==0)return false;end=c.start+clipLength(c);}return true;}
async function nativeExportConfig(s){
  if(s.codec!=='h264'||typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')return null;
  for(const hardwareAcceleration of ['prefer-hardware','no-preference'])for(const codec of ['avc1.420034','avc1.42002a']){const config={codec,width:s.width,height:s.height,framerate:s.fps,bitrate:s.bitrate,hardwareAcceleration,latencyMode:'realtime',avc:{format:'annexb'}};try{if((await VideoEncoder.isConfigSupported(config)).supported)return config;}catch{}}
  return null;
}
async function exportComposedFrames(session,settings,total,frameCount,config){
  let frames=[],packets=[],encoder=null,encoderError=null,batchCount=0;
  try{
    if(config){encoder=new VideoEncoder({output:chunk=>{const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes);packets.push(bytes);},error:error=>{encoderError=error;}});encoder.configure(config);}
    for(let frame=0;frame<frameCount;frame++){
      if(exportCancelled)throw Error('Export cancelled.');if(encoderError)throw encoderError;
      while(document.hidden){if(exportCancelled)throw Error('Export cancelled.');await new Promise(resolve=>setTimeout(resolve,100));}
      const image=await renderExportFrame(Math.min(total-.000001,frame/settings.fps),!!encoder);
      if(encoder){const vf=new VideoFrame(image,{timestamp:Math.round(frame*1000000/settings.fps),duration:Math.round(1000000/settings.fps)});try{encoder.encode(vf,{keyFrame:batchCount===0});}finally{vf.close();}batchCount++;if(encoder.encodeQueueSize>6)await encoder.flush();}
      else frames.push(image);
      const limit=encoder?120:Math.max(4,Math.min(60,Math.floor(60000000/(settings.width*settings.height))));
      if((encoder?batchCount:frames.length)>=limit||frame===frameCount-1){
        if(encoder){await encoder.flush();if(encoderError)throw encoderError;const bytes=new Uint8Array(packets.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of packets){bytes.set(p,offset);offset+=p.length;}await request('/api/render/encoded',{method:'POST',body:{id:session.id,bytes,frames:batchCount}});packets=[];batchCount=0;}
        else{await request('/api/render/chunk',{method:'POST',body:{id:session.id,frames}});frames=[];}
      }
      const progress=Math.floor((frame+1)/frameCount*90);$('exportProgress').value=progress;$('exportPercent').textContent=progress+'%';
    }
  }finally{if(encoder&&encoder.state!=='closed')encoder.close();}
}
async function startProjectExport(settings){
  if(exportBusy||!clips.length)return;pause();layoutClips();const before=playhead,total=duration(),frameCount=Math.ceil(total*settings.fps);
  exportBusy=true;exportCancelled=false;exportCanvasSize={width:settings.width,height:settings.height};
  let session=null;const dialog=$('exportDialog');$('exportTitle').textContent='Rendering your edit';$('exportDescription').textContent='Layers, effects and audio are rendered on your device. Keep this tab open; longer projects take longer.';$('download').hidden=true;$('closeExport').hidden=true;cancelExport.hidden=false;cancelExport.disabled=false;cancelExport.textContent='Cancel export';$('exportProgress').value=0;$('exportPercent').textContent='0%';dialog.showModal();render();
  try{
    session=await request('/api/render/start',{method:'POST',body:{clips:structuredClone(clips),settings}});
    const direct=canDirectExport(),config=direct?null:await nativeExportConfig(settings);
    window.lastExportPath=direct?'direct':config?'native':'compatible';
    $('exportDescription').textContent=direct?'Fast export · Processing your cuts directly on this device.':config?'Browser encoder · Rendering all layers and effects. Keep this tab visible.':'Compatible renderer · Rendering all layers and effects. Keep this tab visible.';
    try{
      if(direct){const ordered=[...clips].sort((a,b)=>a.start-b.start);for(const c of ordered){if(exportCancelled)throw Error('Export cancelled.');const result=await request('/api/render/direct',{method:'POST',body:{id:session.id,index:clips.indexOf(c)}});const p=Math.floor(result.frames/frameCount*90);$('exportProgress').value=p;$('exportPercent').textContent=p+'%';}}
      else await exportComposedFrames(session,settings,total,frameCount,config);
    }catch(error){
      if(exportCancelled||(!direct&&!config))throw error;
      // Some drivers accept a configuration and fail at runtime. Restart cleanly.
      await request('/api/render/abort',{method:'POST',body:{id:session.id}});session=await request('/api/render/start',{method:'POST',body:{clips:structuredClone(clips),settings}});window.lastExportPath='compatible-fallback';$('exportProgress').value=0;$('exportPercent').textContent='0%';$('exportDescription').textContent='Using the compatible renderer for this project. Keep this tab visible.';
      await exportComposedFrames(session,settings,total,frameCount,null);
    }
    if(exportCancelled)throw Error('Export cancelled.');cancelExport.hidden=true;$('exportDescription').textContent='Finishing the '+settings.format.toUpperCase()+' and mixing your selected audio tracks…';
    let job=await request('/api/render/finish',{method:'POST',body:{id:session.id}});
    while(job.status==='running'){await new Promise(resolve=>setTimeout(resolve,200));job=await request('/api/job/'+job.id);$('exportProgress').value=90+job.progress/10;$('exportPercent').textContent=Math.floor(90+job.progress/10)+'%';}
    if(job.status==='error')throw Error(job.error);if(exportURL)URL.revokeObjectURL(exportURL);exportURL=job.url;$('download').href=exportURL;$('download').download=($('projectName').value.trim()||'Cute-Cut-export')+'.'+settings.format;$('download').textContent='Save '+settings.format.toUpperCase()+' ↗';$('download').hidden=false;$('exportTitle').textContent='Your cut is ready.';$('exportDescription').textContent=`${settings.format.toUpperCase()} · ${exportCanvasSize.width} × ${exportCanvasSize.height} · ${settings.fps} fps · ${settings.codec==='hevc'?'H.265':'H.264'}`;$('exportProgress').value=100;$('exportPercent').textContent='100%';
  }catch(error){if(session)await request('/api/render/abort',{method:'POST',body:{id:session.id}}).catch(()=>{});$('exportTitle').textContent=exportCancelled?'Export cancelled':'Export interrupted';$('exportDescription').textContent=error?.message||String(error)||'Video encoding failed. Try H.264 with MP4.';
  }finally{exportBusy=false;exportCanvasSize=null;cancelExport.hidden=true;$('closeExport').hidden=false;setPosition(before,true,true);render();}
};
const exportOptionsDialog=document.createElement('dialog');exportOptionsDialog.id='exportOptionsDialog';exportOptionsDialog.innerHTML=`<div class="export-options-heading"><div><h2>Export video</h2><p>Choose the settings for your finished video.</p></div><button id="closeExportOptions" class="icon" aria-label="Close export settings">×</button></div>
<div class="export-setting"><label for="exportResolution">Resolution</label><select id="exportResolution"><option value="480">480P</option><option value="720">720P</option><option value="1080" selected>1080P</option><option value="1440">2K · 1440P</option><option value="2160">4K · 2160P</option><option value="original">Original</option></select></div>
<div class="export-setting"><label for="exportBitrate">Bit rate</label><select id="exportBitrate"><option value="lower">Lower</option><option value="recommended">Recommended</option><option value="higher" selected>Higher</option><option value="custom">Custom</option></select></div>
<div class="export-setting" id="customBitrateRow" hidden><label for="exportCustomBitrate">Custom bit rate</label><div class="custom-bitrate"><input id="exportCustomBitrate" aria-label="Custom bit rate in Mbps" type="number" min="0.1" max="200" step="0.1" value="12"><span>Mbps</span></div></div>
<div class="export-setting"><label for="exportCodec">Codec</label><select id="exportCodec"><option value="h264">H.264</option><option value="hevc">H.265 / HEVC</option></select></div>
<div class="export-setting"><label for="exportFormat">Format</label><select id="exportFormat"><option value="mp4">mp4</option><option value="mov">mov</option></select></div>
<div class="export-setting"><label for="exportFrameRate">Frame rate</label><select id="exportFrameRate"><option value="24">24fps</option><option value="25">25fps</option><option value="30" selected>30fps</option><option value="50">50fps</option><option value="60">60fps</option></select></div>
<div id="exportSettingsSummary" class="export-settings-summary" aria-live="polite"></div><p id="exportSettingsNote" class="tip"></p><div class="export-options-actions"><button id="cancelExportOptions" class="secondary">Cancel</button><button id="startProjectExport" class="primary">Export ↗</button></div>`;document.body.append(exportOptionsDialog);
let availableExportCodecs=['h264'],openingExportOptions=false;
function selectedExportOptions(){const aspect=projectAspect(),resolution=$('exportResolution').value,original=projectPixels();let width,height;if(resolution==='original'){width=original.width;height=original.height;}else if(aspect>=1){height=+resolution;width=height*aspect;}else{width=+resolution;height=width/aspect;}width=Math.max(2,Math.round(width/2)*2);height=Math.max(2,Math.round(height/2)*2);const fps=+$('exportFrameRate').value,codec=$('exportCodec').value,format=$('exportFormat').value,preset=$('exportBitrate').value,custom=+$('exportCustomBitrate').value,recommended=Math.max(500000,Math.min(100000000,width*height*fps*.13*(codec==='h264'?1:.7))),bitrate=preset==='custom'?custom*1000000:Math.round(recommended*(preset==='higher'?1.5:preset==='lower'?.65:1));if(width>8192||height>8192)throw Error('Choose a resolution no larger than 8192 pixels on either side.');if(!Number.isFinite(bitrate)||bitrate<100000||bitrate>200000000)throw Error('Choose a custom bit rate between 0.1 and 200 Mbps.');if(!availableExportCodecs.includes(codec))throw Error('This codec is unavailable in your browser encoder.');return {width,height,fps,codec,format,bitrate};}
function updateExportOptions(){
  $('customBitrateRow').hidden=$('exportBitrate').value!=='custom';
  try{const s=selectedExportOptions(),mb=(s.bitrate+192000)*duration()/8/1000000;$('exportSettingsSummary').textContent=`${s.width} × ${s.height} · ${s.fps} fps · ${(s.bitrate/1000000).toFixed(1)} Mbps · Estimated ${mb.toFixed(1)} MB`;$('exportSettingsNote').textContent=s.codec==='hevc'?'H.265 makes efficient files, but some players need HEVC support.':s.width*s.height>4000000||s.fps>30?'Higher resolution and frame rate take longer to render. Final file size varies.':'H.264 + MP4 offers broad player compatibility. Final file size varies.';$('startProjectExport').disabled=false;}catch(error){$('exportSettingsSummary').textContent=error.message;$('exportSettingsNote').textContent='';$('startProjectExport').disabled=true;}
}
exportOptionsDialog.addEventListener('input',updateExportOptions);
$('exportCodec').addEventListener('change',updateExportOptions);
$('exportFormat').addEventListener('change',updateExportOptions);
$('closeExportOptions').onclick=$('cancelExportOptions').onclick=()=>exportOptionsDialog.close();
$('export').onclick=async()=>{if(exportBusy||openingExportOptions||!clips.length)return;pause();openingExportOptions=true;try{const capabilities=await request('/api/export-capabilities');availableExportCodecs=capabilities.codecs;for(const option of $('exportCodec').options)option.disabled=!availableExportCodecs.includes(option.value);if(!availableExportCodecs.includes($('exportCodec').value)){$('exportCodec').value='h264';$('exportFormat').value='mp4';}updateExportOptions();exportOptionsDialog.showModal();}catch(error){toast(error.message);}finally{openingExportOptions=false;}};
$('startProjectExport').onclick=()=>{try{const settings=selectedExportOptions();exportOptionsDialog.close();startProjectExport(settings);}catch(error){toast(error.message);}};
render();
