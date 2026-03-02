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

type CamelCaseRegisterBuilder<T extends Record<string, any>, Name extends string> = {
    as<I, O>(): CamelCaseRegisterBuilderWithTypes<T, Name, I, O>;
    middleware(mw: Middleware<any, any>): CamelCaseRegisterBuilderWithMiddleware<T, Name>;
};

type CamelCaseRegisterBuilderWithTypes<T extends Record<string, any>, Name extends string, I, O> = {
    using(factory: HandlerFactory): CamelCaseTypedContainer<T & { [K in Name]: { input: I; output: O } }>;
    middleware<I2, O2>(mw: Middleware<I2, O2, I, O>): CamelCaseRegisterBuilderChain<T, Name, I2, O2>;
};

type CamelCaseRegisterBuilderChain<T extends Record<string, any>, Name extends string, I, O> = {
    using(factory: HandlerFactory): CamelCaseTypedContainer<T & { [K in Name]: { input: I; output: O } }>;
    middleware<I2, O2>(mw: Middleware<I2, O2, I, O>): CamelCaseRegisterBuilderChain<T, Name, I2, O2>;
};

type CamelCaseRegisterBuilderWithMiddleware<T extends Record<string, any>, Name extends string> = {
    as<I, O>(): CamelCaseRegisterBuilderComplete<T, Name, I, O>;
    using(factory: HandlerFactory): CamelCaseTypedContainer<T & { [K in Name]: { input: any; output: any } }>;
};

type CamelCaseRegisterBuilderComplete<T extends Record<string, any>, Name extends string, I, O> = {
    using(factory: HandlerFactory): CamelCaseTypedContainer<T & { [K in Name]: { input: I; output: O } }>;
};

type CamelCaseTypedContainer<T extends Record<string, any>> = CamelCaseAdapterMethods<T> & {
    register<Name extends string>(name: Name): CamelCaseRegisterBuilder<T, Name>;
    as<I, O, LastKey extends string = string>(): CamelCaseTypedContainer<
        Omit<T, LastKey> & { [K in LastKey]: { input: I; output: O } }
    >;
    execute<K extends keyof T>(
        name: K,
        input?: T[K]['input']
    ): Promise<T[K]['output']>;
    execute<I = any, O = any>(
        name: string,
        input?: I
    ): Promise<O>;
};

type RegisterBuilder<T extends Record<string, any>, Name extends string> = {
    as<I, O>(): RegisterBuilderWithTypes<T, Name, I, O>;
    middleware(mw: Middleware<any, any>): RegisterBuilderWithMiddleware<T, Name>;
};

type RegisterBuilderWithTypes<T extends Record<string, any>, Name extends string, I, O> = {
    using(factory: HandlerFactory): TypedContainer<T & { [K in Name]: { input: I; output: O } }>;
    middleware<I2, O2>(mw: Middleware<I2, O2, I, O>): RegisterBuilderChain<T, Name, I2, O2>;
};

type RegisterBuilderChain<T extends Record<string, any>, Name extends string, I, O> = {
    using(factory: HandlerFactory): TypedContainer<T & { [K in Name]: { input: I; output: O } }>;
    middleware<I2, O2>(mw: Middleware<I2, O2, I, O>): RegisterBuilderChain<T, Name, I2, O2>;
};

type RegisterBuilderWithMiddleware<T extends Record<string, any>, Name extends string> = {
    as<I, O>(): RegisterBuilderComplete<T, Name, I, O>;
    using(factory: HandlerFactory): TypedContainer<T & { [K in Name]: { input: any; output: any } }>;
};

type RegisterBuilderComplete<T extends Record<string, any>, Name extends string, I, O> = {
    using(factory: HandlerFactory): TypedContainer<T & { [K in Name]: { input: I; output: O } }>;
};

type ContainerLike<T extends Record<string, any>> = {
    register(...args: any[]): any;
    as?: (...args: any[]) => any;
    execute<K extends keyof T>(
        name: K,
        input?: T[K]['input']
    ): Promise<T[K]['output']>;
    execute<I = any, O = any>(
        name: string,
        input?: I
    ): Promise<O>;
};

type AdapterMethods<T extends Record<string, any>> = {
    [K in keyof T]: (input?: T[K]['input']) => Promise<T[K]['output']>;
};

