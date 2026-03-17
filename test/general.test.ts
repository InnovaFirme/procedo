import {api, container, Container} from "../src";
import {describe, expect, it} from "vitest";


describe("Api types with parameters", () => {


    let c = api(container())
        .using((name) => {
            return async (_, __) => name
        })


    function decorator(_c: Container) {

        let temp = _c
            .register<unknown, string>('testing_snake')
            .middleware(async (i, next,) => next(i))

        return temp.testingSnake()
    }

    it('should return testing without error types', async () => {
        let r2 = await decorator(c);
        expect(r2).equal('testing_snake');
    });
})






