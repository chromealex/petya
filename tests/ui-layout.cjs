const assert = require('node:assert/strict');
module.exports = async win => {
  const original = win.getSize();
  const minimum = win.getMinimumSize();
  try {
    win.setMinimumSize(360, 400);
    for (const width of [2560, 1920, 1280, 980, 700, 390]) {
      win.setSize(width, 900);
      await new Promise(resolve => setTimeout(resolve, 150));
      const result = await win.webContents.executeJavaScript(`(() => {
        view('home');
        const shortcutDialog=document.getElementById('command-shortcuts').closest('dialog');
        const wasDialogOpen=shortcutDialog?.open;
        if(shortcutDialog&&!wasDialogOpen)shortcutDialog.showModal();
        const shortcutDisclosures=[];
        for(let node=document.getElementById('command-shortcuts').parentElement;node;node=node.parentElement){
          if(node.tagName==='DETAILS'){shortcutDisclosures.push([node,node.open]);node.open=true;}
        }
        const buttons = [...document.querySelectorAll('#command-shortcuts button')];
        const rects = buttons.map(button => button.getBoundingClientRect());
        const collisions = rects.some((a,i) => rects.slice(i+1).some(b =>
          a.left < b.right + 7 && a.right + 7 > b.left && a.top < b.bottom + 7 && a.bottom + 7 > b.top));
        shortcutDisclosures.forEach(([node,open])=>node.open=open);
        if(shortcutDialog&&!wasDialogOpen)shortcutDialog.close();
        const overflow = [];
        for(const section of document.querySelectorAll('.view')) {
          view(section.id);
          const editors=[...section.querySelectorAll('.compact-editor, .settings-disclosure')];
          const open=editors.map(e=>e.open);editors.forEach(e=>e.open=true);
          if(document.documentElement.scrollWidth > innerWidth + 1) overflow.push(section.id);
          editors.forEach((e,i)=>e.open=open[i]);
        }
        view('home');
        const main=document.querySelector('main').getBoundingClientRect();
        const aside=document.querySelector('body>aside');
        const edge=getComputedStyle(aside).position==='fixed'?aside.getBoundingClientRect().right:0;
        const centerOffset=Math.abs((main.left-edge)-(document.documentElement.clientWidth-main.right));
        return {count:buttons.length, collisions, overflow, centerOffset};
      })()`);
      assert.ok(result.centerOffset <= 2, 'Content must be centered beside navigation at '+width);
      assert.equal(result.count, 3);
      assert.equal(result.collisions, false, 'Shortcuts need visible separation at '+width);
      assert.deepEqual(result.overflow, [], 'Views overflow at '+width);
      if(width===980 && process.env.PETYA_UI_SCREENSHOTS==='1') {
        const ids=await win.webContents.executeJavaScript("[...document.querySelectorAll('.view')].map(e=>e.id)");
        for(const id of ids){
          await win.webContents.executeJavaScript('view('+JSON.stringify(id)+');window.scrollTo(0,0)');
          await new Promise(resolve=>setTimeout(resolve,100));
          require('node:fs').writeFileSync('/tmp/petya-page-'+id+'.png',(await win.webContents.capturePage()).toPNG());
        }
        await win.webContents.executeJavaScript("view('home')");
      }
      if(width===980) {
        await win.webContents.executeJavaScript("document.getElementById('command-form').scrollIntoView({block:'start'})");
        require('node:fs').writeFileSync('/tmp/petya-ui-layout.png', (await win.webContents.capturePage()).toPNG());
      }
    }
  } finally {
    win.setMinimumSize(...minimum);
    win.setSize(...original);
    await win.webContents.executeJavaScript("view('home');window.scrollTo(0,0)");
  }
};
