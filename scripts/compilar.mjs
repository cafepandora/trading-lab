// Compila el TypeScript a .compilado/ para usarlo desde Node (laboratorio y
// pruebas usan exactamente el mismo código que corre en Cloudflare).
import { build } from 'esbuild';
await build({
  entryPoints: { lab: 'src/lab.ts', cartera: 'src/vivo/cartera.ts', simulacion: 'src/vivo/simulacion.ts', copia: 'src/vivo/copia/motor.ts', real: 'src/vivo/real/bot.ts' },
  outdir: '.compilado', bundle: true, format: 'esm', platform: 'neutral', outExtension: { '.js': '.mjs' }, logLevel: 'warning',
});