type TypedContainer<T extends Record<string, any>> = AdapterMethods<T> & {
    register<Name extends string>(name: Name): RegisterBuilder<T, Name>;
    as<I, O, LastKey extends string = string>(): TypedContainer<
        Omit<T, LastKey> & { [K in LastKey]: { input: I; output: O } }
    >;
    execute<K extends keyof T>(
        name: K,
        input?: T[K]['input']
    ): Promise<T[K]['output']>;
    execute<I = any, O = any>(
        name: string,
        input?: I
    ): Promise<O>;
};


export function api<T extends Record<string, any>>(
    source: ContainerLike<T>
): TypedContainer<T> {
    const base = {
        execute: source.execute.bind(source),
        register: <Name extends string>(name: Name): RegisterBuilder<T, Name> => {
            const builder = (source as any).register(name);
            return {
                // @ts-expect-error - Implementation types are erased at runtime; overloads provide type safety
                as: <I, O>() => {
                    const typedBuilder = builder.as();

                    const createChain = (middlewares: any[]): any => ({
                        using: (factory: HandlerFactory) => {
                            const composed = middlewares.length === 1
                                ? middlewares[0]
                                : compose(...middlewares);
                            const mwBuilder = typedBuilder.middleware(composed);
                            return api(mwBuilder.using(factory));
                        },
                        middleware: (mw: any) => createChain([mw, ...middlewares])
                    });

                    return {
                        using: (factory: HandlerFactory) => {
                            const newContainer = typedBuilder.using(factory);
                            return api(newContainer);
                        },
                        middleware: (mw: any) => createChain([mw])
                    };
                },
                middleware: (mw: Middleware<any, any>) => {
                    const mwBuilder = builder.middleware(mw);
                    return {
                        // @ts-expect-error - Los parámetros de tipo se usan en el tipo de retorno, no en la implementación
                        as: <I, O>() => {
                            const completeBuilder = mwBuilder.as();
                            return {
                                using: (factory: HandlerFactory) => {
                                    const newContainer = completeBuilder.using(factory);
                                    return api(newContainer);
                                }
                            };
                        },
                        using: (factory: HandlerFactory) => {
                            const newContainer = mwBuilder.using(factory);
                            return api(newContainer);
                        }
                    };
                }
            };
        },
        as: ((...typeArgs: any[]) => {
            // Delega al método as del source si existe
            const result = source.as ? (source as any).as(...typeArgs) : source;
            return api(result);
        }) as any
    };

    return new Proxy(base, {
        get(target, name: string) {
            if (name in target)
                return (target as any)[name];
            return (input?: any) => source.execute(name, input);
        }
    }) as TypedContainer<T>;
}


type DefaultRegisterBuilder<T extends Record<string, any>, Name extends string> = {
    as<I, O>(): TypedContainerWithDefault<T & { [K in Name]: { input: I; output: O } }>;
    middleware(mw: Middleware<any, any>): DefaultRegisterBuilderWithMiddleware<T, Name>;
};

type DefaultRegisterBuilderWithMiddleware<T extends Record<string, any>, Name extends string> = {
    as<I, O>(): TypedContainerWithDefault<T & { [K in Name]: { input: I; output: O } }>;
};

type TypedContainerWithDefault<T extends Record<string, any>> = AdapterMethods<T> & {
    register<Name extends string>(name: Name): DefaultRegisterBuilder<T, Name>;
    as<I, O, LastKey extends string = string>(): TypedContainerWithDefault<
        Omit<T, LastKey> & { [K in LastKey]: { input: I; output: O } }
    >;
    execute<K extends keyof T>(
        name: K,
        input?: T[K]['input']
    ): Promise<T[K]['output']>;
    execute<I = any, O = any>(
        name: string,
        input?: I
    ): Promise<O>;
};


