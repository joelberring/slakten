# Granskning av kartans ortpunkter

Datum: 2026-09-28. Alla platssträngar i appens grundunderlag har granskats mot ortnamn och lokal eller historisk kontext. Granskade punkter finns i den gemensamma katalogen för alla besökare; ingen ny geokodning behövs i webbläsaren. Representativa punkter för socknar, bygder, öar och breda regioner märks **Ungefärlig plats** och med streckad kartnål.

## Vad genomgången ändrade

Den första kontrollen fann två allmänna Sverige-punkter för Linneryd och Göteborg/Bohus, och därefter åtta felaktiga automatiska lokalpunkter. Av dessa tio kända felpar har **9** fått granskade ersättningspunkter och **1** saknar fortfarande en försvarbar punkt: `Kristinehamn, Örebro, Sverige`. Samtliga tio exakta gamla namn/koordinat-par ignoreras även i äldre geokodningscache, så avvisade kartnålar inte återkommer när en gammal besökare öppnar appen. En medveten lokal rättning kan fortfarande användas.

Linneryd och gårdar med uttryckligt Linneryds-sammanhang representeras av en granskad sockenpunkt när gårdens läge inte är verifierat. Jönköpings Sofia, Nora stadsförsamling och Säfsnäs har också fått kontrollerade representativa punkter. Råa ortnamn och historiska länsangivelser är oförändrade i släktfilen. En avvikande modern länskod är inte i sig bevis för ett gammalt fel: historiska församlingar och län jämfördes där det behövdes med Riksarkivets register.

Katalogen täcker nu **2 567 av 2 721** platssträngar. Se [genomgångens sammanfattning](grunddata-platser-2026-09-28.md) för källor och [de kvarvarande olösta namnen](unresolved-places-reviewed-2026-09-28.json) för den exakta avvisningsorsaken och rapportreferensen. En gemensam kartpunkt kan samla flera stavningar och gårdar; de ungefärliga namnen markeras även var för sig i popupen.

Tidigare geokodade punkter som bara finns i en besökares webbläsare granskas lokalt. De kopieras inte till `public/locations.json` eller till detta dokument. Granskningsvyn skiljer mellan gemensam punkt, äldre lokal geokodning, lokal rättning, saknad punkt och lokalt bortvald punkt. Den lyfter även fram enstaka landnamn vars punkt hamnat långt utanför landet och platssträngar som uttryckligen nämner två olika länder.

## Så granskar du en punkt

1. Öppna **Karta → Granska platser**. Sök på det exakta ortnamnet. Granskningsförslag sorteras före övriga namn och visar hur många GEDCOM-händelser som använder platsen.
2. Välj platsen och jämför texten i GEDCOM med historiska och nutida källor. För svenska namn kan [Lantmäteriets Sök ortnamn](https://www.lantmateriet.se/sv/kartor/Ortnamn/sok-ortnamn/), [ISOF:s Ortnamnsregister](https://ortnamnsregistret.isof.se/) och [Lantmäteriets historiska kartor](https://www2.lantmateriet.se/sv/kartor/vara-karttjanster/Historiska-kartor/Soktips/) hjälpa. En namnpunkt kan vara satt för kartans etikett, inte vid en specifik gård.
3. Öppna `?edit=true` för lokal rättning. Ange latitud/longitud eller välj en punkt på kartan. Markera **Kontrollerad**, **Ungefärlig** eller **Felaktig**. Felaktig döljer bara det exakta namnets punkt i den egna webbläsaren; **Ångra lokal ändring** tar tillbaka föregående värde. Släktdata och ortnamnet ändras inte.
4. Använd **Exportera granskade beslut** om du vill spara det du själv markerat. Den filen är ett granskningsunderlag och importeras inte automatiskt till den gemensamma katalogen. Exporten under **Inställningar** innehåller kandidater för koordinatimport men utelämnar lokalt felmarkerade punkter.
5. En gemensam rättning görs först efter källkontroll genom att ändra den exakta raden i `public/locations.json` och köra `npm run locations:check`, `npm run test:locations` och `npm run build`. För en plats som saknar punkt kan en granskad kandidat importeras enligt `docs/location-cache.md`. Behåll råa GEDCOM-ortnamn oförändrade.

`?edit=true` ger bara lokala redigeringsknappar och är inte en behörighetskontroll. Ingen markering här publicerar en koordinat för andra besökare.
