const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chevron='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
const check='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const triggerContent=option=>`<span class="choice-trigger-value">${escapeHTML(option.label)}${option.detail ? `<small>${escapeHTML(option.detail)}</small>` : ''}</span>${chevron}`;
let activePicker=null;

export function choiceTrigger({id,label,value,options,describedBy=''}){
 const selected=options.find(option=>String(option.value)===String(value)) || options[0];
 return `<button type="button" class="choice-trigger" id="${escapeHTML(id)}" value="${escapeHTML(selected.value)}" data-choice-label="${escapeHTML(label)}" aria-label="${escapeHTML(label+': '+selected.label)}" aria-haspopup="dialog" aria-expanded="false"${describedBy ? ` aria-describedby="${escapeHTML(describedBy)}"` : ''}>${triggerContent(selected)}</button>`;
}

// One dialog-based selector for setup and settings. Selection is immediate,
// like a native select, while Escape/backdrop dismiss without changing value.
export function bindChoicePicker(trigger,{title,eyebrow='RACE SETUP',options,layout='cards',onChange}){
 if(!trigger)return;
 const open=()=>{
  if(trigger.disabled)return;
  activePicker?.();
  const doc=trigger.ownerDocument,backdrop=doc.createElement('div');
  const titleId=trigger.id+'-picker-title';
  backdrop.className='modal-backdrop choice-picker-backdrop';
  backdrop.innerHTML=`<section class="modal choice-picker-modal" role="dialog" aria-modal="true" aria-labelledby="${escapeHTML(titleId)}"><div class="track-picker-heading"><div><div class="eyebrow">${escapeHTML(eyebrow)}</div><h2 id="${escapeHTML(titleId)}">${escapeHTML(title)}</h2></div><button type="button" class="ghost choice-picker-close" aria-label="Close ${escapeHTML(title.toLowerCase())} selector">×</button></div><div class="choice-options ${layout==='positions' ? 'choice-positions' : ''}" role="group" aria-label="${escapeHTML(title)}">${options.map((option,index)=>{
   const selected=String(option.value)===trigger.value;
   return `<button type="button" class="choice-option${selected ? ' selected' : ''}" data-choice-index="${index}" aria-pressed="${selected}"><span class="choice-option-copy">${option.detail ? `<small class="choice-option-detail">${escapeHTML(option.detail)}</small>` : ''}<b>${escapeHTML(option.label)}</b>${option.description ? `<span class="choice-option-description">${escapeHTML(option.description)}</span>` : ''}</span><span class="choice-check">${check}</span></button>`;
  }).join('')}</div><p class="choice-picker-hint">Select an option to apply.</p></section>`;
  doc.body.appendChild(backdrop);
  // This also isolates a selector opened over Settings without dismissing the
  // parent dialog or allowing its controls to receive stray keyboard input.
  const background=[...doc.body.children].filter(node=>node!==backdrop&&'inert' in node).map(node=>[node,node.inert]);
  background.forEach(([node])=>node.inert=true);
  trigger.setAttribute('aria-expanded','true');
  const restoreFocus=()=>{
   const current=trigger.isConnected ? trigger : doc.getElementById(trigger.id);
   current?.focus({preventScroll:true});
  };
  let closed=false;
  const close=(restore=true)=>{
   if(closed)return;
   closed=true;backdrop.remove();
   background.forEach(([node,inert])=>node.inert=inert);
   trigger.setAttribute('aria-expanded','false');
   activePicker=null;
   if(restore)restoreFocus();
  };
  activePicker=close;
  const buttons=[...backdrop.querySelectorAll('[data-choice-index]')];
  const focusOption=index=>{buttons[index].focus({preventScroll:true});buttons[index].scrollIntoView({block:'nearest',inline:'nearest'});};
  buttons.forEach((button,index)=>button.onclick=()=>{
   const option=options[index],changed=trigger.value!==String(option.value);
   trigger.value=String(option.value);trigger.innerHTML=triggerContent(option);
   trigger.setAttribute('aria-label',trigger.dataset.choiceLabel+': '+option.label);
   close(false);
   try {if(changed)onChange?.(trigger.value);} finally {restoreFocus();}
  });
  const closeButton=backdrop.querySelector('.choice-picker-close');
  closeButton.onclick=()=>close();
  backdrop.onclick=event=>{if(event.target===backdrop)close();};
  let search='',searchAt=0;
  backdrop.addEventListener('keydown',event=>{
   event.stopPropagation();
   if(event.key==='Escape'){event.preventDefault();close();return;}
   const focused=buttons.indexOf(doc.activeElement),all=[closeButton,...buttons];
   if(event.key==='Tab'){
    const index=all.indexOf(doc.activeElement);
    if(event.shiftKey&&index===0){event.preventDefault();focusOption(buttons.length-1);}
    else if(!event.shiftKey&&index===all.length-1){event.preventDefault();closeButton.focus();}
    return;
   }
   const columns=getComputedStyle(backdrop.querySelector('.choice-options')).gridTemplateColumns.split(' ').length;
   const step={ArrowRight:1,ArrowLeft:-1,ArrowDown:columns,ArrowUp:-columns}[event.key];
   if(step || event.key==='Home' || event.key==='End'){
    event.preventDefault();
    const index=event.key==='Home' ? 0 : event.key==='End' ? buttons.length-1 : Math.max(0,Math.min(buttons.length-1,(focused<0 ? 0 : focused)+step));
    focusOption(index);return;
   }
   if(event.key.length===1 && /[\p{L}\p{N}]/u.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey){
    event.preventDefault();const now=Date.now();search=now-searchAt<800 ? search+event.key.toLowerCase() : event.key.toLowerCase();searchAt=now;
    const match=options.findIndex(option=>option.label.toLowerCase().startsWith(search)||String(option.value).toLowerCase().startsWith(search));
    if(match>=0)focusOption(match);
   }
  });
  focusOption(Math.max(0,options.findIndex(option=>String(option.value)===trigger.value)));
 };
 trigger.onclick=open;
 trigger.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();open();}
 });
}
