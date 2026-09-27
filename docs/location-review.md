# Granskning av kartans ortpunkter

Datum: 2026-09-27. Den gemensamma platskatalogen och ortnamnen i standardfilen har jämförts utan ny automatisk geokodning. En avvikelse nedan är en **granskningssignal**, inte ett bevis på vilken punkt som är historiskt korrekt. Ett sockennamn, en gård och ett gammalt län kan ha olika lämpliga representativa punkter.

## Vad genomgången hittade

Katalogen hade 157 koordinater. Två namn, `Linneryd (Smalland), Sweden` och `Göteborg och Bohus, Sverige`, var satta till exakt samma generella Sverige-punkt som landnamnen `Sverige` och `Sweden`. De två uppenbart missvisande lokalpunkterna har satts till `null` i den gemensamma katalogen, så de inte visas som kartnålar innan någon valt källkontrollerade punkter. Samma gamla felpar ignoreras om det finns kvar i en webbläsares äldre geokodningscache.

Ytterligare åtta exakta namn har fått granskningsnoteringar i kartan. Exempel är `Kristinehamn, Örebro, Sverige` (cirka 63 km från en annan Kristinehamn-post), `Jönköpings Sofia (F)` (cirka 64 km från en annan Sofia/Jönköping-post) och `Säfsnäs, Gällinge` (cirka 331 km från Säfsnäs i Dalarna). Den sista avvikelsen kan beskriva **två skilda platser med samma namn**; den ska inte flyttas till Dalarna utan källkontroll.

Samma koordinat förekommer också för flera olika förstaled i ortnamn. Det kan vara en avsiktlig sockenpunkt snarare än en exakt gårdspunkt. Kartan föreslår dessa för granskning och låter användaren markera dem som ungefärliga.

Tidigare geokodade punkter som bara finns i en besökares webbläsare granskas lokalt. De kopieras inte till `public/locations.json` eller till detta dokument. Granskningsvyn skiljer mellan gemensam punkt, äldre lokal geokodning, lokal rättning, saknad punkt och lokalt bortvald punkt. Den lyfter även fram enstaka landnamn vars punkt hamnat långt utanför landet och platssträngar som uttryckligen nämner två olika länder.

## Så granskar du en punkt

1. Öppna **Karta → Granska platser**. Sök på det exakta ortnamnet. Granskningsförslag sorteras före övriga namn och visar hur många GEDCOM-händelser som använder platsen.
2. Välj platsen och jämför texten i GEDCOM med historiska och nutida källor. För svenska namn kan [Lantmäteriets Sök ortnamn](https://www.lantmateriet.se/sv/kartor/Ortnamn/sok-ortnamn/), [ISOF:s Ortnamnsregister](https://ortnamnsregistret.isof.se/) och [Lantmäteriets historiska kartor](https://www2.lantmateriet.se/sv/kartor/vara-karttjanster/Historiska-kartor/Soktips/) hjälpa. En namnpunkt kan vara satt för kartans etikett, inte vid en specifik gård.
3. Öppna `?edit=true` för lokal rättning. Ange latitud/longitud eller välj en punkt på kartan. Markera **Kontrollerad**, **Ungefärlig** eller **Felaktig**. Felaktig döljer bara det exakta namnets punkt i den egna webbläsaren; **Ångra lokal ändring** tar tillbaka föregående värde. Släktdata och ortnamnet ändras inte.
4. Använd **Exportera granskade beslut** om du vill spara det du själv markerat. Den filen är ett granskningsunderlag och importeras inte automatiskt till den gemensamma katalogen. Exporten under **Inställningar** innehåller kandidater för koordinatimport men utelämnar lokalt felmarkerade punkter.
5. En gemensam rättning görs först efter källkontroll genom att ändra den exakta raden i `public/locations.json` och köra `npm run locations:check`, `npm run test:locations` och `npm run build`. För en plats som saknar punkt kan en granskad kandidat importeras enligt `docs/location-cache.md`. Behåll råa GEDCOM-ortnamn oförändrade.

`?edit=true` ger bara lokala redigeringsknappar och är inte en behörighetskontroll. Ingen markering här publicerar en koordinat för andra besökare.