export function using<T extends Record<string, any>>(
    source: ContainerLike<T>,
    defaultFactory: HandlerFactory
): TypedContainerWithDefault<T> {
    const base = {
        execute: source.execute.bind(source),
        register: <Name extends string>(name: Name): DefaultRegisterBuilder<T, Name> => {
            const builder = (source as any).register(name);
            return {
                // @ts-expect-error - Los parámetros de tipo se usan en el tipo de retorno, no en la implementación
                as: <I, O>() => {
                    const typedBuilder = builder.as();
                    const newContainer = typedBuilder.using(defaultFactory);
                    return using(newContainer, defaultFactory);
                },
                middleware: (mw: Middleware<any, any>) => {
                    const mwBuilder = builder.middleware(mw);
                    return {
                        // @ts-expect-error - Los parámetros de tipo se usan en el tipo de retorno, no en la implementación
                        as: <I, O>() => {
                            const completeBuilder = mwBuilder.as();
                            const newContainer = completeBuilder.using(defaultFactory);
                            return using(newContainer, defaultFactory);
                        }
                    };
                }
            };
        },
        as: ((...typeArgs: any[]) => {
            const result = source.as ? (source as any).as(...typeArgs) : source;
            return using(result, defaultFactory);
        }) as any
    };

    return new Proxy(base, {
        get(target, name: string) {
            if (name in target) {
                return (target as any)[name];
            }
            return (input?: any) => source.execute(name, input);
        }
    }) as TypedContainerWithDefault<T>;
}

