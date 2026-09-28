# Gemensam platskatalog för kartan

Kartan läser `public/locations.json` när sidan öppnas. Den innehåller exakta platsnamn från standardfilen `public/berring_messing-cleaned.ged` och antingen granskade koordinater eller `null` för olösta platser. Webbläsaren gör inga geokodningsanrop. Kartans bakgrundsrutor hämtas fortfarande via nätverket.

En valfri följeslagare, `public/location-precision.json`, kan markera punkter som bara anger ett ungefärligt läge. Formatet är `[["Exakt platssträng i GEDCOM", "approximate"]]`. Bara namngivna punkter får etiketten **Ungefärlig plats** och en streckad kartnål; om filen saknas gör kartan inget antagande om koordinaternas precision. En lokal koordinaträttning är en egen punkt och ärver inte den delade markeringen. Äldre tvådelade rader i `locations.json` fungerar oförändrat.

Platskatalogen och släktfilen hämtas samtidigt. När släktträdet har öppnats förbereds ortpunkterna och en lokal översiktskarta från [Natural Earth](https://www.naturalearthdata.com/about/) i bakgrunden. Översiktskartan följer med appen och visas direkt, även om nätet är långsamt. Detaljerade bakgrundsrutor från OpenStreetMap hämtas först när **Karta** faktiskt visas, enligt [deras tile-policy](https://operations.osmfoundation.org/policies/tiles/). Kartans zoomläge behålls vid vybyte. Ortskoordinaterna behöver ingen geokodning i webbläsaren.

Genomgången den 27–28 september 2026 omfattar alla **2 721** unika platssträngar i det rensade standardunderlaget. **2 567** har gemensamma koordinater (94,3 %), varav **1 979** är uttryckligen ungefärliga. **154** är fortfarande olösta efter granskning: ortnamnet är tvetydigt, platskedjan motsäger sig själv eller underlaget saknar en identifierbar plats. De visas inte som kartnålar. Det täcker **4 206 av 4 449** händelser med plats (94,5 %). Punkterna avser en namngiven ort, socken eller bygd, inte bevis för en viss historisk bostads exakta läge. För råa uppgifter som bara nämner en region eller ett land används ibland en tydligt märkt representativ punkt; en okänd gård får aldrig en punkt enbart från ett allmänt läns- eller landsuffix.

Urval, käll-ID, källfilernas SHA-256 och avvisningsorsaker finns i [genomgångens sammanfattning](grunddata-platser-2026-09-28.md) och dess länkade rapporter. Alla koordinater är förberedda filer i appen. Skriptet redovisar textnormaliseringar och ortsuffix som granskningsunderlag och tilldelar aldrig nya ungefärliga punkter automatiskt.

## Förbered fler koordinater utan geokodning vid kartöppning

Hämta GeoNames `SE.zip` och `admin1CodesASCII.txt` från [deras nedladdningsserver](https://download.geonames.org/export/dump/) till en privat arbetskatalog och packa upp `SE.txt`. GeoNames är [CC BY 4.0](https://www.geonames.org/export/). Kör sedan:

```bash
npm run locations:candidates -- --geonames /privat/sokvag/SE.txt --admin1 /privat/sokvag/admin1CodesASCII.txt --output /privat/sokvag/ortkandidater.json
```

Skriptet gör **inga nätanrop** och skriver endast den angivna privata granskningsfilen med läsrätt för ägaren. Den innehåller exakta namnträffar, käll-ID, län/administrativ kontext, koordinater, antal träffar och flaggor för landskonflikter. Inga kandidater blir automatiskt kartpunkter: äldre stavningar, lika ortnamn och motstridiga landsangivelser kräver kontroll. Granska ett exakt namn och dess platskontext, skapa sedan en privat importfil med enbart godkända par i formatet nedan och använd `locations:build` enligt nästa avsnitt. Den publika [Nominatim-tjänsten](https://operations.osmfoundation.org/policies/nominatim/) används inte för massgeokodning.

## Kontrollera och uppdatera

```bash
npm run locations:check
npm run locations:build
```

`locations:check` läser filerna och visar bara antal. `locations:build` uppdaterar den delade katalogen deterministiskt: den behåller befintliga granskade koordinater och lägger till nya platser från standardfilen med `null`. Granska ändringen i `public/locations.json` innan den publiceras, eftersom platsnamnen blir åtkomliga för besökare.

Öppna **Karta → Granska platser** för att se granskningsförslag och söka på exakt ortnamn. Med `?edit=true` kan du rätta koordinaten, välja en punkt på kartan, markera den som kontrollerad/ungefärlig/felaktig och ångra en lokal rättning. Rättningen sparas bara i din webbläsare. En markör som samlar flera exakta ortnamn kan inte dras som grupp; välj ett namn i dess popup och rätta det separat. `?edit=true` är ett användargränssnitt, inte en inloggning eller publiceringsrättighet. Se [platsgranskningen](location-review.md) för fynd och arbetsgång.

Via **Inställningar → Exportera lokala koordinater** går det att spara äldre lokala förslag och egna rättningar. Koordinater som markerats felaktiga och de tio exakta gamla felparen från granskningen utelämnas. Även äldre lokalt sparade koordinater kan användas i den egna webbläsaren. De blir inte delade förrän de har granskats och importerats i katalogen.

För att slå ihop en granskad JSON-fil med koordinater, i formatet `[["Plats", {"lat": 59.3, "lon": 18.1}]]`, kör:

```bash
node --experimental-strip-types scripts/build-location-cache.mjs --import /privat/sokvag/granskade-platser.json --output public/locations.json
```

Importen får bara fylla platser som finns i standardfilen eller redan i den delade katalogen. Namn från en privat uppladdad GEDCOM utelämnas; endast antalet utelämnade rader rapporteras. Motstridiga koordinater stoppar importen och kräver manuell granskning. Publicera aldrig en rå lokal export utan denna kontroll och en genomgång av katalogändringen.
