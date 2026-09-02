const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs/promises');

const watch = process.argv.includes('--watch');
const outdir = 'dist';

async function build() {
  // Clean the output directory
  await fs.rm(outdir, { recursive: true, force: true });
  await fs.mkdir(outdir, { recursive: true });

  // Define esbuild options. A production build puts a content hash in each
  // bundle name, so a cached bundle from an older deploy can never be served
  // against a newer index.html. Watch mode keeps stable names, because the
  // dev server rewrites index.html only once.
  const options = {
    entryPoints: ['src/main.js', 'src/boot.js', 'style.css'],
    bundle: true,
    minify: !watch,
    sourcemap: true,
    outdir: outdir,
    entryNames: watch ? '[name].bundle' : '[name]-[hash].bundle',
    metafile: !watch,
    loader: {
      '.png': 'file',
      '.jpg': 'file',
      '.svg': 'file',
      '.woff2': 'file',
    },
    logLevel: 'info',
  };

  // Rewrite the source references in index.html to the bundle names. The
  // boot script keeps its blocking, non-deferred tag: it has to run before
  // the first paint, ahead of the deferred main bundle.
  async function writeHtml(jsName, bootName, cssName) {
    let html = await fs.readFile('index.html', 'utf-8');
    html = html
      .replace(
        '<link rel="stylesheet" href="style.css" />',
        `<link rel="stylesheet" href="${cssName}" />`
      )
      .replace('<script src="src/boot.js"></script>', `<script src="${bootName}"></script>`)
      .replace(
        '<script type="module" src="src/main.js"></script>',
        `<script defer src="${jsName}"></script>`
      );
    await fs.writeFile(path.join(outdir, 'index.html'), html);
  }

  // Copy assets
  await fs.cp('assets', path.join(outdir, 'assets'), { recursive: true });
  await fs.cp('CNAME', path.join(outdir, 'CNAME'));
  // The app fetches this at startup, so ship it rather than letting the
  // request 404. Only this one file, so a GM's other library/ contents stay
  // out of a published build.
  await fs.mkdir(path.join(outdir, 'library'), { recursive: true });
  await fs.cp(
    'library/campaign-library.json',
    path.join(outdir, 'library/campaign-library.json')
  );

  if (watch) {
    await writeHtml('main.bundle.js', 'boot.bundle.js', 'style.bundle.css');
    const ctx = await esbuild.context(options);
    await ctx.watch();
    const { host, port } = await ctx.serve({
      servedir: outdir,
      port: 8080,
    });
    console.log(`[watch] Server listening on http://${host}:${port}`);
  } else {
    const result = await esbuild.build(options);
    const outputs = Object.keys(result.metafile.outputs);
    const jsName = outputs.find(
      (p) => p.endsWith('.js') && path.basename(p).startsWith('main-')
    );
    const bootName = outputs.find(
      (p) => p.endsWith('.js') && path.basename(p).startsWith('boot-')
    );
    const cssName = outputs.find(
      (p) => p.endsWith('.css') && path.basename(p).startsWith('style-')
    );
    if (!jsName || !bootName || !cssName) {
      throw new Error('Bundle outputs not found in the esbuild metafile.');
    }
    await writeHtml(path.basename(jsName), path.basename(bootName), path.basename(cssName));
    console.log('[build] Build complete.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
