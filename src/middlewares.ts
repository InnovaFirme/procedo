import { Middleware } from "./types";

// Overload para 2 middlewares con tipado correcto (onion pattern)
// mw1 es la capa externa (define tipos externos I1/O1)
// mw2 está más cerca del handler
export function compound<I1, O1, NextI1, NextO1, NextI2, NextO2>(
    mw1: Middleware<I1, O1, NextI1, NextO1>,
    mw2: Middleware<NextI1, NextO1, NextI2, NextO2>
): Middleware<I1, O1, NextI2, NextO2>;

// Overload para 3 middlewares con tipado correcto
export function compound<I1, O1, NextI1, NextO1, NextI2, NextO2, NextI3, NextO3>(
    mw1: Middleware<I1, O1, NextI1, NextO1>,
    mw2: Middleware<NextI1, NextO1, NextI2, NextO2>,
    mw3: Middleware<NextI2, NextO2, NextI3, NextO3>
): Middleware<I1, O1, NextI3, NextO3>;

// Overload para 4 middlewares con tipado correcto
export function compound<I1, O1, NextI1, NextO1, NextI2, NextO2, NextI3, NextO3, NextI4, NextO4>(
    mw1: Middleware<I1, O1, NextI1, NextO1>,
    mw2: Middleware<NextI1, NextO1, NextI2, NextO2>,
    mw3: Middleware<NextI2, NextO2, NextI3, NextO3>,
    mw4: Middleware<NextI3, NextO3, NextI4, NextO4>
): Middleware<I1, O1, NextI4, NextO4>;

// Fallback genérico para más middlewares
export function compound<I, O, NextI = I, NextO = O>(...middlewares: Middleware<any, any, any, any>[]): Middleware<I, O, NextI, NextO>;

// Implementación
export function compound(...middlewares: Middleware<any, any, any, any>[]): Middleware<any, any, any, any> {
    return (input, next, token) => {
        const dispatch = (index: number, input: any): Promise<any> => {
            if (index === middlewares.length) {
                return next(input);
            }
            const mw = middlewares[index];
            return mw(input, (nextInput) => dispatch(index + 1, nextInput), token);
        };
        return dispatch(0, input);
    };
}