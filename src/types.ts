import { CancellationToken } from "./cancellation";

export type { CancellationToken } from "./cancellation";

export type Handler<I = void, O = any> =
    (input: I, token: CancellationToken) => Promise<O>;

export type Middleware<I = any, O = any, NextI = I, NextO = O> =
    (input: I,
        next: (input: NextI) => Promise<NextO>,
        token: CancellationToken
    ) => Promise<O>;

export type HandlerFactory =
    (procedureName: string) => Handler<any, any>;

export type Compensation = () => Promise<void> | void;

