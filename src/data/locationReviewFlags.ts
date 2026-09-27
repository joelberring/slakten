/** Findings from comparing coordinate variants in the bundled shared catalog.
 * These are review prompts, not replacements or proof of a correct point.
 * No locally cached or privately uploaded coordinates belong here.
 */
export const sharedLocationReviewFlags = new Map<string, readonly string[]>([
    ['Linneryd (Smalland), Sweden', ['Tidigare automatisk punkt var en allmän Sverigepunkt, cirka 337 km från andra Linneryd-poster. En ny punkt behöver källkontroll.']],
    ['Säfsnäs, Gällinge', ['Punkten ligger cirka 331 km från andra Säfsnäs-poster i samma släktträd.']],
    ['Göteborg och Bohus, Sverige', ['Tidigare automatisk punkt var en allmän Sverigepunkt. Området behöver en källkontrollerad representativ punkt.']],
    ['Linneryd, Östergård, Kronobergs län, Sverige', ['Punkten ligger cirka 90 km från andra Linneryd-poster.']],
    ['Kristinehamn, Örebro, Sverige', ['Punkten ligger cirka 63 km från andra Kristinehamn-poster; platssträngen anger även ett annat län.']],
    ['Skogsryd backagård Linneryd, Kronoberg, Sverige', ['Punkten ligger cirka 46 km från en annan stavning av Skogsryd Backagård.']],
    ['Linneryds by, Kronobergs län, Sverige', ['Punkten ligger cirka 46 km från andra Linneryd-poster.']],
    ['Jönköpings Sofia (F)', ['Punkten ligger cirka 64 km från en annan Sofia/Jönköping-post.']],
    ['Nora stadsförsamling, Örebro, Sverige', ['Punkten ligger cirka 31 km från en annan Nora stadsförsamling-post.']],
    ['Säfnäs, Kopparberg, Sweden', ['Punkten ligger cirka 44 km från andra Säfsnäs-poster.']],
]);
