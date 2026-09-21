const fs=require('node:fs');
const path=require('node:path');
const esbuild=require('../happier/node_modules/esbuild');
esbuild.buildSync({entryPoints:[path.join(__dirname,'entry.ts')],bundle:true,format:'iife',globalName:'HabblaudArt',minify:true,outfile:path.join(__dirname,'../../habblaud-art.js'),banner:{js:'/*\nHabblaud pixel art — https://github.com/marmottajr/habblaud\n'+fs.readFileSync(path.join(__dirname,'LICENSE'),'utf8')+'\n*/'}});
