import { extractYear } from './dateUtils';

export interface StatsData {
    avgAgeByGeneration: { generation: number; avgAge: number; count: number }[];
    avgAgeByCentury: { century: string; avgAge: number; count: number }[];
    commonMaleNames: { name: string; count: number }[];
    commonFemaleNames: { name: string; count: number }[];
    totalPeople: number;
    peopleWithKnownAge: number;
    avgParentalAge: {
        total: { father: number; mother: number; fatherCount: number; motherCount: number };
        byGeneration: { generation: number; fatherAvg: number; motherAvg: number }[];
        byCentury: { century: string; fatherAvg: number; motherAvg: number }[];
    };
}

export function calculateFamilyStats(individuals: any[], families: any[], generationMap: Map<string, number>): StatsData {
    const ageByGen = new Map<number, { sum: number; count: number }>();
    const ageByCentury = new Map<string, { sum: number; count: number }>();
    const maleNames = new Map<string, number>();
    const femaleNames = new Map<string, number>();

    const parentalAgeByGen = new Map<number, { fSum: number; fCount: number; mSum: number; mCount: number }>();
    const parentalAgeByCentury = new Map<string, { fSum: number; fCount: number; mSum: number; mCount: number }>();
    const totalParentalAge = { fSum: 0, fCount: 0, mSum: 0, mCount: 0 };

    let peopleWithAge = 0;

    individuals.forEach(ind => {
        const bYear = extractYear(ind.birthDate);
        const dYear = extractYear(ind.deathDate);

        // Name processing
        const firstName = (ind.name || '').split(' ')[0].replace(/[^a-zåäöA-ZÅÄÖ]/g, '');
        if (firstName && firstName.length > 1) {
            if (ind.sex === 'M') {
                maleNames.set(firstName, (maleNames.get(firstName) || 0) + 1);
            } else if (ind.sex === 'F') {
                femaleNames.set(firstName, (femaleNames.get(firstName) || 0) + 1);
            }
        }

        // Age processing
        if (bYear && dYear) {
            const age = dYear - bYear;
            if (age >= 0 && age < 120) {
                peopleWithAge++;

                // By Generation
                const gen = generationMap.get(ind.id);
                if (gen !== undefined) {
                    const current = ageByGen.get(gen) || { sum: 0, count: 0 };
                    ageByGen.set(gen, { sum: current.sum + age, count: current.count + 1 });
                }

                // By Century
                const century = `${Math.floor(bYear / 100)}00-talet`;
                const currentC = ageByCentury.get(century) || { sum: 0, count: 0 };
                ageByCentury.set(century, { sum: currentC.sum + age, count: currentC.count + 1 });
            }
        }
    });

    // Parental Age Processing
    families.forEach(fam => {
        const husb = individuals.find(i => i.id === fam.husb);
        const wife = individuals.find(i => i.id === fam.wife);
        const fatherBirth = husb ? extractYear(husb.birthDate) : null;
        const motherBirth = wife ? extractYear(wife.birthDate) : null;

        fam.children.forEach((childId: string) => {
            const child = individuals.find(i => i.id === childId);
            const childBirth = child ? extractYear(child.birthDate) : null;
            const gen = child ? generationMap.get(childId) : null;

            if (childBirth) {
                const century = `${Math.floor(childBirth / 100)}00-talet`;

                if (!parentalAgeByCentury.has(century)) {
                    parentalAgeByCentury.set(century, { fSum: 0, fCount: 0, mSum: 0, mCount: 0 });
                }
                const cData = parentalAgeByCentury.get(century)!;

                if (gen !== null && gen !== undefined) {
                    if (!parentalAgeByGen.has(gen)) {
                        parentalAgeByGen.set(gen, { fSum: 0, fCount: 0, mSum: 0, mCount: 0 });
                    }
                }
                const gData = gen !== null && gen !== undefined ? parentalAgeByGen.get(gen)! : null;

                if (fatherBirth) {
                    const age = childBirth - fatherBirth;
                    if (age > 12 && age < 80) {
                        totalParentalAge.fSum += age;
                        totalParentalAge.fCount++;
                        cData.fSum += age;
                        cData.fCount++;
                        if (gData) {
                            gData.fSum += age;
                            gData.fCount++;
                        }
                    }
                }
                if (motherBirth) {
                    const age = childBirth - motherBirth;
                    if (age > 12 && age < 60) {
                        totalParentalAge.mSum += age;
                        totalParentalAge.mCount++;
                        cData.mSum += age;
                        cData.mCount++;
                        if (gData) {
                            gData.mSum += age;
                            gData.mCount++;
                        }
                    }
                }
            }
        });
    });

    const sortMapByCount = (map: Map<string, number>) =>
        Array.from(map.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

    return {
        totalPeople: individuals.length,
        peopleWithKnownAge: peopleWithAge,
        commonMaleNames: sortMapByCount(maleNames),
        commonFemaleNames: sortMapByCount(femaleNames),
        avgAgeByGeneration: Array.from(ageByGen.entries())
            .map(([generation, data]) => ({ generation, avgAge: Math.round(data.sum / data.count), count: data.count }))
            .sort((a, b) => a.generation - b.generation),
        avgAgeByCentury: Array.from(ageByCentury.entries())
            .map(([century, data]) => ({ century, avgAge: Math.round(data.sum / data.count), count: data.count }))
            .sort((a, b) => a.century.localeCompare(b.century)),
        avgParentalAge: {
            total: {
                father: totalParentalAge.fCount > 0 ? Math.round(totalParentalAge.fSum / totalParentalAge.fCount) : 0,
                mother: totalParentalAge.mCount > 0 ? Math.round(totalParentalAge.mSum / totalParentalAge.mCount) : 0,
                fatherCount: totalParentalAge.fCount,
                motherCount: totalParentalAge.mCount
            },
            byGeneration: Array.from(parentalAgeByGen.entries())
                .map(([generation, data]) => ({
                    generation,
                    fatherAvg: data.fCount > 0 ? Math.round(data.fSum / data.fCount) : 0,
                    motherAvg: data.mCount > 0 ? Math.round(data.mSum / data.mCount) : 0
                }))
                .filter(i => i.fatherAvg > 0 || i.motherAvg > 0)
                .sort((a, b) => a.generation - b.generation),
            byCentury: Array.from(parentalAgeByCentury.entries())
                .map(([century, data]) => ({
                    century,
                    fatherAvg: data.fCount > 0 ? Math.round(data.fSum / data.fCount) : 0,
                    motherAvg: data.mCount > 0 ? Math.round(data.mSum / data.mCount) : 0
                }))
                .filter(i => i.fatherAvg > 0 || i.motherAvg > 0)
                .sort((a, b) => a.century.localeCompare(b.century))
        }
    };
}
