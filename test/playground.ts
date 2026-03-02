import { container, api, using, jscriptify, middleware } from '../src/index.js';
import type { Middleware } from '../src/index.js';
import { postgres } from './handlers';
import { Pool } from 'pg'

type Migration = {
    description: string;
    type: string;
    script: string;
}

// Middleware simple de prueba
const loggingMiddleware: Middleware = async (input, next, token) => {
    console.log('[Middleware] Before execution');
    const result = await next(input);
    console.log('[Middleware] After execution');
    return result;
};

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'postgres',
    port: 5432,
})

console.log('=== Ex 1: register(name).as<I, O>().using(factory) ===');
const c1 = api(container())
    .register('list_migration_history')
    .as<undefined, Migration[]>()
    .using(postgres(pool));
console.log((await c1.list_migration_history()).at(0)?.script);

console.log('\n=== Ex 2: register(name).as<any, any>().using(factory) ===');
const c2 = api(container())
    .register('list_migration_history')
    .as<any, any>()
    .using(postgres(pool));
console.log((await c2.list_migration_history()).at(0)?.script);

console.log('\n=== Ex 2.5: register(name).as<I, O>().middleware(mw).using(factory) ===');
const c25 = api(container())
    .register('list_migration_history')
    .as<undefined, Migration[]>()
    .middleware(loggingMiddleware)
    .using(postgres(pool));
console.log((await c25.list_migration_history()).at(0)?.script);

console.log('\n=== Ex 2.6: register(name).middleware(mw).as<I, O>().using(factory) ===');
const c26 = api(container())
    .register('list_migration_history')
    .middleware(loggingMiddleware)
    .as<undefined, Migration[]>()
    .using(postgres(pool));
console.log((await c26.list_migration_history()).at(0)?.script);

console.log('\n=== Ex 3: using(container, factory) with split register ===');
const c3 = using(api(container()), postgres(pool))
    .register('list_migration_history')
    .as<undefined, Migration[]>()
console.log((await c3.list_migration_history()).at(0)?.script);

console.log('\n=== Ex 3.5: using() with middleware ===');
const c35 = using(api(container()), postgres(pool))
    .register('list_migration_history')
    .middleware(loggingMiddleware)
    .as<undefined, Migration[]>()
console.log((await c35.list_migration_history()).at(0)?.script);

console.log('\n=== Ex 4: jscriptify - Access snake_case with camelCase ===');
const c4 = api(container())
    .register('list_migration_history')
    .as<undefined, Migration[]>()
    .using(postgres(pool));

const jsApi = jscriptify(c4);
const result = await jsApi.listMigrationHistory();
console.log(result.at(0)?.script);

if (result.length > 0) {
    console.log('First migration:', result[0].description);
}

console.log('\n=== Ex 5: middleware() - Global middleware ===');
const c5 = middleware(api(container()), loggingMiddleware)
    .register('list_migration_history')
    .as<undefined, Migration[]>()
    .using(postgres(pool));
console.log((await c5.list_migration_history()).at(0)?.script);

console.log('\n=== Ex 6: middleware() - Global + adicional middleware ===');
const timingMiddleware: Middleware = async (input, next, token) => {
    const start = Date.now();
    const result = await next(input);
    console.log(`[Timing] Executed in ${Date.now() - start}ms`);
    return result;
};

const c6 = middleware(api(container()), loggingMiddleware)
    .register('list_migration_history')
    .as<undefined, Migration[]>()
    .middleware(timingMiddleware)
    .using(postgres(pool));
console.log((await c6.list_migration_history()).at(0)?.script);

console.log('\n=== Ex 7: jscriptify with camelCase procedures ===');
// Mock handler que simula procedimientos en camelCase
const mockHandler = (name: string) => async (input: any) => {
    console.log(`Executing ${name}`);
    return { procedureName: name, input };
};

const c7 = api(container())
    .register('getUserData')  // camelCase en lugar de snake_case
    .as<number, any>()
    .using(mockHandler);

const jsApi7 = jscriptify(c7);
const result7 = await jsApi7.getUserData(123);
console.log(`Result: ${result7.procedureName}, input: ${result7.input}`);


const c8 = jscriptify(api(container()))
    .register('getUserData')
    .as<number, any>()
    .using(mockHandler);



