document.querySelectorAll('.media').forEach(section=>{
  const gallery=section.querySelector('.gallery'),output=section.querySelector('output');
  if(!gallery||!output)return;
  const images=[...gallery.querySelectorAll('img')];
  const current=()=>Math.max(0,Math.min(images.length-1,Math.round(gallery.scrollLeft/gallery.clientWidth)));
  const move=step=>gallery.scrollTo({left:((current()+step+images.length)%images.length)*gallery.clientWidth,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  section.querySelector('[data-gallery-prev]').addEventListener('click',()=>move(-1));
  section.querySelector('[data-gallery-next]').addEventListener('click',()=>move(1));
  gallery.addEventListener('scroll',()=>{output.textContent=(current()+1)+' / '+images.length;},{passive:true});
});
