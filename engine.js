/* Cute Cut browser engine. All media processing stays on this device. */
'use strict';
window.CuteEngine = (() => {
  const media = new Map(), jobs = new Map(), preview = new Map();
  let ff, loading, queue = Promise.resolve(), exporting = false, logs = '', progress = null;
  const encode = text => new TextEncoder().encode(text);
  function status(text) { const el = document.getElementById('engineStatus'); if (el) el.textContent = text; }
  function serial(fn) { const task = queue.then(fn); queue = task.catch(() => {}); return task; }
  async function init() {
    if (loading) return loading;
    loading = (async () => {
      status('Loading video engine…');
      if (!window.FFmpegWASM || !window.WebAssembly || !window.DecompressionStream) throw Error('Use an up-to-date desktop browser for editing.');
      ff = new FFmpegWASM.FFmpeg();
      ff.on('log', ({message}) => { logs = (logs + '\n' + message).slice(-6000); });
      ff.on('progress', ({progress: value}) => { if(progress) progress(Math.max(0, Math.min(1, value))); });
      const response = await fetch('./ffmpeg-core.bin');
      if (!response.ok) throw Error('Video engine download failed. Check your connection and reload.');
      const bytes = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const wasmURL = URL.createObjectURL(new Blob([bytes], {type:'application/wasm'}));
      try { await ff.load({coreURL: new URL('./ffmpeg-core.js', location.href).href, wasmURL}); }
      finally { URL.revokeObjectURL(wasmURL); }
      status('Browser engine ready');
    })().catch(e => { loading = null; status('Engine unavailable · reload to retry'); throw e; });
    return loading;
  }
  async function exec(args, update) {
    logs = ''; progress = update || null;
    try { const code = await ff.exec(['-hide_banner','-y',...args]); if(code !== 0) throw Error(logs.slice(-800) || 'Video processing failed.'); }
    finally { progress = null; }
  }
  async function remove(file) { try { await ff.deleteFile(file); } catch {} }
  async function readBlob(file,type) {
    const data = await ff.readFile(file);
    const url = URL.createObjectURL(new Blob([data],{type})); await remove(file); return url;
  }
  async function importVideo(file) {
    if (!(file instanceof File)) throw Error('Choose a video file.');
    if (file.size >= 2000000000) throw Error('This recording exceeds the browser edition’s 2 GB input limit. Use the desktop edition for larger recordings.');
    await init(); status('Reading video…');
    const id = crypto.randomUUID(), mount = '/m-' + id, input = mount + '/source';
    await ff.createDir(mount);
    try {
      // WORKERFS reads the File on demand, without copying the whole recording into WASM RAM.
      await ff.mount('WORKERFS',{blobs:[{name:'source',data:file}]},mount);
      const output = id + '.json';
      const code = await ff.ffprobe(['-v','error','-show_streams','-show_format','-of','json',input,'-o',output]);
      // This core can return -1 after ffprobe has successfully written its JSON.
      let meta;try {meta=JSON.parse(await ff.readFile(output,'utf8'));}catch{throw Error('Could not read this video format. '+logs.slice(-600));}finally{await remove(output);}
      const v = meta.streams.find(s => s.codec_type === 'video'), duration = Number(meta.format?.duration || v?.duration);
      if (!v || !Number.isFinite(duration) || duration <= 0) throw Error('No readable video stream or duration found.');
      const audioTracks = meta.streams.filter(s=>s.codec_type==='audio').map((s,index)=>({index,title:s.tags?.title||s.tags?.TITLE||`Audio ${index+1}`,codec:s.codec_name,channels:s.channels,language:s.tags?.language}));
      const item = {id,name:file.name,duration,width:v.width,height:v.height,audio:audioTracks.length>0,audioTracks,input,mount,url:URL.createObjectURL(file)};
      media.set(id,item); status('Browser engine ready'); return {...item,input:undefined,mount:undefined};
    } catch(e) { try {await ff.unmount(mount);await ff.deleteDir(mount);}catch{} status('Browser engine ready'); throw e; }
  }
  async function previewAudio(m,index) {
    const key = `${m.id}-${index}`;
    if (preview.has(key)) return {url:preview.get(key)};
    const name = key+'.m4a'; status('Preparing audio preview…');
    try {await exec(['-i',m.input,'-map',`0:a:${index}`,'-vn','-c:a','aac','-b:a','160k',name]);const url=await readBlob(name,'audio/mp4');preview.set(key,url);return {url};}
    finally {await remove(name);status('Browser engine ready');}
  }
  function checkedTrack(m,index) { if(!m || !Number.isInteger(index) || index<0 || index>=m.audioTracks.length) throw Error('Invalid audio track.'); }
  function validateRange(m,start,end,volume) {if(!m||![start,end,volume].every(Number.isFinite)||start<0||end>m.duration+.01||end-start<.04||volume<0||volume>2)throw Error('Invalid trim range or volume.');}
  async function extractAudio(data,job) {
    const m = media.get(data.mediaId), tracks = data.track==='all'?m.audioTracks.map(t=>t.index):[data.track];
    job.files=[];
    for(let i=0;i<tracks.length;i++) {
      const index=tracks[i],name=`${job.id}-${index}.${data.format}`,title=`Track-${index+1}.${data.format}`;
      try {
        await exec(['-ss',String(data.start),'-i',m.input,'-t',String(data.end-data.start),'-map',`0:a:${index}`,'-vn','-af',`volume=${data.volume}`,...(data.format==='wav'?['-c:a','pcm_s16le']:['-c:a','aac','-b:a','192k']),name],p=>job.progress=Math.round((i+p)/tracks.length*99));
        job.files.push({name:title,url:await readBlob(name,data.format==='wav'?'audio/wav':'audio/mp4')});
      } finally {await remove(name);}
      job.progress=Math.round((i+1)/tracks.length*99);
    }
  }
  async function exportVideo(clips,job) {
    const first=media.get(clips[0].mediaId),width=first.width-first.width%2,height=first.height-first.height%2;
    const files=[], list=job.id+'.txt',output=job.id+'.mp4';
    try {
      for(let i=0;i<clips.length;i++){
        const c=clips[i],m=media.get(c.mediaId),file=`${job.id}-${i}.mp4`,args=['-ss',String(c.in),'-i',m.input];files.push(file);
        if(!m.audio)args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
        args.push('-t',String(c.out-c.in),'-map','0:v:0','-map',m.audio?`0:a:${c.audioTrack||0}`:'1:a:0','-vf',`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,'-af',`volume=${c.volume},aresample=48000,aformat=channel_layouts=stereo`,'-c:v','libx264','-preset','ultrafast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',file);
        await exec(args,p=>job.progress=Math.round((i+p)/clips.length*90));job.progress=Math.round((i+1)/clips.length*90);
      }
      await ff.writeFile(list,encode(files.map(f=>`file '${f}'`).join('\n')));
      await exec(['-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',output]);job.url=await readBlob(output,'video/mp4');
    } finally {for(const file of [...files,list,output])await remove(file);}
  }
  function startJob(fn) {
    if(exporting)throw Error('An export is already running.');
    exporting=true;const job={id:crypto.randomUUID(),status:'running',progress:0};jobs.set(job.id,job);
    serial(async()=>{status('Processing on your device…');try{await init();await fn(job);job.status='done';job.progress=100;}catch(e){job.status='error';job.error=e.message+' Try a shorter clip or reload if browser memory is exhausted.';}finally{exporting=false;status('Browser engine ready');}});
    return {id:job.id,status:job.status,progress:job.progress};
  }
  async function request(url,options={}) {
    const route=url.split('?')[0];
    if(route==='/api/status')return {encoder:!!window.WebAssembly,token:'browser-local'};
    if(route==='/api/import')return serial(()=>importVideo(options.body));
    const data=options.body && typeof options.body==='string'?JSON.parse(options.body):{};
    if(route==='/api/preview-audio'){const m=media.get(data.mediaId);checkedTrack(m,data.track);return serial(()=>previewAudio(m,data.track));}
    if(route==='/api/extract-audio'){
      const m=media.get(data.mediaId);if(!m?.audio)throw Error('This video has no audio tracks.');
      if(data.track!=='all')checkedTrack(m,data.track);if(!['wav','m4a'].includes(data.format))throw Error('Invalid audio format.');validateRange(m,data.start,data.end,data.volume);
      return startJob(job=>extractAudio(data,job));
    }
    if(route==='/api/export'){
      if(!data.clips?.length||data.clips.length>500)throw Error('Add clips to the timeline first (maximum 500).');
      const clips=structuredClone(data.clips);for(const c of clips){const m=media.get(c.mediaId);validateRange(m,c.in,c.out,c.volume);if(m.audio)checkedTrack(m,c.audioTrack||0);}
      return startJob(job=>exportVideo(clips,job));
    }
    if(route.startsWith('/api/job/')){const job=jobs.get(route.split('/').pop());if(!job)throw Error('Export not found.');return {...job,files:job.files?.map(f=>({...f}))};}
    throw Error('Unknown browser operation.');
  }
  return {request,mediaURL:id=>media.get(id)?.url||'',version:'0.3.0'};
})();
