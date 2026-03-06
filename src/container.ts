import type { Middleware, HandlerFactory } from './types';
import { token } from './cancellation';

function compose(factory: HandlerFactory, mw: Middleware<any, any>, name: string) {
    const handler = factory(name);

    return async (input: any) => {
        const t = token();
        return mw(input, (next) => handler(next, t), t);
    };
}

type RegisterBuilder<T extends Record<string, any>, Name extends string, I, O> = {
    using(factory: HandlerFactory): ContainerInstance<T & { [K in Name]: { input: I; output: O } }>;
    middleware(mw: Middleware<I, O>): RegisterBuilder<T, Name, I, O>;
};

type ContainerInstance<T extends Record<string, any>> = {
    /** @internal Phantom type carrier for generic inference — do not use at runtime */
    readonly __$type: T;

    register<Name extends string>(name: Name): RegisterBuilder<T, Name, any, any>;
    register<I, O>(name: string): RegisterBuilder<T, string, I, O>;

    execute<K extends keyof T>(
        name: K,
        input?: T[K]['input']
    ): Promise<T[K]['output']>;

    execute<I = any, O = any>(
        name: string,
        input?: I
    ): Promise<O>;
};

export function container<T extends Record<string, any> = {}>(
    registry = new Map<string, any>()
): ContainerInstance<T> {

    function execute<K extends keyof T>(
        name: K,
        input?: T[K]['input']
    ): Promise<T[K]['output']>;

    function execute<I = any, O = any>(
        name: string,
        input?: I
    ): Promise<O>;

    async function execute(name: string, input?: any): Promise<any> {
        const proc = registry.get(name);
        if (!proc) throw new Error('not found');
        return proc(input);
    }

    function _doRegister<I, O, Name extends string>(
        name: Name,
        factory: HandlerFactory,
        mw: Middleware<I, O> = async (input, next) => next(input)
    ) {
        const procedure = compose(factory, mw, name);

        const newRegistry = new Map(registry);
        newRegistry.set(name, procedure);

        type NewT = T & { [K in Name]: { input: I; output: O } };

        return container<NewT>(newRegistry);
    }

    return {
        register: <Name extends string>(name: Name) => ({
            using: (factory: HandlerFactory) => {
                return _doRegister<any, any, Name>(name, factory);
            },
            middleware: (mw: Middleware<any, any>) => ({
                using: (factory: HandlerFactory) => {
                    return _doRegister<any, any, Name>(name, factory, mw);
                },
                middleware: () => { throw new Error('Middleware chaining at container level is not supported. Use api() adapter for chaining.'); }
            })
        }),

        execute
    } as unknown as ContainerInstance<T>;
}