const testMiddlewareTyping = async (input: { id: number, ignore: any }, next: (input: number) => Promise<any>, _: any): Promise<any> => {
    console.log('Middleware input:', input);
    return next(input.id);
}

console.log('\n=== Ex 9: Middleware with INPUT transformation ===');
const c9 = api(container())
    .register('getUserData')
    .as<number, any>()
    .middleware(testMiddlewareTyping)
    .using(mockHandler);

// El tipo de c9.getUserData ahora debería aceptar { id: number, ignore: any }
// NO solo number, porque el middleware transforma el tipo
const result9 = await c9.getUserData({ id: 456, ignore: 'ignored' });
console.log(`Result: ${result9.procedureName}, input: ${result9.input}`);

// Si intentáramos pasar solo un número, TypeScript debería dar error:
// const result9Wrong = await c9.getUserData(456); // ❌ Error: Expected { id, ignore }, got number

console.log('\n=== Ex 10: Middleware with OUTPUT transformation ===');
const outputTransformMiddleware: Middleware<number, string, number, any> = async (input, next, token) => {
    const result = await next(input);
    return `Transformed: ${JSON.stringify(result)}`;
};

const c10 = api(container())
    .register('processData')
    .as<number, any>()
    .middleware(outputTransformMiddleware)
    .using(mockHandler);

const result10 = await c10.processData(789);
console.log(`Output type is now string: ${result10}`);

console.log('\n=== Ex 11: Middleware CHAIN with chained .middleware() (Onion Pattern) ===');
type RequestPayload = { userId: number; metadata: string };
type ResponseData = { success: boolean; data: any };

// Middleware layers execute in onion pattern:
// Call: firstTransform → fullTransformMiddleware → handler → fullTransformMiddleware → firstTransform → Return

// Layer 1 (OUTER - closest to caller): defines external API signature
const firstTransform: Middleware<{ id: number, meta: string }, boolean, RequestPayload, ResponseData> = async (input, next, _) => {
    console.log('Chain transform - before full transform');
    const result: ResponseData = await next({
        userId: input.id,
        metadata: input.meta
    });
    console.log('Chain transform - after full transform');
    return result.success;
}

// Layer 2 (INNER - closer to handler): transforms for the handler
const fullTransformMiddleware: Middleware<RequestPayload, ResponseData, number, any> = async (input, next, token) => {
    console.log(`Full transform - received:`, input);
    const handlerResult = await next(input.userId);
    return {
        success: true,
        data: handlerResult
    };
};

const c11 = api(container())
    .register('fullTransform')
    .as<number, any>()  // Handler expects: number → any
    .middleware(fullTransformMiddleware)   // inner layer first
    .middleware(firstTransform)            // outer layer wraps it
    .using(mockHandler);

// External API signature (defined by firstTransform): { id: number, meta: string } → boolean
const result11 = await c11.fullTransform({ id: 999, meta: 'test' });
console.log(`Full transform result (boolean):`, result11);

console.log('\n=== Ex 12: Chained inline middleware functions ===');
// next se infiere automáticamente en cada capa gracias al encadenamiento

const c12 = api(container())
    .register('processUser')
    .as<number, { name: string; age: number }>()  // Handler types
    // Inner layer: closest to handler
    .middleware(async (input: { id: number }, next, _) => {
        const user = await next(input.id);  // next inferido: (number) => Promise<{ name, age }>
        return `${user.name} (${user.age})`;
    })
    // Outer layer: closest to caller
    .middleware(async (input: { userId: string; token: string }, next, _) => {
        if (input.token !== 'valid-token') throw new Error('Invalid token');
        const result = await next({ id: Number.parseInt(input.userId) });  // next inferido: ({ id }) => Promise<string>
        return result.toUpperCase();
    })
    .using((name) => async (userId: number) => ({
        name: `User${userId}`,
        age: 25 + userId
    }));

const result12 = await c12.processUser({ userId: '42', token: 'valid-token' });
console.log(`Processed user with chained middlewares: ${result12}`);

console.log('\n=== Ex 13: Three-layer middleware chain ===');

