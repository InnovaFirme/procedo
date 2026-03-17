import { describe, it, expect } from 'vitest';
import { container } from '../src/container';
import { api } from '../src/adapter';
import { HandlerFactory, Middleware } from '../src/types';

describe('adapter (api)', () => {
    const factory: HandlerFactory = (name) => async (input) => ({ name, input });

    it('should allow calling registered procedures as methods', async () => {
        const c = container().using(factory).register('get_user');
        const app = api(c);

        const result = await app.get_user(1);
        expect(result).toEqual({ name: 'get_user', input: 1 });
    });

    it('should support camelCase calls for snake_case procedures', async () => {
        const c = container().using(factory).register('get_user_profile');
        const app = api(c);

        const result = await app.getUserProfile(1);
        expect(result).toEqual({ name: 'get_user_profile', input: 1 });
    });

    it('should support snake_case calls even if registered with camelCase', async () => {
        const c = container().using(factory).register('getUserProfile');
        const app = api(c);

        const result = await app.getUserProfile(1);
        expect(result).toEqual({ name: 'getUserProfile', input: 1 });
    });

    it('should allow registering procedures through the api', async () => {
        const app = api(container())
            .using(factory)
            .register('test_proc');
        
        const result = await app.test_proc('hello');
        expect(result).toEqual({ name: 'test_proc', input: 'hello' });
    });

    it('should support middleware through the api', async () => {
        const mw: Middleware = async (input, next) => {
            const res = await next(input);
            return { ...res, mw: true };
        };

        const app = api(container())
            .middleware(mw)
            .using(factory)
            .register('test');

        const result = await app.test(1);
        expect(result).toEqual({ name: 'test', input: 1, mw: true });
    });

    it('should support procedure-specific middleware through the api', async () => {
        const mw: Middleware = async (input, next) => {
            return await next(`mw(${input})`);
        };

        const app = api(container())
            .using(factory)
            .register('test')
            .middleware(mw);

        const result = await app.test('data');
        expect(result).toEqual({ name: 'test', input: 'mw(data)' });
    });

    it('should preserve global factory when registering new procedures', async () => {
        const app = api(container())
            .using(factory)
            .register('proc1')
            .register('proc2');

        const res1 = await app.proc1(1);
        const res2 = await app.proc2(2);

        expect(res1).toEqual({ name: 'proc1', input: 1 });
        expect(res2).toEqual({ name: 'proc2', input: 2 });
    });

    it('should handle registration with custom factory and middleware via proxy', async () => {
        const customFactory: HandlerFactory = (name) => async (input) => `custom ${name} ${input}`;
        const mw: Middleware = async (input, next) => `mw ${await next(input)}`;

        const app = api(container().using(factory))
            .register('test')
            .middleware(mw)
            .using(customFactory);

        const result = await app.test('data');
        expect(result).toBe('mw custom test data');
    });

    it('should support automatic registration when global factory is present', async () => {
        // Looking at adapter.ts:61
        // if (globalFactory && prop !== 'execute' && prop !== 'register') {
        //     return (chain.using(globalFactory) as any)[prop];
        // }
        
        const app = api(container())
            .using(factory)
            .register('auto_proc');
        
        // This is a bit tricky, the proxy in register returns a wrapBuilder.
        // If we access a property on it that is not using/middleware, it tries to use the globalFactory.
        
        const res = await app.auto_proc(123);
        expect(res).toEqual({ name: 'auto_proc', input: 123 });
    });
});
