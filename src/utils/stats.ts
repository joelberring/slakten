import { extractYear } from './dateUtils';

export interface StatsData {
    avgAgeByGeneration: { generation: number; avgAge: number; count: number }[];
    avgAgeByCentury: { century: string; avgAge: number; count: number }[];
    commonMaleNames: { name: string; count: number }[];
    commonFemaleNames: { name: string; count: number }[];
    totalPeople: number;
    peopleWithKnownAge: number;
}

export function calculateFamilyStats(individuals: any[], generationMap: Map<string, number>): StatsData {
    const ageByGen = new Map<number, { sum: number; count: number }>();
    const ageByCentury = new Map<string, { sum: number; count: number }>();
    const maleNames = new Map<string, number>();
    const femaleNames = new Map<string, number>();

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
            .sort((a, b) => a.century.localeCompare(b.century))
    };
}
