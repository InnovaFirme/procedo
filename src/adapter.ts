import type { Middleware, HandlerFactory } from './types';

// Inline compose: chains middlewares in onion pattern (no external compound needed)
function compose(...middlewares: Middleware<any, any, any, any>[]): Middleware<any, any, any, any> {
    return (input, next, token) => {
        const dispatch = (index: number, input: any): Promise<any> => {
            if (index === middlewares.length) return next(input);
            return middlewares[index](input, (nextInput) => dispatch(index + 1, nextInput), token);
        };
        return dispatch(0, input);
    };
}

type SnakeToCamelCase<S extends string> = S extends `${infer T}_${infer U}`
    ? `${T}${Capitalize<SnakeToCamelCase<U>>}`
    : S;

type CamelCaseAdapterMethods<T extends Record<string, any>> = {
    [K in keyof T as K extends string ? SnakeToCamelCase<K> : K]: (input?: T[K]['input']) => Promise<T[K]['output']>;
};

// ── Register builder types ──────────────────────────────────────────
// TBase = container state BEFORE this registration
// Name  = literal procedure name (or string for explicit <I,O> overload)
// I, O  = current external-facing types (updated by middleware chain)
// HasDefault = true if there is a default factory set in the container

type RegisterBuilderWithTypes<TBase extends Record<string, any>, Name extends string, I, O, HasDefault extends boolean = false> = {
    using(factory: HandlerFactory): TypedContainer<TBase & { [K in Name]: { input: I; output: O } }, true>;
    middleware<I2, O2>(mw: Middleware<I2, O2, I, O>): RegisterBuilderWithTypes<TBase, Name, I2, O2, HasDefault>;
} & (HasDefault extends true ? TypedContainer<TBase & { [K in Name]: { input: I; output: O } }, true> : {});

type CamelCaseRegisterBuilderWithTypes<TBase extends Record<string, any>, Name extends string, I, O, HasDefault extends boolean = false> = {
    using(factory: HandlerFactory): CamelCaseTypedContainer<TBase & { [K in Name]: { input: I; output: O } }, true>;
    middleware<I2, O2>(mw: Middleware<I2, O2, I, O>): CamelCaseRegisterBuilderWithTypes<TBase, Name, I2, O2, HasDefault>;
} & (HasDefault extends true ? CamelCaseTypedContainer<TBase & { [K in Name]: { input: I; output: O } }, true> : {});


// ── Container-like source ───────────────────────────────────────────

type ContainerLike<T extends Record<string, any>> = {
    readonly __$type: T;
    register(...args: any[]): any;
    execute<K extends keyof T>(
        name: K,
        input?: T[K]['input']
    ): Promise<T[K]['output']>;
    execute<I = any, O = any>(
        name: string,
        input?: I
    ): Promise<O>;
};

// ── Adapter method maps ─────────────────────────────────────────────

type AdapterMethods<T extends Record<string, any>> = {
    [K in keyof T]: (input?: T[K]['input']) => Promise<T[K]['output']>;
};

// ── TypedContainer (api) ────────────────────────────────────────────

type TypedContainer<T extends Record<string, any>, HasDefault extends boolean = false> = AdapterMethods<T> & {
    readonly __$type: T;
    register<Name extends string>(name: Name): RegisterBuilderWithTypes<T, Name, any, any, HasDefault>;
    register<I, O>(name: string): RegisterBuilderWithTypes<T, string, I, O, HasDefault>;
    middleware(mw: Middleware<any, any>): TypedContainer<T, HasDefault>;
    using(factory: HandlerFactory): TypedContainer<T, true>;
    execute<K extends keyof T>(
        name: K,
        input?: T[K]['input']
    ): Promise<T[K]['output']>;
    execute<I = any, O = any>(
        name: string,
        input?: I
    ): Promise<O>;
};

