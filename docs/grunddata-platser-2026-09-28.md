# Grunddata och platser efter genomgången

Datum: 2026-09-28. Ändringarna gäller appens medföljande grundunderlag och den gemensamma platskatalogen. Privata uppladdningar och avsiktliga lokala koordinaträttningar är separata.

## Resultat

| Uppgift | Före | Efter |
| --- | ---: | ---: |
| Personposter | 2 381 | 2 379 |
| Familjeposter | 1 625 | 1 340 |
| Unika aktiva platssträngar | 2 724 | 2 721 |
| Aktiva platssträngar med gemensam koordinat | 171 | 2 567 |
| Därav uttryckligen ungefärliga | Saknade gemensam precisionsmärkning | 1 979 |
| Aktiva platssträngar utan koordinat | 2 553 | 154 |

Två säkra persondubbletter och 285 identiska familjeposter har förenats. Originalvarianter och tidigare ID är bevarade; alla unika relationer och källhänvisningar jämfördes före och efter. Fem osäkra kandidatgrupper är oförändrade. Den detaljerade [rensningsrapporten](grunddata-rensning-2026-09-27.md) och [familjernas ID-mappning](duplicate-family-normalization.json) förklarar urvalet. Sparade vyer för standardfilen flyttas till den nya filversionen med gamla person- och familje-ID remappade.

2 397 tidigare olösta aktiva platssträngar har fått koordinater, 7 befintliga punkter har ersatts och 1 felaktig punkt har tagits bort utan ersättning. Platskatalogen omfattar 94,3 % av namnen och 4 206/4 449 händelser med plats (94,5 %).

## Hur kartpunkterna valdes

Varje saknad platssträng har gåtts igenom. Svenska socknar och andra tydligt namngivna bygder får en representativ, märkt ungefärlig punkt när gården inte kan placeras säkert. Region- eller landpunkter används bara när själva råa uppgiften uttryckligen är så bred. En okänd gård tilldelas inte en läns- eller landpunkt enbart för att dess namn slutar med ett sådant område. Identiska namn i olika bygder och samtidiga motstridiga län/länder kräver mer underlag och lämnas olösta. Historiska länstillhörigheter och bekräftade äldre stavningar kan däremot förklara skillnader mot dagens namn.

Ortdata kommer främst från [GeoNames](https://www.geonames.org/export/) (CC BY 4.0). Rapporterna sparar faktiska käll-ID, namn, koordinater och nedladdade landfilers SHA-256. Historisk kontext har kontrollerats mot bland annat [Riksarkivets kartor 1890](https://sok.riksarkivet.se/folkrakningar?infosida=kartor-1890), [ISOF:s ortnamnsregister](https://ortnamnsregistret.isof.se/), kommuners publicerade underlag och namngivna historiska källor. GeoNames erkänns i kartans attribution.

- [Svenska ortpunkter och borttagna fel](swedish-places-reviewed-2026-09-27.json)
- [Första gruppen med representativa svenska sockenpunkter](approximate-places-reviewed-2026-09-27.json)
- [Vanliga återstående namn och stavningsvarianter](high-frequency-places-reviewed-2026-09-28.json)
- [Svenska platssträngar A–M](swedish-parish-places-reviewed-part1-2026-09-28.json)
- [Svenska platssträngar M–Ö](swedish-parish-places-reviewed-part2-2026-09-28.json)
- [Svenska strängar utan kommatecken](swedish-bare-places-reviewed-2026-09-28.json)
- [Första platsvarianterna utanför Sverige](non-swedish-places-reviewed-2026-09-27.md)
- [Fortsatt internationell genomgång](non-swedish-places-reviewed-2026-09-28.json)
- [Kontroll av internationella käll-ID och koordinater](non-swedish-place-validation-2026-09-28.json)
- [Ungefärlig märkning av befintliga ö- och regionpunkter](existing-broad-place-precision-2026-09-28.json)
- [Slutkomplement för namngivna bygder och rena regionnamn](final-place-supplement-2026-09-28.json)
- [Kontroll av historiska ortnamn och homonymer](place-context-supplement-2026-09-28.json)

De 154 [olösta strängarna](unresolved-places-reviewed-2026-09-28.json) har varsin avvisningsorsak och verifierbar rapportreferens. En ofullständig ortuppgift, en tveksam tolkning eller en geografisk konflikt har inte ersatts av ett gissat exakt läge.

## Kontroll

- GEDCOM-kopiorna är identiska; alla familjepekare pekar på befintliga personer och inga identiska familjestrukturer återstår.
- Alla aktiva GEDCOM-platssträngar finns i katalogen, även olösta som `null`.
- Precisionsfilen innehåller bara unika `approximate`-rader för verkliga delade punkter.
- De tio avvisade gamla namn/koordinat-paren kan inte återkomma från äldre automatisk browsercache.
- Den fullständiga Node-sviten har 78 godkända tester; TypeScript och Vite bygger utan fel. Vite rapporterar samma stora app-bundle som tidigare.

## SHA-256 för publicerat grundunderlag

| Fil | SHA-256 |
| --- | --- |
| `public/berring_messing-cleaned.ged` | `c13553086b6f80f129f89d93735c06f3bea14c846ba507df94c293a0c68c7d10` |
| `public/locations.json` | `512b7f0b9a9305a7b38a7ac3b1f8cf16c5c9caa190324aae0a93e7c7cd078eb0` |
| `public/location-precision.json` | `4f0062bae9d2468b1dd24c95efd07f8de0c62a28ecd8ffe97d7ecd4d7028795d` |
