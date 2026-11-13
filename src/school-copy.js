// Escape lesson text before marking the named compounds. Colour never replaces the name.
const escapeHTML=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const compounds={Soft:'S',Medium:'M',Hard:'H',Intermediate:'I',Wet:'W'};
export function colourTyreNames(text,tyres){
 return escapeHTML(text).replace(/\b(Soft|Medium|Hard|Intermediate|Wet)(s)?\b/g,(word,name)=>`<span class="school-tyre-name" style="color:${tyres[compounds[name]].color}">${word}</span>`);
}