function camelToSnake(str: string): string {
    return str.replaceAll(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function jscriptify<T extends Record<string, any>>(container: TypedContainer<T>): CamelCaseTypedContainer<T> {
    const base = {
        execute: container.execute.bind(container),
        register: <Name extends string>(name: Name): CamelCaseRegisterBuilder<T, Name> => {
            const builder = container.register(name);
            return {
                as: <I, O>() => {
                    const typedBuilder = builder.as<I, O>();

                    const createChain = (middlewares: any[]): any => ({
                        using: (factory: HandlerFactory) => {
                            const composed = middlewares.length === 1
                                ? middlewares[0]
                                : compose(...middlewares);
                            const mwBuilder = typedBuilder.middleware(composed);
                            return jscriptify(mwBuilder.using(factory));
                        },
                        middleware: (mw: any) => createChain([mw, ...middlewares])
                    });

                    return {
                        using: (factory: HandlerFactory) => {
                            const newContainer = typedBuilder.using(factory);
                            return jscriptify(newContainer);
                        },
                        middleware: (mw: any) => createChain([mw])
                    };
                },
                middleware: (mw: Middleware<any, any>) => {
                    const mwBuilder = builder.middleware(mw);
                    return {
                        // @ts-expect-error - Los parámetros de tipo se usan en el tipo de retorno, no en la implementación
                        as: <I, O>() => {
                            const completeBuilder = mwBuilder.as();
                            return {
                                using: (factory: HandlerFactory) => {
                                    const newContainer = completeBuilder.using(factory);
                                    return jscriptify(newContainer);
                                }
                            };
                        },
                        using: (factory: HandlerFactory) => {
                            const newContainer = mwBuilder.using(factory);
                            return jscriptify(newContainer);
                        }
                    };
                }
            };
        },
        as: (() => {
            // Delega al método as del container si existe
            const result = (container as any).as ? (container as any).as() : container;
            return jscriptify(result);
        }) as any
    };

    return new Proxy(base, {
        get(target, prop: string) {
            if (prop in target) {
                return (target as any)[prop];
            }

            if (typeof prop !== 'string') return undefined;

            const snakeCaseName = camelToSnake(prop);

            return async (input?: any) => {
                // Intenta con snake_case primero (caso común para bases de datos)
                try {
                    return await container.execute(snakeCaseName, input);
                } catch (error) {
                    // Si falla y hay conversión, intenta con el nombre original (camelCase)
                    if (snakeCaseName !== prop) {
                        return await container.execute(prop, input);
                    }
                    // Si no hay conversión posible, re-lanza el error
                    throw error;
                }
            };
        }
    }) as CamelCaseTypedContainer<T>;
}


type MiddlewareRegisterBuilder<T extends Record<string, any>, Name extends string> = {
    as<I, O>(): MiddlewareRegisterBuilderWithTypes<T, Name, I, O>;
    middleware(mw: Middleware<any, any>): MiddlewareRegisterBuilderWithMiddleware<T, Name>;
};

type MiddlewareRegisterBuilderWithTypes<T extends Record<string, any>, Name extends string, I, O> = {
    using(factory: HandlerFactory): TypedContainerWithMiddleware<T & { [K in Name]: { input: I; output: O } }>;
    middleware<I2, O2>(mw: Middleware<I2, O2, I, O>): MiddlewareRegisterBuilderChain<T, Name, I2, O2>;
};

type MiddlewareRegisterBuilderChain<T extends Record<string, any>, Name extends string, I, O> = {
    using(factory: HandlerFactory): TypedContainerWithMiddleware<T & { [K in Name]: { input: I; output: O } }>;
    middleware<I2, O2>(mw: Middleware<I2, O2, I, O>): MiddlewareRegisterBuilderChain<T, Name, I2, O2>;
};

type MiddlewareRegisterBuilderWithMiddleware<T extends Record<string, any>, Name extends string> = {
    as<I, O>(): MiddlewareRegisterBuilderComplete<T, Name, I, O>;
};

type MiddlewareRegisterBuilderComplete<T extends Record<string, any>, Name extends string, I, O> = {
    using(factory: HandlerFactory): TypedContainerWithMiddleware<T & { [K in Name]: { input: I; output: O } }>;
};

type TypedContainerWithMiddleware<T extends Record<string, any>> = AdapterMethods<T> & {
    register<Name extends string>(name: Name): MiddlewareRegisterBuilder<T, Name>;
    middleware(mw: Middleware<any, any>): TypedContainerWithMiddleware<T>;
    as<I, O, LastKey extends string = string>(): TypedContainerWithMiddleware<
        Omit<T, LastKey> & { [K in LastKey]: { input: I; output: O } }
    >;
    execute<K extends keyof T>(
        name: K,
        input?: T[K]['input']
    ): Promise<T[K]['output']>;
    execute<I = any, O = any>(
        name: string,
        input?: I
    ): Promise<O>;
};


export function middleware<T extends Record<string, any>>(
    source: ContainerLike<T>,
    defaultMiddleware: Middleware<any, any>
): TypedContainerWithMiddleware<T> {
    const base = {
        execute: source.execute.bind(source),
        middleware: (mw: Middleware<any, any>) => {
            return middleware(source, compose(defaultMiddleware, mw));
        },
        register: <Name extends string>(name: Name): MiddlewareRegisterBuilder<T, Name> => {
            const builder = (source as any).register(name);
            return {
                // @ts-expect-error - Implementation types are erased at runtime; overloads provide type safety
                as: <I, O>() => {
                    const typedBuilder = builder.as();

                    const createChain = (middlewares: any[]): any => ({
                        using: (factory: HandlerFactory) => {
                            const composed = compose(defaultMiddleware, ...middlewares);
                            const mwBuilder = typedBuilder.middleware(composed);
                            const newContainer = mwBuilder.using(factory);
                            return middleware(newContainer, defaultMiddleware);
                        },
                        middleware: (mw: any) => createChain([mw, ...middlewares])
                    });

                    return {
                        using: (factory: HandlerFactory) => {
                            const withMwBuilder = typedBuilder.middleware(defaultMiddleware);
                            const newContainer = withMwBuilder.using(factory);
                            return middleware(newContainer, defaultMiddleware);
                        },
                        middleware: (mw: any) => createChain([mw])
                    };
                },
                middleware: (mw: Middleware<any, any>) => {
                    const combinedMw = compose(defaultMiddleware, mw);
                    const mwBuilder = builder.middleware(combinedMw);
                    return {
                        // @ts-expect-error - Los parámetros de tipo se usan en el tipo de retorno, no en la implementación
                        as: <I, O>() => {
                            const completeBuilder = mwBuilder.as();
                            return {
                                using: (factory: HandlerFactory) => {
                                    const newContainer = completeBuilder.using(factory);
                                    return middleware(newContainer, defaultMiddleware);
                                }
                            };
                        }
                    };
                }
            };
        },
        as: ((...typeArgs: any[]) => {
            const result = source.as ? (source as any).as(...typeArgs) : source;
            return middleware(result, defaultMiddleware);
        }) as any
    };

    return new Proxy(base, {
        get(target, name: string) {
            if (name in target) {
                return (target as any)[name];
            }
            return (input?: any) => source.execute(name, input);
        }
    }) as TypedContainerWithMiddleware<T>;
}
