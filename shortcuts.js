'use strict';
let clipClipboard=null;
function copyTimelineClip(cut=false){
  const c=chosen();if(!c)return toast('Select a video clip first.');
  if(selectionKind==='audio')return toast('Audio is linked in this preview. Select its video to copy both.');
  clipClipboard=structuredClone(c);closeMenu();
  if(cut){remove();toast('Clip cut. Paste it at the playhead.');}else toast('Clip copied. Move the playhead, then paste.');
}
function pasteTimelineClip(){
  if(!clipClipboard)return toast('Copy a video clip first.');
  if(!library.some(m=>m.id===clipClipboard.mediaId))return toast('The original media is no longer available.');
  pause();closeMenu();const at=playhead;const found=locate(at);snapshot();let index=clips.length;
  if(found){
    const {c,offset}=found,length=clipLength(c);
    if(offset<.001)index=found.index;
    else if(length-offset<.001)index=found.index+1;
    else{const cut=c.in+offset*(c.speed||1),right={...c,id:uid(),in:cut};c.out=cut;clips.splice(found.index+1,0,right);index=found.index+1;}
  }
  const pasted={...structuredClone(clipClipboard),id:uid()};clips.splice(index,0,pasted);selected=pasted.id;selectionKind='video';render();setPosition(at);toast('Clip pasted at the playhead.');
}
function trimToPlayhead(side){
  const found=locate(playhead),c=chosen();if(!found||!c||found.c.id!==c.id)return toast('Place the playhead inside the selected video.');
  const cut=c.in+found.offset*(c.speed||1);if(cut-c.in<.05||c.out-cut<.05)return toast('Move the playhead away from the clip edge.');
  pause();snapshot();if(side==='left'){c.in=cut;playhead=found.at;}else c.out=cut;render();setPosition(playhead);
}
function duplicateSelected(){const c=chosen();if(!c)return toast('Select a video clip first.');if(selectionKind==='audio')return toast('Select the video to duplicate the clip and its linked audio.');pause();snapshot();const copy={...c,id:uid()};clips.splice(clips.indexOf(c)+1,0,copy);selected=copy.id;selectionKind='video';render();}
function openSelectedSpeed(){const c=chosen();if(!c)return toast('Select a video clip first.');pause();closeMenu();menuClip=c.id;$('customSpeed').value=c.speed||1;$('speedDialog').showModal();}
function toggleSelectedExtraction(){const c=chosen();if(!c||!source(c).audio)return toast('Select a video that contains audio.');pause();snapshot();c.detached=!c.detached;selectionKind=c.detached?'audio':'video';render();if(c.detached)prepareWave(c);}
function seekClipBoundary(direction){const f=locate(playhead);if(!f)return;pause();if(direction>0)setPosition(f.at+clipLength(f.c));else if(f.offset>.04)setPosition(f.at);else setPosition(Math.max(0,f.at-(clips[f.index-1]?clipLength(clips[f.index-1]):0)));}
function removeSelected(){if(selectionKind==='audio'){const c=chosen();if(!c)return;pause();snapshot();c.detached=false;c.volume=0;selectionKind='video';render();toast('Extracted audio removed; the video is muted.');}else remove();}

// Clicking a video establishes an exact playhead position for keyboard splitting.
const clipPointerBeforeShortcuts=$('videoTrack').onpointerdown;
timelineViewport.tabIndex=0;timelineViewport.style.outline='none';
timelineViewport.addEventListener('pointerdown',event=>{if(event.button===0&&!event.target.closest('input,textarea,button'))timelineViewport.focus({preventScroll:true});},{capture:true});
$('videoTrack').onpointerdown=event=>{clipPointerBeforeShortcuts(event);if(event.button!==0||event.target.closest('[data-edge]')||!event.target.closest('.clip'))return;pause();setPosition((event.clientX-$('timelineCanvas').getBoundingClientRect().left)/scale);};

const showMenuBeforeShortcuts=showMenu;
showMenu=function(event,kind){showMenuBeforeShortcuts(event,kind);if($('clipMenu').hidden)return;const menu=$('clipMenu');const hints={split:'Ctrl+B',duplicate:'Ctrl+D',delete:'Delete',speed:'Shift+S',extract:'Shift+E',mute:'Shift+M'};for(const button of menu.querySelectorAll('[data-action]')){const key=hints[button.dataset.action];if(key){const small=button.querySelector('small');if(small)small.textContent=key;}}
  if(kind==='video'){const anchor=menu.querySelector('[data-action="duplicate"]');for(const [action,label,key] of [['copy','Copy clip','Ctrl+C'],['cut','Cut clip','Ctrl+X'],['paste','Paste at playhead','Ctrl+V']]){const button=document.createElement('button');button.setAttribute('role','menuitem');button.dataset.action=action;button.innerHTML=`<span class="menu-icon">${action==='cut'?'✂':'▣'}</span><span>${label}</span><small>${key}</small>`;button.disabled=action==='paste'&&!clipClipboard;menu.insertBefore(button,anchor);}const rect=menu.getBoundingClientRect();menu.style.top=Math.max(8,Math.min(event.clientY-10,innerHeight-rect.height-12))+'px';}
};
const menuClickBeforeShortcuts=$('clipMenu').onclick;
$('clipMenu').onclick=event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(['copy','cut','paste'].includes(action)){selected=menuClip;selectionKind='video';closeMenu();if(action==='paste')pasteTimelineClip();else copyTimelineClip(action==='cut');return;}return menuClickBeforeShortcuts(event);};