const c13 = api(container())
    .register('complexAuth')
    .as<number, string>()  // Handler: number → string
    // Layer 3 (innermost): Data transformation
    .middleware(async (input: number, next, _) => {
        console.log('Layer 3: Transforming...');
        const raw = await next(input);  // next: (number) => Promise<string>
        return raw.toUpperCase();
    })
    // Layer 2 (middle): Authorization check
    .middleware(async (input: { id: number; verified: boolean }, next, _) => {
        console.log('Layer 2: Authorizing...');
        if (!input.verified) throw new Error('Not verified');
        const data = await next(input.id);  // next: (number) => Promise<string>
        return `[${data}]`;
    })
    // Layer 1 (outermost): Authentication
    .middleware(async (input: { token: string; userId: string }, next, _) => {
        console.log('Layer 1: Authenticating...');
        if (input.token !== 'secret') throw new Error('Unauthorized');
        const result = await next({ id: Number.parseInt(input.userId), verified: true });  // next: ({ id, verified }) => Promise<string>
        return `AUTHENTICATED: ${result}`;
    })
    .using((name) => async (id: number) => `user_${id}`);

const result13 = await c13.complexAuth({ token: 'secret', userId: '99' });
console.log(`Complex auth result: ${result13}`);

console.log('\n=== Ex 14: Chained .middleware() - Inferencia automática! ===');
// Encadenar .middleware() de innermost a outermost.
// Cada llamada conoce los tipos del paso anterior → next siempre tipado.
const c14 = api(container())
    .register('variadicTest')
    .as<number, string>()  // Handler types: number → string
    // Layer 3 (innermost): next = handler → (number) => Promise<string>
    .middleware(async (input: number, next, _) => {
        console.log('Chained L3: Format');
        const result = await next(input);
        return `ID:${result}`;
    })
    // Layer 2: next = L3 → (number) => Promise<string>
    .middleware(async (input: number, next, _) => {
        console.log('Chained L2: Transform');
        return await next(input + 100);
    })
    // Layer 1 (outermost): next = L2 → (number) => Promise<string>
    .middleware(async (input: { token: string; userId: string }, next, _) => {
        console.log('Chained L1: Auth check');
        const authenticated = input.token === 'valid';
        if (!authenticated) throw new Error('Unauthorized');
        return await next(Number.parseInt(input.userId));
    })
    .using((name) => async (id: number) => `user_${id}`);

const result14 = await c14.variadicTest({ token: 'valid', userId: '42' });
console.log(`Variadic result: ${result14}`);

console.log('\n=== Ex 15: Verificar que TypeScript detecta errores de tipos ===');
const c15 = api(container())
    .register('typeCheckTest')
    .as<number, string>()
    // Middleware 2 (innermost): number → string (conecta con handler)
    .middleware(async (input: number, next, _) => {
        console.log('Adding 50 and formatting');
        const result = await next(input + 50);
        return `Result: ${result}`;
    })
    // Middleware 1 (outermost): string → number
    .middleware(async (input: string, next, _) => {
        console.log('Converting string to number');
        return await next(Number.parseInt(input));
    })
    .using((name) => async (n: number) => `value_${n}`);

// API externa acepta string, retorna string
const result15 = await c15.typeCheckTest('100');
console.log(result15);

console.log('\n=== Ex 16: Chained global middleware ===');
const authMiddleware: Middleware = async (input, next, _) => {
    console.log('[Auth] Checking credentials...');
    const result = await next(input);
    console.log('[Auth] Done');
    return result;
};

const c16 = middleware(api(container()), loggingMiddleware)
    .middleware(timingMiddleware)
    .middleware(authMiddleware)
    .register('getUserData')
    .as<number, any>()
    .using(mockHandler);

// Execution order: loggingMiddleware → timingMiddleware → authMiddleware → handler
const result16 = await c16.getUserData(42);
console.log(`Result: ${result16.procedureName}`);

console.log('\n=== Ex 17: Global + per-procedure chained middleware ===');
const c17 = middleware(api(container()), loggingMiddleware)
    .middleware(timingMiddleware)
    .register('processOrder')
    .as<number, string>()
    // Per-procedure middleware chain on top of globals
    .middleware(async (input: number, next, _) => {
        const raw = await next(input);
        return raw.toUpperCase();
    })
    .middleware(async (input: { orderId: number; priority: string }, next, _) => {
        console.log(`[Priority: ${input.priority}]`);
        return await next(input.orderId);
    })
    .using((name) => async (id: number) => `order_${id}`);

// Execution: loggingMw → timingMw → priority mw → uppercase mw → handler
const result17 = await c17.processOrder({ orderId: 7, priority: 'high' });
console.log(`Order result: ${result17}`);

await pool.end();


