# Granskad rensning av appens grunddata

Datum: 2026-09-27. Appen läser `public/berring_messing-cleaned.ged`. Filen i projektets rot är en identisk kopia. Äldre GEDCOM-varianter i `public/` är arkivkopior och har inte ändrats.

## Personer

Två personer förekom i två poster vardera med förenliga datum, samma föräldrar och samma barn/familjer:

| Person | Behållen post | Sammanförd post |
| --- | --- | --- |
| Brita Spielsbodotter | `@I262744864953@` | `@I262744865581@` |
| Olof Nilsson | `@I262744714665@` | `@I262744889570@` |

Alternativa originalstavningar av datum och plats samt tidigare person-ID ligger som `NOTE` i respektive behållen post. Familjernas personpekare och personernas `FAMC`/`FAMS`-hänvisningar uppdaterades. Antalet personposter minskade från 2 381 till 2 379.

Fem andra förslagsgrupper lämnades orörda: Clara Hammarbäck och Walba Larsdotter Hansas har motstridiga eller felaktiga familjeband; Karin Ersdotter, Karin Matsdotter och Mats Matsson har uppgifter som skiljer personerna åt. Namn och födelseår ensamma räcker inte som bevis för att förena dem.

## Familjer

Efter personsammanslagningarna fanns 207 grupper med identiska familjeposter. I dessa grupper innehöll familjeposterna enbart samma `HUSB`, `WIFE` och `CHIL` utan egna händelser, källor eller anteckningar. En post per unik familjestruktur behölls. Det tog bort 285 överflödiga `FAM`-poster och 594 redundanta `FAMC`/`FAMS`-hänvisningar, från 1 625 till 1 340 familjeposter. Kommentarer under personernas familjehänvisningar behölls. Alla unika relationer och källhänvisningar jämfördes före och efter.

Den fullständiga [ID-mappningen](duplicate-family-normalization.json) och det hashskyddade [engångsskriptet](../scripts/normalize-duplicate-families.mjs) gör ändringen granskningsbar. Testet `tests/bundledData.test.mjs` bevakar den publicerade filens referenser, antal och kvarvarande dubblettförslag.
