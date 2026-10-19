import {build} from 'esbuild';
import {cp,mkdir,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true}); await mkdir('dist',{recursive:true});
for (const name of ['index.html','style.css','favicon.svg']) await cp(`public/${name}`,`dist/${name}`);
await build({entryPoints:['public/app.js'],bundle:true,format:'esm',target:'es2022',outfile:'dist/app.js',minify:true});
await cp('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','dist/pdf.worker.min.mjs');
console.log('Built Career Ops Workspace');
