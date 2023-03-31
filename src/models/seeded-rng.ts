export class SeededRandomNumberGenerator {
    private seed: number;

    constructor(seed: number) {
        this.seed = seed % 2147483647;
        if (this.seed <= 0) this.seed += 2147483646;
    }

    random(): number {
        return (this.seed = (this.seed * 16807) % 2147483647) / 2147483647;
    }
}
