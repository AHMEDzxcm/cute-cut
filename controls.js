'use strict';
// Clear an old accidental selection when beginning a timeline gesture; preserve editable fields.
document.addEventListener('pointerdown',event=>{const el=event.target;if(el instanceof Element&&el.closest('.timeline')&&!el.closest('input,textarea,[contenteditable="true"],[role="textbox"]'))window.getSelection()?.removeAllRanges();},true);
document.addEventListener('dragstart',event=>{if(event.target instanceof Element&&event.target.closest('.timeline,.media-list')&&!event.target.closest('[data-media-drag]'))event.preventDefault();});
// Only the timeline consumes Ctrl+wheel. All other browser zoom gestures retain their normal behavior.
const timelineZone=document.querySelector('.timeline'),timelineViewport=$('timelineScroll');
const MIN_ZOOM=2,MAX_ZOOM=1000;
// A long clip can finish scrolling into view as its menu opens. Don't dismiss on that pending scroll.
let menuSettling=false;
timelineViewport.removeEventListener('scroll',closeMenu);
timelineViewport.addEventListener('contextmenu',()=>{menuSettling=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{menuSettling=false;}));},{capture:true});
timelineViewport.addEventListener('scroll',()=>{if(!menuSettling)closeMenu();});
$('zoom').min=MIN_ZOOM;$('zoom').max=MAX_ZOOM;$('zoom').step='any';
$('zoom').title='Timeline zoom · Ctrl + mouse wheel over the timeline';
const zoomLabel=document.createElement('output');zoomLabel.id='zoomPercent';zoomLabel.setAttribute('aria-label','Timeline zoom percentage');document.querySelector('.zoom').prepend(zoomLabel);
function updateZoomLabel(){zoomLabel.textContent=Math.round(scale/64*100)+'%';$('zoom').value=scale;}
function zoomTimeline(next,clientX){
  closeMenu();const bounds=timelineViewport.getBoundingClientRect(),x=Math.max(0,Math.min(bounds.width,clientX-bounds.left)),time=(timelineViewport.scrollLeft+x)/scale;
  scale=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,next));render();timelineViewport.scrollLeft=Math.max(0,time*scale-x);updateZoomLabel();
}
timelineZone.addEventListener('wheel',event=>{
  if(!event.ctrlKey)return;
  event.preventDefault();event.stopPropagation();
  const units=event.deltaMode===1?16:event.deltaMode===2?timelineViewport.clientHeight:1,delta=Math.max(-600,Math.min(600,event.deltaY*units));
  zoomTimeline(scale*Math.exp(-delta*.0025),event.clientX);
},{passive:false,capture:true});
$('zoom').oninput=()=>zoomTimeline(Number($('zoom').value),timelineViewport.getBoundingClientRect().left+timelineViewport.clientWidth/2);
$('fit').onclick=()=>{scale=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,(timelineViewport.clientWidth-80)/Math.max(.1,duration())));render();timelineViewport.scrollLeft=0;updateZoomLabel();};
updateZoomLabel();

// Capture Space before a focused button/range can consume it or the page can scroll.
let consumedSpace=false;
function isTyping(event){return event.composedPath().some(el=>el?.nodeType===1&&(el.isContentEditable||el.tagName==='TEXTAREA'||el.getAttribute('role')==='textbox'||(el.tagName==='INPUT'&&!['range','checkbox','radio','button','submit','reset','file','color'].includes(el.type))));}
document.addEventListener('keydown',event=>{
  if((event.code!=='Space'&&event.key!==' ')||event.ctrlKey||event.metaKey||event.altKey||event.isComposing||isTyping(event))return;
  event.preventDefault();event.stopImmediatePropagation();consumedSpace=true;
  if(event.repeat)return;
  closeMenu();togglePlay();
},true);
document.addEventListener('keyup',event=>{if((event.code==='Space'||event.key===' ')&&consumedSpace){consumedSpace=false;event.preventDefault();event.stopImmediatePropagation();}},true);
window.addEventListener('blur',()=>{consumedSpace=false;});
$('play').title='Play / pause (Space)';

// Custom rates keep the user's exact decimal; slider changes are a convenience, not a rounding rule.
const rateInput=$('customSpeed');rateInput.min='.1';rateInput.max='16';rateInput.step='any';
const speedSlider=document.createElement('input');speedSlider.type='range';speedSlider.id='speedSlider';speedSlider.min=0;speedSlider.max=1000;speedSlider.step=1;speedSlider.setAttribute('aria-label','Adjust playback speed');
const speedDetails=document.createElement('div');speedDetails.className='speed-details';speedDetails.innerHTML='<div><span>0.1× · slower</span><span>16× · faster</span></div><p id="speedDuration"></p><small id="speedNote">Enter any decimal speed, like 0.35× or 1.275×.</small>';
document.querySelector('.speed-entry').after(speedSlider,speedDetails);
function updateSpeedControls(){
  const rate=Number(rateInput.value),c=clips.find(c=>c.id===menuClip);if(Number.isFinite(rate)&&rate>=.1&&rate<=16){speedSlider.value=Math.log(rate/.1)/Math.log(160)*1000;$('speedDuration').textContent=c?`${fmt(clipLength(c))} → ${fmt((c.out-c.in)/rate)} clip duration`:'';$('speedNote').textContent=rate<.5||rate>4?'At extreme speeds, your browser may silence audio during preview.':'Enter any decimal speed, like 0.35× or 1.275×.';$('applySpeed').disabled=false;}else{$('speedDuration').textContent='Choose a speed between 0.1× and 16×.';$('applySpeed').disabled=true;}
}
rateInput.addEventListener('input',updateSpeedControls);
rateInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('applySpeed').click();}});
speedSlider.oninput=()=>{rateInput.value=(.1*Math.pow(160,Number(speedSlider.value)/1000)).toFixed(3);updateSpeedControls();};
document.querySelector('.speed-presets').addEventListener('click',updateSpeedControls);
const speedObserver=new MutationObserver(()=>{if($('speedDialog').open){updateSpeedControls();requestAnimationFrame(()=>{if(!$('speedDialog').open)return;rateInput.focus();rateInput.select();});}});speedObserver.observe($('speedDialog'),{attributes:true,attributeFilter:['open']});
const hint=document.querySelector('footer>span:last-child');hint.textContent='Space · Play / pause    |    Ctrl + scroll · Timeline zoom    |    Right-click · Clip options';
