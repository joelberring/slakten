/** Findings from comparing coordinate variants in the bundled shared catalog.
 * These are review prompts, not replacements or proof of a correct point.
 * No locally cached or privately uploaded coordinates belong here.
 */
export const sharedLocationReviewFlags = new Map<string, readonly string[]>([
    ['Linneryd (Smalland), Sweden', ['Den tidigare allmänna Sverigepunkten har ersatts med en granskad ungefärlig Linnerydspunkt. Punkten representerar socknen, inte en fastställd bostad.']],
    ['Säfsnäs, Gällinge', ['Den tidigare Hallandspunkten har ersatts med en granskad ungefärlig Säfsnäspunkt. ISOF belägger Gällinge/Villbäck i Säfsnäs; punkten representerar socknen, inte en fastställd gård.']],
    ['Göteborg och Bohus, Sverige', ['Den tidigare allmänna Sverigepunkten har ersatts med en granskad ungefärlig punkt vid Göteborg. Punkten representerar det historiska länet; ingen enskild ort eller bostad är fastställd.']],
    ['Linneryd, Östergård, Kronobergs län, Sverige', ['Den tidigare detaljpunkten låg cirka 90 km från Linneryd och har tagits bort. Den ersättande sockenpunkten är ungefärlig; Östergårds exakta läge är inte fastställt.']],
    ['Kristinehamn, Örebro, Sverige', ['Den tidigare punkten låg vid Örebro stad, inte Kristinehamn, och har tagits bort. Platssträngen har motstridig länskontext och saknar fortfarande en säker koordinat.']],
    ['Skogsryd backagård Linneryd, Kronoberg, Sverige', ['Den tidigare detaljpunkten avvek cirka 46 km och har tagits bort. Den ersättande Linnerydspunkten visar bara socknen, inte gårdens läge.']],
    ['Linneryds by, Kronobergs län, Sverige', ['Den tidigare detaljpunkten avvek cirka 46 km och har tagits bort. Den ersättande Linnerydspunkten är en ungefärlig sockenpunkt, inte byns exakta läge.']],
    ['Jönköpings Sofia (F)', ['Den tidigare punkten avvek cirka 64 km och har tagits bort. Den ersättande punkten visar ungefärligt Jönköpings Sofia-område.']],
    ['Nora stadsförsamling, Örebro, Sverige', ['Den tidigare punkten låg vid Örebro stad och har tagits bort. Den ersättande punkten representerar ungefärligt Nora stad, inte en fastställd församlingsgräns.']],
    ['Säfnäs, Kopparberg, Sweden', ['Den tidigare punkten avvek cirka 44 km och har tagits bort. Den ersättande Säfsnäspunkten är en ungefärlig sockenpunkt.']],
]);
