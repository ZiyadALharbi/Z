export class IterationBudget {
    private remaining: number;

    constructor(maxIterations: number){
        if (maxIterations < 1) {
            throw new Error('maxIterations must be at least 1');
        }
        this.remaining = maxIterations
    }

    consume(): boolean {
        if (this.remaining <= 0 ) return false;
        this.remaining -= 1;
        return true;
    }

    getRemaining(): number {
        return this.remaining;
    }
}