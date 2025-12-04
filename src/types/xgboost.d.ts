// Type declarations for @fractal-solutions/xgboost-js
declare module '@fractal-solutions/xgboost-js' {
  export default class XGBoost {
    constructor(options: {
      max_depth?: number;
      eta?: number;
      objective?: string;
      booster?: string;
    });

    fit(X: number[][], y: number[], options?: { num_boost_round?: number }): Promise<void>;
    predict(X: number[][]): number[] | Promise<number[]>;
  }

  export { XGBoost };
}
