export class MlArrayMetrics {
    /**
     * Calculates the Mean Absolute Error (MAE) between true and predicted values.
     *
     * @param {number[]} yTrue - The true values.
     * @param {number[]} yPred - The predicted values.
     * @returns {number} The Mean Absolute Error.
     */
    static meanAbsoluteError(yTrue: number[], yPred: number[]): number {
        const n = yTrue.length;
        let sum = 0;

        for (let i = 0; i < n; i += 1) {
            sum += Math.abs(yTrue[i] - yPred[i]);
        }

        return sum / n;
    }

    /**
     * Calculates the Mean Squared Error (MSE) between true and predicted values.
     *
     * @param {number[]} yTrue - The true values.
     * @param {number[]} yPred - The predicted values.
     * @returns {number} The Mean Squared Error.
     */
    static meanSquaredError(yTrue: number[], yPred: number[]): number {
        const n = yTrue.length;
        let sum = 0;

        for (let i = 0; i < n; i += 1) {
            sum += (yTrue[i] - yPred[i]) ** 2;
        }

        return sum / n;
    }

    /**
     * Calculates the R-squared (coefficient of determination) between true and predicted values.
     *
     * @param {number[]} yTrue - The true values.
     * @param {number[]} yPred - The predicted values.
     * @returns {number} The R-squared value.
     */
    static rSquared(yTrue: number[], yPred: number[]): number {
        const n = yTrue.length;
        const yTrueMean = yTrue.reduce((sum, value) => sum + value) / n;
        let ssRes = 0;
        let ssTot = 0;

        for (let i = 0; i < n; i += 1) {
            ssRes += (yTrue[i] - yPred[i]) ** 2;
            ssTot += (yTrue[i] - yTrueMean) ** 2;
        }

        return 1 - ssRes / ssTot;
    }
}