const shortcutSections=[
  ['Edit clips', [['Ctrl+B','Split at the playhead'],['Ctrl+C','Copy selected video clip'],['Ctrl+X','Cut selected video clip'],['Ctrl+V','Insert copied clip at the playhead'],['Ctrl+Z','Undo'],['Ctrl+Shift+Z / Ctrl+Y','Redo'],['Delete / Backspace','Delete selected clip'],['Q / W','Trim left / right to the playhead']]],
  ['Playback and navigation', [['Space','Play / pause'],['← / →','Move one frame'],['Shift+← / Shift+→','Move one second'],['↑ / ↓','Previous / next clip boundary'],['Home / End','Start / end of the timeline']]],
  ['Timeline and media', [['Ctrl+scroll','Zoom timeline under the mouse'],['Ctrl++ / Ctrl+−','Zoom timeline in / out'],['Shift+Z','Fit timeline'],['Ctrl+I','Import videos']]],
  ['Cute Cut additions', [['Ctrl+D','Duplicate selected video'],['Shift+S','Custom speed'],['Shift+E','Extract / put audio back'],['Shift+M','Mute / unmute selected clip'],['?','Show this panel']]]
];
const shortcutDialog=document.createElement('dialog');shortcutDialog.id='shortcutDialog';shortcutDialog.innerHTML='<h2>Keep your hands on the edit.</h2><p>Editor shortcuts work while this page has focus.<br>Typing fields keep their normal copy, paste, undo, and text selection.</p>'+shortcutSections.map(([title,rows])=>`<section><h3>${title}</h3>${rows.map(([key,description])=>`<div class="shortcut-row"><span>${description}</span><kbd>${key}</kbd></div>`).join('')}</section>`).join('')+'<p class="shortcut-note">CapCut-style core mappings, with Cute Cut additions listed separately. Browser and operating-system reserved commands may still take priority. Clip copies stay inside this editor; your system clipboard is untouched. Extracted audio remains linked to its video in this preview.</p><button id="closeShortcuts" class="secondary">Back to editing</button>';
shortcutDialog.tabIndex=-1;shortcutDialog.setAttribute('aria-label','Keyboard shortcuts');document.body.append(shortcutDialog);$('closeShortcuts').onclick=()=>shortcutDialog.close();
function showShortcuts(){pause();closeMenu();if(!shortcutDialog.open)shortcutDialog.showModal();shortcutDialog.focus();shortcutDialog.scrollTop=0;}
const shortcutButton=document.createElement('button');shortcutButton.id='shortcutHelp';shortcutButton.textContent='⌨ Shortcuts';shortcutButton.title='Keyboard shortcuts (?)';shortcutButton.onclick=showShortcuts;document.querySelector('.timeline-toolbar .zoom').prepend(shortcutButton);

document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.isComposing||event.altKey||isTyping(event)||event.target.closest?.('select'))return;
  if(document.querySelector('dialog[open]'))return;
  const command=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();let action=null,repeat=false;
  if(!command&&event.target?.tagName==='INPUT'&&event.target.type==='range'&&['arrowleft','arrowright','arrowup','arrowdown','home','end'].includes(key))return;
  if(command){
    if(key==='b'&&!event.shiftKey)action=split;
    else if(key==='c'&&!event.shiftKey)action=()=>copyTimelineClip();
    else if(key==='x'&&!event.shiftKey)action=()=>copyTimelineClip(true);
    else if(key==='v'&&!event.shiftKey)action=pasteTimelineClip;
    else if(key==='z')action=()=>history(event.shiftKey);
    else if(key==='y'&&!event.shiftKey)action=()=>history(true);
    else if(key==='d'&&!event.shiftKey)action=duplicateSelected;
    else if(key==='i'&&!event.shiftKey)action=()=>$('files').click();
    else if(['+','=','-','_'].includes(event.key)){repeat=true;action=()=>{const box=timelineViewport.getBoundingClientRect();zoomTimeline(scale*(['-','_'].includes(event.key)?1/1.2:1.2),box.left+box.width/2);};}
  }else if(key==='delete'||key==='backspace')action=removeSelected;
  else if(key==='arrowleft'||key==='arrowright'){repeat=true;action=()=>{pause();setPosition(playhead+(key==='arrowright'?1:-1)*(event.shiftKey?1:1/30));};}
  else if(key==='arrowup'||key==='arrowdown')action=()=>seekClipBoundary(key==='arrowdown'?1:-1);
  else if(key==='home'||key==='end')action=()=>{pause();setPosition(key==='home'?0:duration());};
  else if(key==='q'&&!event.shiftKey)action=()=>trimToPlayhead('left');
  else if(key==='w'&&!event.shiftKey)action=()=>trimToPlayhead('right');
  else if(key==='z'&&event.shiftKey)action=()=>$('fit').click();
  else if(key==='s'&&event.shiftKey)action=openSelectedSpeed;
  else if(key==='e'&&event.shiftKey)action=toggleSelectedExtraction;
  else if(key==='m'&&event.shiftKey)action=()=>$('mute').click();
  else if(event.key==='?')action=showShortcuts;
  if(!action)return;event.preventDefault();event.stopImmediatePropagation();if(event.repeat&&!repeat)return;action();
},true);
$('split').title='Split at playhead (Ctrl+B)';$('undo').title='Undo (Ctrl+Z)';$('redo').title='Redo (Ctrl+Shift+Z)';$('delete').title='Delete selected clip (Delete)';$('import').title='Import videos (Ctrl+I)';
document.querySelector('footer>span:last-child').textContent='Ctrl+B · Split    |    Ctrl+C / Ctrl+V · Copy / paste    |    Space · Play    |    ? · Shortcuts';
