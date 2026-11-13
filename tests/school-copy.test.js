import test from 'node:test';
import assert from 'node:assert/strict';
import {colourTyreNames} from '../src/school-copy.js';
const tyres={S:{color:'#f00'},M:{color:'#ff0'},H:{color:'#fff'},I:{color:'#0f0'},W:{color:'#00f'}};
test('Race School names keep compound colours for singular and plural labels',()=>{
 const names=['Soft','Medium','Hard','Intermediate','Wet'];
 names.forEach((name,i)=>{
  for(const word of [name,name+'s'])assert.equal(colourTyreNames(word,tyres),`<span class="school-tyre-name" style="color:${Object.values(tyres)[i].color}">${word}</span>`);
 });
});
test('Race School colour markup escapes lesson content without colouring partial words',()=>{
 assert.equal(colourTyreNames('<script>"&\'</script> go hard, push harder, Hardship',tyres),'&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt; go hard, push harder, Hardship');
});
