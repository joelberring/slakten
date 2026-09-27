import { readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseGedcomData } from '../src/utils/gedcomParser.ts';
import { buildGeoNamesReview } from './geonames-review-core.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function parseArguments(args) {
  const options = {
    gedcom: resolve(ROOT, 'public/berring_messing-cleaned.ged'),
    catalog: resolve(ROOT, 'public/locations.json'),
    geonames: null,
    admin1: null,
    output: null,
  };
  const names = new Map([
    ['--gedcom', 'gedcom'], ['--catalog', 'catalog'], ['--geonames', 'geonames'],
    ['--admin1', 'admin1'], ['--output', 'output'],
  ]);
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const key = names.get(args[index]);
    const value = args[index + 1];
    if (!key || !value || value.startsWith('--') || seen.has(key)) {
      throw new Error('Använd --geonames SE.txt --output PRIVAT.json [--admin1 admin1CodesASCII.txt] [--gedcom FIL] [--catalog JSON].');
    }
    seen.add(key);
    options[key] = resolve(value);
  }
  if (!options.geonames || !options.output) {
    throw new Error('Både --geonames och --output krävs.');
  }
  return options;
}

async function assertPrivateOutput(path) {
  if (!isAbsolute(path)) throw new Error('Utdata måste vara en absolut privat sökväg.');
  const root = await realpath(ROOT);
  const parent = await realpath(dirname(path));
  if (parent === root || parent.startsWith(`${root}${sep}`)) {
    throw new Error('Granskningsfilen får inte skrivas i webbprojektet. Välj en privat katalog utanför projektet.');
  }
}

export async function runGeoNamesReview(args, output = process.stdout) {
  const options = parseArguments(args);
  await assertPrivateOutput(options.output);
  const [gedcomText, catalogText, geonamesText, admin1Text] = await Promise.all([
    readFile(options.gedcom, 'utf8'),
    readFile(options.catalog, 'utf8'),
    readFile(options.geonames, 'utf8'),
    options.admin1 ? readFile(options.admin1, 'utf8') : '',
  ]);
  const review = buildGeoNamesReview({
    gedcom: parseGedcomData(gedcomText),
    catalogRows: JSON.parse(catalogText),
    geonamesText,
    admin1Text,
  });
  // Exclusive create prevents accidentally overwriting an earlier review.
  // The 0600 mode keeps GEDCOM place strings out of other local accounts.
  await writeFile(options.output, `${JSON.stringify(review, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  output.write(`Granskningsfil skapad: ${review.summary.unresolvedPlaces} olösta platser, ${review.summary.placesWithCandidates} med GeoNames-kandidater, ${review.summary.countryMismatchesWithCandidates} med landskonflikt. Ingen koordinat publicerades.\n`);
  return review;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runGeoNamesReview(process.argv.slice(2)).catch((error) => {
    // Paths and GEDCOM place text must not leak to terminal output.
    process.stderr.write(error instanceof Error && /^(Både --geonames|Använd --geonames|Granskningsfilen)/.test(error.message)
      ? `${error.message}\n`
      : 'GeoNames-granskningsfilen kunde inte skapas. Kontrollera privata sökvägar och indata.\n');
    process.exitCode = 1;
  });
}