export function api<T extends Record<string, any>, HasDefault extends boolean = false>(
    source: ContainerLike<T>,
    globalMiddleware: Middleware<any, any>[] = [],
    globalFactory?: HandlerFactory
): TypedContainer<T, HasDefault> {
    const base = {
        execute: source.execute.bind(source),
        middleware: (mw: Middleware<any, any>) => {
            return api(source, [...globalMiddleware, mw], globalFactory);
        },
        using: (factory: HandlerFactory) => {
            return api(source, globalMiddleware, factory) as any;
        },
        register: (name: string) => {
            const builder = (source as any).register(name);

            const createChain = (middlewares: any[]): any => {
                const chain = {
                    using: (factory: HandlerFactory) => {
                        const allMiddlewares = [...globalMiddleware, ...middlewares];
                        let mwBuilder = builder;
                        if (allMiddlewares.length > 0) {
                            const composed = allMiddlewares.length === 1
                                ? allMiddlewares[0]
                                : compose(...allMiddlewares);
                            mwBuilder = builder.middleware(composed);
                        }
                        const nextSource = mwBuilder.using(factory);
                        return api(nextSource, globalMiddleware, globalFactory);
                    },
                    middleware: (mw: any) => createChain([...middlewares, mw])
                };

                if (globalFactory) {
                    return new Proxy(chain, {
                        get(target, prop: string) {
                            if (prop in target) return (target as any)[prop];
                            // Auto-register with globalFactory and delegate to resulting container
                            const nextContainer = chain.using(globalFactory);
                            return (nextContainer as any)[prop];
                        }
                    });
                }

                return chain;
            };

            return createChain([]);
        }
    };

    return new Proxy(base, {
        get(target, name: string) {
            if (name in target)
                return (target as any)[name];
            return (input?: any) => source.execute(name, input);
        }
    }) as TypedContainer<T, HasDefault>;
}


// ── CamelCaseTypedContainer (jscriptify) ────────────────────────────

type CamelCaseTypedContainer<T extends Record<string, any>, HasDefault extends boolean = false> = CamelCaseAdapterMethods<T> & {
    readonly __$type: T;
    register<Name extends string>(name: Name): CamelCaseRegisterBuilderWithTypes<T, Name, any, any, HasDefault>;
    register<I, O>(name: string): CamelCaseRegisterBuilderWithTypes<T, string, I, O, HasDefault>;
    middleware(mw: Middleware<any, any>): CamelCaseTypedContainer<T, HasDefault>;
    using(factory: HandlerFactory): CamelCaseTypedContainer<T, true>;
    execute<K extends keyof T>(
        name: K,
        input?: T[K]['input']
    ): Promise<T[K]['output']>;
    execute<I = any, O = any>(
        name: string,
        input?: I
    ): Promise<O>;
};

function camelToSnake(str: string): string {
    return str.replaceAll(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function jscriptify<T extends Record<string, any>, HasDefault extends boolean = false>(
    container: TypedContainer<T, HasDefault>
): CamelCaseTypedContainer<T, HasDefault> {
    const base = {
        execute: container.execute.bind(container),
        middleware: (mw: Middleware<any, any>) => {
            return jscriptify(container.middleware(mw));
        },
        using: (factory: HandlerFactory) => {
            return jscriptify(container.using(factory));
        },
        register: (name: string) => {
            const builder = container.register(name);

            const wrapBuilder = (b: any): any => {
                const inner = {
                    using: (factory: HandlerFactory) => {
                        return jscriptify(b.using(factory));
                    },
                    middleware: (mw: any) => wrapBuilder(b.middleware(mw))
                };

                return new Proxy(inner, {
                    get(target, prop: string) {
                        if (prop in target) return (target as any)[prop];

                        if (prop === 'register') {
                            return (name: string) => wrapBuilder(b.register(name));
                        }

                        const snakeCaseName = camelToSnake(prop);
                        return async (input?: any) => {
                            try {
                                return await b.execute(snakeCaseName, input);
                            } catch (error) {
                                if (snakeCaseName !== prop) {
                                    return await b.execute(prop, input);
                                }
                                throw error;
                            }
                        };
                    }
                });
            };

            return wrapBuilder(builder);
        }
    };

    return new Proxy(base, {
        get(target, prop: string) {
            if (prop in target) {
                return (target as any)[prop];
            }

            const snakeCaseName = camelToSnake(prop);

            return async (input?: any) => {
                try {
                    return await container.execute(snakeCaseName, input);
                } catch (error) {
                    if (snakeCaseName !== prop) {
                        return await container.execute(prop, input);
                    }
                    throw error;
                }
            };
        }
    }) as CamelCaseTypedContainer<T, HasDefault>;
}

