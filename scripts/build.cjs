const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs/promises');

const watch = process.argv.includes('--watch');
const outdir = 'dist';

async function build() {
  // Clean the output directory
  await fs.rm(outdir, { recursive: true, force: true });
  await fs.mkdir(outdir, { recursive: true });

  // Define esbuild options
  const options = {
    entryPoints: ['src/main.js', 'style.css'],
    bundle: true,
    minify: !watch,
    sourcemap: true,
    outdir: outdir,
    entryNames: '[name].bundle',
    loader: {
      '.png': 'file',
      '.jpg': 'file',
      '.svg': 'file',
    },
    logLevel: 'info',
  };

  // Copy and transform index.html
  let html = await fs.readFile('index.html', 'utf-8');
  html = html
    .replace(
      '<link rel="stylesheet" href="style.css">',
      '<link rel="stylesheet" href="style.bundle.css">'
    )
    .replace(
      '<script type="module" src="src/main.js"></script>',
      '<script defer src="main.bundle.js"></script>'
    );
  await fs.writeFile(path.join(outdir, 'index.html'), html);

  // Copy assets
  await fs.cp('assets', path.join(outdir, 'assets'), { recursive: true });
  await fs.cp('CNAME', path.join(outdir, 'CNAME'));

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    const { host, port } = await ctx.serve({
      servedir: outdir,
      port: 8080,
    });
    console.log(`[watch] Server listening on http://${host}:${port}`);
  } else {
    await esbuild.build(options);
    console.log('[build] Build complete.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
