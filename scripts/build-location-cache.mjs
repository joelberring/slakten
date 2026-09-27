import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseGedcomData } from '../src/utils/gedcomParser.ts';
import { analyzeCoverage, buildLocationCatalog, collectGedcomPlaces } from './location-cache-core.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function parseArguments(args) {
  const options = {
    gedcom: resolve(ROOT, 'public/berring_messing-cleaned.ged'),
    existing: resolve(ROOT, 'public/locations.json'),
    imported: null,
    output: null,
  };
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (!['--gedcom', '--existing', '--import', '--output'].includes(name) || !args[index + 1]) {
      throw new Error('Använd --gedcom FIL --existing JSON --import JSON --output JSON. Endast --output skriver en fil.');
    }
    options[{ '--gedcom': 'gedcom', '--existing': 'existing', '--import': 'imported', '--output': 'output' }[name]] = resolve(args[++index]);
  }
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function runLocationCache(args, output = process.stdout) {
  const options = parseArguments(args);
  const gedcom = parseGedcomData(await readFile(options.gedcom, 'utf8'));
  const places = collectGedcomPlaces(gedcom);
  const existing = await readJson(options.existing);
  const imported = options.imported ? await readJson(options.imported) : [];
  const catalog = buildLocationCatalog(places, existing, imported);
  const analysis = analyzeCoverage(places, catalog.rows);

  if (options.output) {
    // The caller explicitly chooses publication: a static catalog contains
    // place names from the GEDCOM and must be reviewed before it is served.
    const temporary = join(dirname(options.output), `.${basename(options.output)}.${process.pid}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(catalog.rows, null, 2)}\n`, { flag: 'wx' });
      await rename(temporary, options.output);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  output.write(`GEDCOM-platser: ${catalog.stats.gedcomPlaces}. Koordinater: ${catalog.stats.resolved}. Olösta: ${catalog.stats.unresolved}.\n`);
  output.write(`Ytterligare exakta normaliseringar: ${analysis.normalized}. Unika ortsuffix för manuell granskning: ${analysis.suffixCandidate}. Tvetydiga: ${analysis.ambiguous}.\n`);
  output.write(`Importerade platser utanför delat underlag som utelämnades: ${catalog.stats.ignoredImported}.\n`);
  if (options.output) output.write('Delad platskatalog skriven.\n');
  return { ...catalog, analysis };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runLocationCache(process.argv.slice(2)).catch(() => {
    // Parser errors may contain GEDCOM excerpts. Keep the terminal output generic.
    process.stderr.write('Platskatalogen kunde inte förberedas. Kontrollera indata och argument.\n');
    process.exitCode = 1;
  });
}
